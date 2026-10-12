import { test, expect, type Page, type Request } from "@playwright/test";
import { createTestUser, deleteTestUser, getTestAdmin } from "../support/local-supabase";
import { fixturePlayers, signIn, type FixturePlayer } from "../support/browser";

const admin = getTestAdmin();
test.setTimeout(90_000);

async function memberships(userId: string) {
  const result = await admin.from("roster_members").select("player_id").eq("user_id", userId).order("player_id").limit(12);
  expect(result.error).toBeNull();
  return result.data!.map(row => row.player_id as number);
}

async function watched(userId: string) {
  const result = await admin.from("watchlist_entries").select("id,player_id,notes,created_at,updated_at")
    .eq("user_id", userId).order("player_id").limit(12);
  expect(result.error).toBeNull();
  return result.data!;
}

async function addPlayer(page: Page, player: FixturePlayer) {
  await page.goto(`/players/${player.id}`);
  await page.getByRole("button", { name: "Add to roster", exact: true }).click();
}

function actionHeaders(request: Request) {
  const headers = request.headers();
  return Object.fromEntries(["next-action", "content-type", "accept", "origin", "referer"]
    .filter(name => headers[name]).map(name => [name, headers[name]]));
}

function editActionForm(request: Request, field: string, value: string, additions: Record<string, string> = {}) {
  const contentType = request.headers()["content-type"];
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean);
  if (!boundary) throw new Error("Expected multipart server-action request.");
  let body = request.postDataBuffer()!.toString("utf8");
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(name="([^"\\r\\n]*${escapedField})"\\r\\n\\r\\n)[^\\r\\n]*`);
  const match = body.match(expression);
  if (!match) throw new Error("Expected mutation form field absent from server-action request.");
  const prefix = match[2].slice(0, -field.length);
  body = body.replace(expression, (_whole, header) => header + value);
  const extra = Object.entries(additions).map(([name, content]) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${prefix}${name}"\r\n\r\n${content}\r\n`).join("");
  return body.replace(`--${boundary}--`, `${extra}--${boundary}--`);
}

test("roster search, duplicate rejection, name bounds, persistent removal, and ten-player capacity", async ({ page }) => {
  const user = await createTestUser("roster-flow");
  try {
    const players = await fixturePlayers(11);
    await signIn(page, user);
    await page.goto("/players");
    await page.getByLabel("Search players", { exact: true }).fill(players[0].full_name);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("link", { name: players[0].full_name, exact: true }).click();
    await page.getByRole("button", { name: "Add to roster", exact: true }).click();
    await expect.poll(() => memberships(user.id)).toEqual([players[0].id]);
    await page.getByRole("button", { name: "Add to roster", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText(/already/i);
    await expect.poll(() => memberships(user.id)).toEqual([players[0].id]);
    await page.goto("/dashboard");
    await expect(page.getByText("1 / 10 players", { exact: true })).toBeVisible();
    const rosterName = "R".repeat(80);
    await page.getByLabel("Roster name", { exact: true }).fill(rosterName);
    await page.getByRole("button", { name: "Rename roster", exact: true }).click();
    await expect(page.getByRole("heading", { name: rosterName, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Roster name", { exact: true })).toHaveValue(rosterName);
    await page.getByLabel("Roster name", { exact: true }).evaluate(element => element.removeAttribute("maxlength"));
    await page.getByLabel("Roster name", { exact: true }).fill("R".repeat(81));
    await page.getByRole("button", { name: "Rename roster", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText(/80/);
    await page.reload();
    await expect(page.getByRole("heading", { name: rosterName, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Remove from roster", exact: true }).click();
    await expect(page.getByText("0 / 10 players", { exact: true })).toBeVisible();
    await page.reload();
    expect(await memberships(user.id)).toEqual([]);
    for (const player of players.slice(0, 10)) {
      await addPlayer(page, player);
      await expect.poll(async () => (await memberships(user.id)).includes(player.id)).toBe(true);
    }
    await addPlayer(page, players[10]);
    await expect(page.locator("p[role=alert]")).toContainText(/ten|10|full|capacity/i);
    expect(await memberships(user.id)).toEqual(players.slice(0, 10).map(player => player.id).sort((a, b) => a - b));
    await page.goto("/dashboard");
    await page.reload();
    await expect(page.getByText("10 / 10 players", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove from roster", exact: true })).toHaveCount(10);
  } finally {
    await deleteTestUser(user);
  }
});

test("watchlist notes persist, enforce bounds, survive session changes and roster addition, and remove", async ({ page }) => {
  const user = await createTestUser("watchlist-flow");
  try {
    const [player] = await fixturePlayers(1);
    await signIn(page, user);
    await page.goto(`/players/${player.id}`);
    await page.getByRole("button", { name: "Add to watchlist", exact: true }).click();
    await expect.poll(async () => (await watched(user.id)).length).toBe(1);
    await page.getByRole("button", { name: "Add to watchlist", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText(/already/i);
    expect(await watched(user.id)).toHaveLength(1);
    await page.goto("/watchlist");
    await expect(page.getByRole("heading", { name: player.full_name, exact: true })).toBeVisible();
    const notes = "N".repeat(2000);
    await page.getByLabel(`Notes for ${player.full_name}`, { exact: true }).fill(notes);
    await page.getByRole("button", { name: "Save notes", exact: true }).click();
    await expect.poll(async () => (await watched(user.id))[0]?.notes).toBe(notes);
    await expect(page.locator("p[role=status]")).toHaveText("Notes saved.");
    await expect(page.getByRole("button", { name: "Save notes", exact: true })).toBeEnabled();
    await expect(page.getByLabel(`Notes for ${player.full_name}`, { exact: true })).toHaveValue(notes);
    const previous = await watched(user.id);
    // Send an oversized payload through the actual UI action. The valid native
    // input stays in place while the request bypasses its maxlength constraint;
    // this avoids racing the server response that remounts the notes textarea.
    await page.route("**/watchlist", async route => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await route.continue({ postData: editActionForm(request, "notes", "N".repeat(2001)) });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Save notes", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText(/2,?000/);
    await page.unroute("**/watchlist");
    expect(await watched(user.id)).toEqual(previous);
    await page.reload();
    await expect(page.getByLabel(`Notes for ${player.full_name}`, { exact: true })).toHaveValue(notes);
    await page.goto("/players");
    await page.goto("/watchlist");
    await expect(page.getByLabel(`Notes for ${player.full_name}`, { exact: true })).toHaveValue(notes);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await signIn(page, user);
    await page.goto("/watchlist");
    await expect(page.getByLabel(`Notes for ${player.full_name}`, { exact: true })).toHaveValue(notes);
    await page.getByRole("button", { name: "Add to roster", exact: true }).click();
    await expect.poll(() => memberships(user.id)).toEqual([player.id]);
    expect(await watched(user.id)).toEqual(previous);
    await page.reload();
    await expect(page.getByLabel(`Notes for ${player.full_name}`, { exact: true })).toHaveValue(notes);
    await page.getByRole("button", { name: "Remove from watchlist", exact: true }).click();
    await expect.poll(() => watched(user.id)).toEqual([]);
    await page.reload();
    await expect(page.getByRole("heading", { name: player.full_name, exact: true })).toHaveCount(0);
    expect(await memberships(user.id)).toEqual([player.id]);
  } finally {
    await deleteTestUser(user);
  }
});

test("two browser contexts and account switching isolate private roster and watchlist state", async ({ browser, baseURL }) => {
  const first = await createTestUser("isolation-a");
  let second: Awaited<ReturnType<typeof createTestUser>> | undefined;
  const contextA = await browser.newContext({ baseURL });
  const contextB = await browser.newContext({ baseURL });
  try {
    second = await createTestUser("isolation-b");
    const [playerA, playerB] = await fixturePlayers(2);
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await signIn(pageA, first);
    await signIn(pageB, second);
    await addPlayer(pageA, playerA);
    await expect.poll(() => memberships(first.id)).toEqual([playerA.id]);
    await pageA.getByRole("button", { name: "Add to watchlist", exact: true }).click();
    await expect.poll(async () => (await watched(first.id)).length).toBe(1);
    await pageA.goto("/watchlist");
    await pageA.getByLabel(`Notes for ${playerA.full_name}`, { exact: true }).fill("Only account A may see this note.");
    await pageA.getByRole("button", { name: "Save notes", exact: true }).click();
    await expect.poll(async () => (await watched(first.id))[0]?.notes).toBe("Only account A may see this note.");
    await pageB.goto("/dashboard");
    await expect(pageB.getByText("0 / 10 players", { exact: true })).toBeVisible();
    await expect(pageB.getByRole("region", { name: "Current roster", exact: true }).getByRole("link", { name: playerA.full_name, exact: true })).toHaveCount(0);
    await pageB.goto("/watchlist");
    await expect(pageB.getByLabel(`Notes for ${playerA.full_name}`, { exact: true })).toHaveCount(0);
    await addPlayer(pageB, playerB);
    await expect.poll(() => memberships(second!.id)).toEqual([playerB.id]);
    await pageA.goto("/dashboard");
    await expect(pageA.getByRole("region", { name: "Current roster", exact: true }).getByRole("link", { name: playerA.full_name, exact: true })).toBeVisible();
    await expect(pageA.getByRole("region", { name: "Current roster", exact: true }).getByRole("link", { name: playerB.full_name, exact: true })).toHaveCount(0);
    await pageA.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(pageA).toHaveURL(/\/sign-in$/);
    await signIn(pageA, second);
    await expect(pageA.getByRole("region", { name: "Current roster", exact: true }).getByRole("link", { name: playerB.full_name, exact: true })).toBeVisible();
    await expect(pageA.getByRole("region", { name: "Current roster", exact: true }).getByRole("link", { name: playerA.full_name, exact: true })).toHaveCount(0);
    await pageA.goto("/watchlist");
    await expect(pageA.getByLabel(`Notes for ${playerA.full_name}`, { exact: true })).toHaveCount(0);
    expect(await memberships(first.id)).toEqual([playerA.id]);
    expect(await memberships(second.id)).toEqual([playerB.id]);
  } finally {
    await Promise.all([contextA.close(), contextB.close()]);
    await deleteTestUser(first);
    if (second) await deleteTestUser(second);
  }
});

test("captured server actions reject unauthenticated and malformed requests and derive ownership from session", async ({ page, browser }) => {
  const first = await createTestUser("crafted-a");
  let second: Awaited<ReturnType<typeof createTestUser>> | undefined;
  const anonymous = await browser.newContext();
  try {
    second = await createTestUser("crafted-b");
    const [playerA, playerB] = await fixturePlayers(2);
    await signIn(page, first);
    await page.goto(`/players/${playerA.id}`);
    const capture = page.waitForRequest(request => request.method() === "POST" && Boolean(request.headers()["next-action"]));
    await page.getByRole("button", { name: "Add to roster", exact: true }).click();
    const request = await capture;
    await expect.poll(() => memberships(first.id)).toEqual([playerA.id]);
    const unauthenticated = await anonymous.request.post(request.url(), { headers: actionHeaders(request), data: request.postDataBuffer()! });
    expect(unauthenticated.headers()["x-action-redirect"] ?? await unauthenticated.text()).toMatch(/sign-in|Authentication required|Sign in/i);
    expect(await memberships(first.id)).toEqual([playerA.id]);
    expect(await memberships(second.id)).toEqual([]);
    const invalid = await page.request.post(request.url(), {
      headers: actionHeaders(request), data: editActionForm(request, "player_id", "not-a-player"),
    });
    expect(await invalid.text()).toContain("Player ID must be a valid positive whole number.");
    expect(await memberships(first.id)).toEqual([playerA.id]);
    const unavailable = await page.request.post(request.url(), {
      headers: actionHeaders(request), data: editActionForm(request, "player_id", "999999999999999"),
    });
    expect(await unavailable.text()).toContain("This player is unavailable. Please choose an imported player.");
    expect(await memberships(first.id)).toEqual([playerA.id]);
    expect(await memberships(second.id)).toEqual([]);
    const crafted = await page.request.post(request.url(), {
      headers: actionHeaders(request), data: editActionForm(request, "player_id", String(playerB.id), { user_id: second.id }),
    });
    expect(crafted.ok()).toBe(true);
    await expect.poll(() => memberships(first.id)).toEqual([playerA.id, playerB.id].sort((a, b) => a - b));
    expect(await memberships(second.id)).toEqual([]);
  } finally {
    await anonymous.close();
    await deleteTestUser(first);
    if (second) await deleteTestUser(second);
  }
});
