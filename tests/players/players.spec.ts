import { test, expect, type Page } from "@playwright/test";
import { createTestUser, deleteTestUser, getTestAdmin, type TestUser } from "../support/local-supabase";

const admin = getTestAdmin();
type Player = { id: number; full_name: string; position: string | null; appearances: number; points: number };
type History = { game_id: string; game_date: string; team_abbreviation: string; opponent_abbreviation: string; minutes: number; points: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number };

async function season() {
  const result = await admin.from("nba_dataset_imports").select("season")
    .order("completed_at", { ascending: false }).order("id", { ascending: false }).limit(1).single();
  expect(result.error).toBeNull();
  return result.data!.season as string;
}

async function signIn(page: Page, user: TestUser) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("directory and details require authentication", async ({ page }) => {
  await page.goto("/players");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/players/990001");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("season directory has stable bounded pagination and working name search", async ({ page }) => {
  const user = await createTestUser("players-directory");
  try {
    const importedSeason = await season();
    const result = await admin.from("nba_season_players").select("id,full_name,position,appearances,points")
      .eq("season", importedSeason).order("full_name").order("id").limit(41);
    expect(result.error).toBeNull();
    const players = result.data as Player[];
    expect(players.length).toBeGreaterThan(20); // Full season and synthetic CI fixture both have >20.
    await signIn(page, user);
    await page.goto("/players");
    await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
    const rows = page.getByRole("table", { name: "Season players" }).locator("tbody tr");
    await expect(rows).toHaveCount(20);
    for (const [index, player] of players.slice(0, 20).entries()) {
      await expect(rows.nth(index).getByRole("link", { name: player.full_name, exact: true }))
        .toHaveAttribute("href", `/players/${player.id}`);
    }
    await page.getByRole("link", { name: "Next page", exact: true }).click();
    await expect(page).toHaveURL(/[?&]page=2(?:&|$)/);
    await expect(rows).toHaveCount(Math.min(20, players.length - 20));
    for (const [index, player] of players.slice(20, 40).entries()) {
      await expect(rows.nth(index).getByRole("link", { name: player.full_name, exact: true })).toBeVisible();
    }
    await page.getByRole("link", { name: "Previous page", exact: true }).click();
    await expect(rows.first().getByRole("link", { name: players[0].full_name, exact: true })).toBeVisible();
    await page.reload();
    await expect(rows).toHaveCount(20);
    await expect(rows.first().getByRole("link", { name: players[0].full_name, exact: true })).toBeVisible();
    await page.getByLabel("Search players", { exact: true }).fill(players[0].full_name);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("link", { name: players[0].full_name, exact: true })).toBeVisible();
    await expect(rows).toHaveCount(1);
    await page.getByRole("link", { name: players[0].full_name, exact: true }).click();
    await expect(page.getByRole("heading", { name: players[0].full_name, exact: true })).toBeVisible();
  } finally {
    await deleteTestUser(user);
  }
});

test("player details show unknown position and bounded recent-first historical appearances", async ({ page }) => {
  const user = await createTestUser("players-history");
  try {
    const importedSeason = await season();
    const result = await admin.from("nba_season_players").select("id,full_name,position,appearances,points")
      .eq("season", importedSeason).order("appearances", { ascending: false }).order("id").limit(1).single();
    expect(result.error).toBeNull();
    const player = result.data as Player;
    const historyResult = await admin.from("nba_player_history").select("*")
      .eq("season", importedSeason).eq("player_id", player.id)
      .order("game_date", { ascending: false }).order("game_id", { ascending: false }).limit(21);
    expect(historyResult.error).toBeNull();
    const history = historyResult.data as History[];
    expect(history.length).toBe(21);
    await signIn(page, user);
    await page.goto(`/players/${player.id}`);
    await expect(page.getByRole("heading", { name: player.full_name, exact: true })).toBeVisible();
    await expect(page.getByText(`Position: ${player.position ?? "Unknown"}`, { exact: false })).toBeVisible();
    await expect(page.locator("dl > div").filter({ has: page.getByText("Appearances", { exact: true }) }).locator("dd"))
      .toHaveText(String(player.appearances));
    await expect(page.locator("dl > div").filter({ has: page.getByText("Points", { exact: true }) }).locator("dd"))
      .toHaveText(Number(player.points).toFixed(1));
    const table = page.getByRole("table", { name: "Game history" });
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(Math.min(20, history.length));
    for (const [index, appearance] of history.slice(0, 20).entries()) {
      await expect(rows.nth(index)).toContainText(appearance.game_date);
      await expect(rows.nth(index)).toContainText(appearance.team_abbreviation);
      await expect(rows.nth(index)).toContainText(appearance.opponent_abbreviation);
      const cells = rows.nth(index).locator("td");
      for (const [column, value] of [appearance.minutes, appearance.points, appearance.rebounds,
        appearance.assists, appearance.steals, appearance.blocks, appearance.turnovers].entries()) {
        await expect(cells.nth(column + 2)).toHaveText(String(value));
      }
    }
    await page.getByRole("link", { name: "Next page", exact: true }).click();
    await expect(rows.first()).toContainText(history[20].game_date);
    await page.getByRole("link", { name: "Previous page", exact: true }).click();
    await expect(rows.first()).toContainText(history[0].game_date);
    const unknown = await admin.from("nba_season_players").select("id,full_name")
      .eq("season", importedSeason).is("position", null).order("id").limit(1).single();
    expect(unknown.error).toBeNull();
    await page.goto(`/players/${unknown.data!.id}`);
    await expect(page.getByText("Position: Unknown", { exact: false })).toBeVisible();
  } finally {
    await deleteTestUser(user);
  }
});

test("invalid URLs, missing players, literal escaped searches, and empty results are understandable", async ({ page }) => {
  const user = await createTestUser("players-validation");
  try {
    await signIn(page, user);
    for (const path of ["/players?page=0", "/players?page=10001", "/players?page=abc", `/players?q=${"a".repeat(81)}`]) {
      await page.goto(path);
      const validationError = page.locator("p[role=alert]");
      await expect(validationError).toBeVisible();
      await expect(validationError).toContainText(path.includes("?q=")
        ? "Search must be a single name of at most 80 characters."
        : "Page must be a whole number from 1 to 10,000.");
      await expect(page.getByRole("link", { name: "Back to players", exact: true })).toBeVisible();
    }
    for (const id of ["invalid", "-1", "999999999999999"]) {
      await page.goto(`/players/${id}`);
      await expect(page.getByRole("heading", { name: "Player not found", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to players", exact: true })).toBeVisible();
    }
    const escapedSearch = '<img src=x onerror="window.__playerSearchInjected=true">';
    await page.goto(`/players?q=${encodeURIComponent(escapedSearch)}`);
    await expect(page.getByLabel("Search players", { exact: true })).toHaveValue(escapedSearch);
    await expect(page.getByText("No players match your search.", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => "__playerSearchInjected" in window)).toBe(false);
    await page.goto("/players?q=%25%5F");
    await expect(page.getByText("No players match your search.", { exact: true })).toBeVisible();
    await page.goto("/players?q=definitely-no-such-player-unique");
    await expect(page.getByText("No players match your search.", { exact: true })).toBeVisible();
    await expect(page.getByRole("table", { name: "Season players" })).toHaveCount(0);
  } finally {
    await deleteTestUser(user);
  }
});
