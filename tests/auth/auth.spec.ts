import { test, expect } from "@playwright/test";
import { createTestClient, createTestUser, deleteTestUser, findTestUserId, getTestAdmin, newTestUser } from "../support/local-supabase";

const admin = getTestAdmin();

// Local configuration disables confirmation; email/token callbacks are tested separately.
test("registration, persistent roster, sign-out, sign-in, and password update", async ({ page }) => {
  const user = newTestUser("auth");
  const { email, password } = user;
  try {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/sign-up");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "My Roster" })).toBeVisible();
    user.id = await findTestUserId(email);
    expect(user.id).toBeTruthy();
    const first = await admin.from("rosters").select("id").eq("user_id", user.id!).single();
    expect(first.error).toBeNull();
    await page.reload();
    await expect(page.getByRole("heading", { name: "My Roster" })).toBeVisible();
    const again = await admin.from("rosters").select("id").eq("user_id", user.id!);
    expect(again.data).toEqual([first.data]);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText("Unable to sign in");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/update-password");
    await page.getByLabel("Password", { exact: true }).fill(password + "new");
    await page.getByLabel("Confirm password", { exact: true }).fill("does-not-match");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("Passwords do not match");
    await page.getByLabel("Password", { exact: true }).fill(password + "new");
    await page.getByLabel("Confirm password", { exact: true }).fill(password + "new");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByRole("status").filter({hasText: 'password has been updated'})).toHaveText("Your password has been updated.");
    const verification = createTestClient();
    expect((await verification.auth.signInWithPassword({ email, password: password + "new" })).error).toBeNull();
    await verification.auth.signOut();
  } finally {
    await deleteTestUser(user);
  }
});

test("email verification and recovery tokens, invalid links, and safe redirects", async ({ page }) => {
  const user = await createTestUser("links");
  const { email } = user;
  try {
    await page.goto("/reset-password");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If an account exists");
    const recovery = await admin.auth.admin.generateLink({ type: "recovery", email });
    expect(recovery.error).toBeNull();
    await page.goto(`/auth/confirm?token_hash=${recovery.data.properties!.hashed_token}&type=recovery`);
    await expect(page).toHaveURL(/\/update-password$/);
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    const confirmation = await admin.auth.admin.generateLink({ type: "magiclink", email });
    expect(confirmation.error).toBeNull();
    await page.goto(`/auth/confirm?token_hash=${confirmation.data.properties!.hashed_token}&type=email`);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "My Roster" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/update-password");
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/auth/confirm?token_hash=invalid&type=recovery");
    await expect(page).toHaveURL(/\/auth\/link-error$/);
    await page.goto("/auth/callback?next=https://example.com");
    await expect(page).toHaveURL(/\/auth\/link-error$/);
  } finally {
    await deleteTestUser(user);
  }
});
