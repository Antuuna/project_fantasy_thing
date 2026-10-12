import { test, expect, type Page, type Request } from "@playwright/test";
import { createTestClient, createTestUser, deleteTestUser, getTestAdmin, type TestUser } from "../support/local-supabase";
import { fixturePlayers, signIn, type FixturePlayer } from "../support/browser";

const admin = getTestAdmin();
test.setTimeout(90_000);
type Metadata = { season: string; date_min: string; date_max: string };
type Entry = { id: string; player_id: number; slot: string; lineup_date: string; [key: string]: unknown };

async function metadata(): Promise<Metadata> {
  const result = await admin.from("nba_dataset_imports").select("season,date_min,date_max")
    .order("completed_at", { ascending: false }).order("id", { ascending: false }).limit(1).single();
  expect(result.error).toBeNull();
  return result.data as Metadata;
}

async function seedRoster(user: TestUser, players: FixturePlayer[]) {
  const client = createTestClient();
  try {
    expect((await client.auth.signInWithPassword({ email: user.email, password: user.password })).error).toBeNull();
    expect((await client.rpc("ensure_roster")).error).toBeNull();
    for (const player of players) expect((await client.rpc("add_roster_player", { p_player_id: player.id })).error).toBeNull();
  } finally {
    await client.auth.signOut();
  }
}

async function snapshot(userId: string, date: string): Promise<Entry[]> {
  const result = await admin.from("lineup_entries").select("*").eq("user_id", userId)
    .eq("lineup_date", date).order("player_id").limit(11);
  expect(result.error).toBeNull();
  return result.data as Entry[];
}

function expected(players: FixturePlayer[], starters: FixturePlayer[]) {
  return players.map(player => ({ player_id: player.id,
    slot: starters.some(starter => starter.id === player.id)
      ? `starter_${starters.findIndex(starter => starter.id === player.id) + 1}` : "bench",
  })).sort((a, b) => a.player_id - b.player_id);
}

async function selectStarters(page: Page, starters: FixturePlayer[]) {
  for (const [index, player] of starters.entries()) {
    await page.getByLabel(`Starter ${index + 1}`, { exact: true }).selectOption(String(player.id));
  }
}

async function save(page: Page, userId: string, date: string, players: FixturePlayer[], starters: FixturePlayer[]) {
  await selectStarters(page, starters);
  await page.getByRole("button", { name: "Save lineup", exact: true }).click();
  await expect(page.locator("p[role=status]").filter({ hasText: "Lineup saved." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save lineup", exact: true })).toBeEnabled();
  for (const [index, player] of starters.entries()) {
    await expect(page.getByLabel(`Starter ${index + 1}`, { exact: true })).toHaveValue(String(player.id));
  }
  await expect.poll(async () => (await snapshot(userId, date)).map(({ player_id, slot }) => ({ player_id, slot })))
    .toEqual(expected(players, starters));
  const saved = page.getByRole("region", { name: "Saved snapshot", exact: true });
  for (const [index, player] of starters.entries()) {
    await expect(saved.locator("ol > li").nth(index).getByRole("link", { name: player.full_name, exact: true })).toBeVisible();
  }
  const bench = players.filter(player => !starters.some(starter => starter.id === player.id));
  await expect(saved.locator(":scope > ul > li")).toHaveCount(bench.length);
  for (const player of bench) await expect(saved.locator(":scope > ul > li").getByRole("link", { name: player.full_name, exact: true })).toBeVisible();
}

async function changeDate(page: Page, date: string) {
  await page.getByLabel("Lineup date", { exact: true }).fill(date);
  await page.getByRole("button", { name: "Change date", exact: true }).click();
  await expect(page.getByLabel("Lineup date", { exact: true })).toHaveValue(date);
  await expect(page).toHaveURL(new RegExp(`[?&]date=${date}(?:&|$)`));
}

function actionHeaders(request: Request) {
  const headers = request.headers();
  return Object.fromEntries(["next-action", "content-type", "accept", "origin", "referer"]
    .filter(name => headers[name]).map(name => [name, headers[name]]));
}

function craftedBody(request: Request, fields: Record<string, string>) {
  let body = request.postDataBuffer()!.toString("utf8");
  for (const [name, value] of Object.entries(fields)) {
    const pattern = new RegExp(`(name="[^"\\r\\n]*${name}"\\r\\n\\r\\n)[^\\r\\n]*`);
    if (!pattern.test(body)) throw new Error("Expected lineup field absent from captured action.");
    body = body.replace(pattern, (_whole, header) => header + value);
  }
  return body;
}

function offsetDate(date: string, days: number) {
  const instant = new Date(`${date}T00:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

async function noGameDate(imported: Metadata) {
  const games = await admin.from("nba_games").select("game_date").eq("season", imported.season)
    .order("game_date").order("id").limit(366);
  expect(games.error).toBeNull();
  expect(games.data!.length).toBeGreaterThan(0);
  const dates = new Set(games.data!.map(game => game.game_date as string));
  // Only inspect dates strictly before the last bounded row, where the ordered
  // result proves all earlier dates have been considered, including tied games.
  const last = games.data![games.data!.length - 1].game_date as string;
  for (let date = imported.date_min; date < last; date = offsetDate(date, 1)) {
    if (!dates.has(date)) {
      const check = await admin.from("nba_games").select("id", { count: "exact", head: true }).eq("game_date", date).eq("season", imported.season);
      expect(check.error).toBeNull();
      expect(check.count).toBe(0);
      return date;
    }
  }
  throw new Error("Fixture must include an in-season date without games in the first bounded historical dates.");
}

test("ordered full lineup saves, restores across sessions, replaces, and edits history against current membership", async ({ page }) => {
  const user = await createTestUser("lineup-history");
  try {
    const players = await fixturePlayers(7);
    const imported = await metadata();
    await seedRoster(user, players.slice(0, 6));
    await signIn(page, user);
    await expect(page.getByLabel("Lineup date", { exact: true })).toHaveValue(imported.date_min);
    const initial = players.slice(0, 5);
    await save(page, user.id, imported.date_min, players.slice(0, 6), initial);
    await page.reload();
    for (const [index, player] of initial.entries()) {
      await expect(page.getByLabel(`Starter ${index + 1}`, { exact: true })).toHaveValue(String(player.id));
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await signIn(page, user);
    for (const [index, player] of initial.entries()) {
      await expect(page.getByLabel(`Starter ${index + 1}`, { exact: true })).toHaveValue(String(player.id));
    }
    const replacement = [players[5], ...players.slice(0, 4)];
    await save(page, user.id, imported.date_min, players.slice(0, 6), replacement);
    const prior = await snapshot(user.id, imported.date_min);
    const currentRoster = page.getByRole("region", { name: "Current roster", exact: true });
    await currentRoster.getByRole("listitem").filter({ has: page.getByRole("link", { name: players[5].full_name, exact: true }) })
      .getByRole("button", { name: "Remove from roster", exact: true }).click();
    await expect(page.getByText("5 / 10 players", { exact: true })).toBeVisible();
    expect(await snapshot(user.id, imported.date_min)).toEqual(prior);
    const saved = page.getByRole("region", { name: "Saved snapshot", exact: true });
    await expect(saved.getByRole("link", { name: players[5].full_name, exact: true })).toBeVisible();
    await expect(saved.getByText("Removed from current roster", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Starter 1", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Starter 1", { exact: true }).locator(`option[value="${players[5].id}"]`)).toHaveCount(0);
    await page.goto(`/players/${players[6].id}`);
    await page.getByRole("button", { name: "Add to roster", exact: true }).click();
    await expect(page.locator("p[role=status]")).toHaveText("Player added to roster.");
    await page.goto("/dashboard");
    await save(page, user.id, imported.date_min, [...players.slice(0, 5), players[6]], players.slice(0, 5));
    const entries = await snapshot(user.id, imported.date_min);
    expect(entries.find(entry => entry.player_id === players[6].id)?.slot).toBe("bench");
    expect(entries.some(entry => entry.player_id === players[5].id)).toBe(false);
  } finally {
    await deleteTestUser(user);
  }
});

test("inclusive season boundaries, no-game dates, unsaved bench, and dirty-date navigation", async ({ page }) => {
  const user = await createTestUser("lineup-dates");
  try {
    const players = await fixturePlayers(6);
    const imported = await metadata();
    const emptyDate = await noGameDate(imported);
    await seedRoster(user, players);
    await signIn(page, user);
    await expect(page.getByLabel("Lineup date", { exact: true })).toHaveAttribute("min", imported.date_min);
    await expect(page.getByLabel("Lineup date", { exact: true })).toHaveAttribute("max", imported.date_max);
    expect(await snapshot(user.id, imported.date_min)).toEqual([]);
    for (let slot = 1; slot <= 5; slot++) await expect(page.getByLabel(`Starter ${slot}`, { exact: true })).toHaveValue("");
    await expect(page.getByText("Unsaved selection", { exact: true })).toBeVisible();
    const editor = page.getByRole("region", { name: "Lineup editor", exact: true });
    await expect(editor.getByRole("listitem")).toHaveCount(6);
    for (const player of players) await expect(editor.getByRole("listitem").filter({ hasText: player.full_name })).toBeVisible();
    await page.getByLabel("Starter 1", { exact: true }).selectOption(String(players[0].id));
    await expect(editor.getByText("Changing date or leaving this page discards unsaved changes.", { exact: true })).toBeVisible();
    page.once("dialog", async dialog => {
      expect(dialog.type()).toBe("beforeunload");
      await dialog.accept();
    });
    await changeDate(page, imported.date_max);
    await expect(page.getByLabel("Starter 1", { exact: true })).toHaveValue("");
    expect(await snapshot(user.id, imported.date_min)).toEqual([]);
    await save(page, user.id, imported.date_max, players, players.slice(0, 5));
    await changeDate(page, imported.date_min);
    await save(page, user.id, imported.date_min, players, players.slice(0, 5));
    await changeDate(page, emptyDate);
    await save(page, user.id, emptyDate, players, players.slice(0, 5));
    await page.reload();
    await expect(page.getByLabel("Lineup date", { exact: true })).toHaveValue(emptyDate);
    expect(await snapshot(user.id, emptyDate)).toHaveLength(6);
    for (const date of [offsetDate(imported.date_min, -1), offsetDate(imported.date_max, 1), "2025-02-30", "not-a-date"]) {
      await page.goto(`/dashboard?date=${encodeURIComponent(date)}`);
      await expect(page.locator("p[role=alert]")).toBeVisible();
    }
  } finally {
    await deleteTestUser(user);
  }
});

test("crafted duplicate, incomplete, nonmember and out-of-season saves preserve every stored lineup column", async ({ page, browser }) => {
  const user = await createTestUser("lineup-invalid");
  const anonymous = await browser.newContext();
  try {
    const players = await fixturePlayers(7);
    const imported = await metadata();
    await seedRoster(user, players.slice(0, 6));
    await signIn(page, user);
    await selectStarters(page, players.slice(0, 5));
    const capture = page.waitForRequest(request => request.method() === "POST" && Boolean(request.headers()["next-action"]));
    await page.getByRole("button", { name: "Save lineup", exact: true }).click();
    const request = await capture;
    await expect(page.locator("p[role=status]").filter({ hasText: "Lineup saved." })).toBeVisible();
    const previous = await snapshot(user.id, imported.date_min);
    expect(previous).toHaveLength(6);
    const invalidInputs: { fields: Record<string, string>; message: string }[] = [
      { fields: { starter_2: String(players[0].id) }, message: "Choose exactly five distinct starters." },
      { fields: { starter_5: "" }, message: "Choose exactly five distinct starters." },
      { fields: { starter_1: String(players[6].id) }, message: "Every starter must belong to your current roster." },
      { fields: { lineup_date: offsetDate(imported.date_min, -1) }, message: "Date must be within the imported season." },
      { fields: { lineup_date: offsetDate(imported.date_max, 1) }, message: "Date must be within the imported season." },
      { fields: { lineup_date: "2025-02-30" }, message: "Choose a valid historical date (YYYY-MM-DD)." },
    ];
    for (const { fields, message } of invalidInputs) {
      const response = await page.request.post(request.url(), { headers: actionHeaders(request), data: craftedBody(request, fields) });
      expect(await response.text()).toContain(message);
      expect(await snapshot(user.id, imported.date_min)).toEqual(previous);
      if (fields.lineup_date && fields.lineup_date !== "2025-02-30") {
        expect(await snapshot(user.id, fields.lineup_date)).toEqual([]);
      }
    }
    const response = await anonymous.request.post(request.url(), { headers: actionHeaders(request), data: request.postDataBuffer()! });
    expect(response.headers()["x-action-redirect"] ?? await response.text()).toMatch(/sign-in|Authentication required|Sign in/i);
    expect(await snapshot(user.id, imported.date_min)).toEqual(previous);
  } finally {
    await anonymous.close();
    await deleteTestUser(user);
  }
});

test("fewer than five members cannot save a lineup", async ({ page }) => {
  const user = await createTestUser("lineup-small");
  try {
    const players = await fixturePlayers(4);
    const imported = await metadata();
    await seedRoster(user, players);
    await signIn(page, user);
    await expect(page.getByText(/at least five|five players|5 players/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save lineup", exact: true })).toBeDisabled();
    expect(await snapshot(user.id, imported.date_min)).toEqual([]);
  } finally {
    await deleteTestUser(user);
  }
});

test("date-only default, boundaries, and saved restoration agree in Pacific and Tokyo", async ({ browser, baseURL }) => {
  const user = await createTestUser("lineup-timezones");
  const contexts = [];
  try {
    const players = await fixturePlayers(6);
    const imported = await metadata();
    await seedRoster(user, players);
    for (const timezoneId of ["America/Los_Angeles", "Asia/Tokyo"]) {
      const context = await browser.newContext({ baseURL, timezoneId });
      contexts.push(context);
      const page = await context.newPage();
      await signIn(page, user);
      await expect(page.getByLabel("Lineup date", { exact: true })).toHaveValue(imported.date_min);
      await changeDate(page, imported.date_max);
      if (timezoneId === "America/Los_Angeles") await save(page, user.id, imported.date_max, players, players.slice(0, 5));
      else for (const [index, player] of players.slice(0, 5).entries()) {
        await expect(page.getByLabel(`Starter ${index + 1}`, { exact: true })).toHaveValue(String(player.id));
      }
      await page.reload();
      await expect(page.getByLabel("Lineup date", { exact: true })).toHaveValue(imported.date_max);
      expect((await snapshot(user.id, imported.date_max)).every(entry => entry.lineup_date === imported.date_max)).toBe(true);
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    await deleteTestUser(user);
  }
});

test("historical games use recorded teams and textual game IDs and never invent participation", async ({ page }) => {
  const user = await createTestUser("lineup-teams");
  try {
    const imported = await metadata();
    const appearance = await admin.from("nba_player_history").select("player_id,game_id,game_date,team_name,team_abbreviation,opponent_name,opponent_abbreviation,points")
      .eq("season", imported.season).order("game_date").order("game_id").order("player_id").limit(1).single();
    expect(appearance.error).toBeNull();
    const game = appearance.data!;
    const identity = await admin.from("nba_players").select("id,full_name").eq("id", game.player_id).single();
    expect(identity.error).toBeNull();
    const player = identity.data as FixturePlayer;
    const candidates = await fixturePlayers(6);
    const players = [player, ...candidates.filter(candidate => candidate.id !== player.id).slice(0, 5)];
    await seedRoster(user, players);
    await signIn(page, user);
    await changeDate(page, game.game_date as string);
    const historical = page.getByRole("region", { name: "Historical games", exact: true });
    const row = historical.locator(":scope > ul > li").filter({ has: page.getByRole("link", { name: player.full_name, exact: true }) });
    await expect(row).toContainText(`${game.team_name} (${game.team_abbreviation})`);
    await expect(row).toContainText(`${game.opponent_name} (${game.opponent_abbreviation})`);
    await expect(row).toContainText(`Game ${game.game_id}`);
    await expect(row).toContainText(`${game.points} points`);
    const emptyDate = await noGameDate(imported);
    await changeDate(page, emptyDate);
    const rows = historical.locator(":scope > ul > li");
    await expect(rows).toHaveCount(6);
    for (let index = 0; index < players.length; index++) {
      await expect(rows.nth(index)).toContainText("No recorded appearance on this date; team and availability are unknown.");
      await expect(rows.nth(index)).not.toContainText("Game ");
    }
    // No game is required for a player to be an unrestricted starter.
    await save(page, user.id, emptyDate, players, players.slice(0, 5));
  } finally {
    await deleteTestUser(user);
  }
});
