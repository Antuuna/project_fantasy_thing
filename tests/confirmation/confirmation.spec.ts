import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { deleteTestUser, findTestUserId, getLocalSupabasePublicConfig, getTestAdmin, newTestUser } from "../support/local-supabase";

const mailOrigin = "http://127.0.0.1:54324";
const appOrigin = "http://localhost:3101";
type MailSummary = { ID: string; To: { Address: string }[] };
type MailMessage = MailSummary & { HTML: string; Text: string };

function requireConfirmationStack() {
  getLocalSupabasePublicConfig();
  if (process.env.E2E_CONFIRMATION !== "1") throw new Error("Use the dedicated confirmation-enabled local test runner.");
  let status;
  try {
    status = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }));
  } catch { throw new Error("The local confirmation test stack is unavailable."); }
  if (status.INBUCKET_URL !== mailOrigin) throw new Error("Confirmation tests require the approved local mail viewer.");
}

async function messageSummaries(request: APIRequestContext, email: string): Promise<MailSummary[]> {
  const response = await request.get(`${mailOrigin}/api/v1/search`, { params: { query: `to:${email}`, limit: 20 } });
  if (!response.ok()) throw new Error("Unable to inspect the local test mailbox.");
  const data = await response.json();
  return (data.messages as MailSummary[]).filter(message => message.To.some(recipient => recipient.Address === email));
}

function verificationLink(message: MailMessage, type: "signup" | "recovery") {
  const links = [...message.HTML.matchAll(/href=["']([^"']+)["']/g)].map(match => match[1].replaceAll("&amp;", "&"));
  for (const link of links) {
    let url;
    try { url = new URL(link); } catch { continue; }
    if (url.origin !== "http://127.0.0.1:54321" || url.pathname !== "/auth/v1/verify" || url.searchParams.get("type") !== type) continue;
    const target = new URL(url.searchParams.get("redirect_to") ?? "http://invalid.local");
    if (target.origin !== appOrigin || target.pathname !== "/auth/callback" ||
        target.searchParams.get("next") !== (type === "recovery" ? "/update-password" : null)) {
      throw new Error("Local auth email has an unexpected callback destination.");
    }
    return url.toString();
  }
  throw new Error("Expected local verification link is absent from the test email.");
}

async function deliveredLink(request: APIRequestContext, email: string, type: "signup" | "recovery", seen: Set<string>) {
  let link: string | undefined;
  await expect.poll(async () => {
    for (const summary of await messageSummaries(request, email)) {
      if (seen.has(summary.ID)) continue;
      const response = await request.get(`${mailOrigin}/api/v1/message/${encodeURIComponent(summary.ID)}`);
      if (!response.ok()) throw new Error("Unable to read the local test email.");
      const message = await response.json() as MailMessage;
      // Only recipient-specific IDs are tracked/deleted; never clear the mailbox.
      seen.add(message.ID);
      link = verificationLink(message, type);
      if (link) return true;
    }
    return false;
  }, { timeout: 15_000, message: "Expected real auth email to arrive in the local mail viewer." }).toBe(true);
  return link!;
}

async function followSecretLink(page: Page, link: string, destination: string) {
  // Avoid putting token-bearing URLs into Playwright navigation assertion logs.
  try { await page.evaluate(value => { window.location.assign(value); }, link); }
  catch { throw new Error("Unable to open the local auth email link."); }
  await expect.poll(() => new URL(page.url()).pathname, {
    timeout: 15_000, message: "The local email callback did not reach its expected destination.",
  }).toBe(destination);
}

test("confirmation-enabled signup and recovery consume real local email links using same-browser PKCE", async ({ page }) => {
  test.setTimeout(60_000);
  requireConfirmationStack();
  const user = newTestUser("confirmation-mail");
  const seen = new Set<string>();
  let pkceCallbacks = 0;
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin === appOrigin && url.pathname === "/auth/callback" && url.searchParams.has("code")) pkceCallbacks++;
  });
  try {
    const local = getLocalSupabasePublicConfig();
    const settings = await page.request.get(`${local.url}/auth/v1/settings`, { headers: { apikey: local.publishableKey } });
    expect(settings.ok()).toBe(true);
    expect((await settings.json()).mailer_autoconfirm).toBe(false);
    await page.goto("/sign-up");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByLabel("Confirm password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.locator("p[role=status]")).toContainText("Check your email for a confirmation link");
    expect(new URL(page.url()).pathname).toBe("/sign-up");
    user.id = await findTestUserId(user.email);
    expect(Boolean(user.id)).toBe(true);
    const before = await getTestAdmin().auth.admin.getUserById(user.id!);
    expect(before.error).toBeNull();
    expect(Boolean(before.data.user)).toBe(true);
    expect(Boolean(before.data.user?.email_confirmed_at)).toBe(false);
    await page.goto("/dashboard");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/sign-in");
    const signupLink = await deliveredLink(page.request, user.email, "signup", seen);
    await followSecretLink(page, signupLink, "/dashboard");
    expect(pkceCallbacks).toBe(1);
    await expect(page.getByRole("heading", { name: "My Roster", exact: true })).toBeVisible();
    const confirmed = await getTestAdmin().auth.admin.getUserById(user.id!);
    expect(confirmed.error).toBeNull();
    expect(Boolean(confirmed.data.user)).toBe(true);
    expect(Boolean(confirmed.data.user?.email_confirmed_at)).toBe(true);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/sign-in");
    await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
    await page.goto("/reset-password");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByRole("button", { name: "Send reset link", exact: true }).click();
    await expect(page.locator("p[role=status]")).toContainText("If an account exists");
    const recoveryLink = await deliveredLink(page.request, user.email, "recovery", seen);
    await followSecretLink(page, recoveryLink, "/update-password");
    expect(pkceCallbacks).toBe(2);
    await expect(page.getByRole("heading", { name: "Choose a new password", exact: true })).toBeVisible();
    const newPassword = `${user.password}-updated`;
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Save password", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your password has been updated." })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/sign-in");
    await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/dashboard");
    await expect(page.getByRole("heading", { name: "My Roster", exact: true })).toBeVisible();
  } finally {
    try {
      // Search again so even mail received before an earlier failed assertion is
      // cleaned. Guard nonempty IDs: Mailpit interprets an empty list as delete-all.
      for (const message of await messageSummaries(page.request, user.email)) seen.add(message.ID);
      if (seen.size) {
        const response = await page.request.delete(`${mailOrigin}/api/v1/messages`, { data: { IDs: [...seen] } });
        if (!response.ok()) throw new Error("Unable to clean up recipient-specific local test emails.");
      }
    } finally { await deleteTestUser(user); }
  }
});
