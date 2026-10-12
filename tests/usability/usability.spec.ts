import { execFileSync } from "node:child_process";
import { test, expect, type Page, type Route } from "@playwright/test";
import { createTestClient, createTestUser, deleteTestUser, getTestAdmin } from "../support/local-supabase";
import { fixturePlayers, signIn } from "../support/browser";

test.setTimeout(90_000);

async function readablePage(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const unlabelled = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:not([type=hidden]),select,textarea"));
    return controls.filter(control => control.getClientRects().length > 0 && !control.labels?.length &&
      !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby"))
      .map(control => control.name || control.tagName);
  });
  expect(unlabelled).toEqual([]);
}

async function capture(page: Page, name: string) {
  // A reload can return while the streamed loading fallback is still visible.
  // Wait for the actual route content before measuring or recording its layout.
  if (name.startsWith("dashboard-")) {
    await expect(page.getByRole("region", { name: "Current roster", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Saved snapshot", exact: true })).toBeVisible();
  } else if (name === "watchlist-mobile") {
    await expect(page.getByRole("heading", { name: "Watchlist", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox")).toBeVisible();
  }
  await expect(page.getByText("Loading your planner…", { exact: true })).not.toBeVisible();
  await readablePage(page);
  await page.screenshot({ path: `/tmp/fantasy-visual-${name}.png`, fullPage: true });
}

function queryFault(id: string, mode: "empty" | "failure" | "clean") {
  execFileSync(".venv/bin/python", ["scripts/testing/query_fault.py", id, mode], { stdio: "pipe" });
}

test("production desktop and narrow mobile pages remain readable with saved data and keyboard controls", async ({ page }) => {
  const user = await createTestUser("visual-usability");
  const client = createTestClient();
  try {
    const players = await fixturePlayers(6);
    const metadata = await getTestAdmin().from("nba_dataset_imports").select("date_min")
      .order("completed_at", { ascending: false }).order("id", { ascending: false }).limit(1).single();
    expect(metadata.error).toBeNull();
    expect((await client.auth.signInWithPassword({ email: user.email, password: user.password })).error).toBeNull();
    expect((await client.rpc("ensure_roster")).error).toBeNull();
    for (const player of players) expect((await client.rpc("add_roster_player", { p_player_id: player.id })).error).toBeNull();
    expect((await client.rpc("save_lineup", { p_date: metadata.data!.date_min, p_starters: players.slice(0, 5).map(player => player.id) })).error).toBeNull();
    const notes = "Historical notes: compare recorded appearances before choosing starters.\nThis player stays on the watchlist when added to my roster.";
    expect((await client.from("watchlist_entries").insert({ player_id: players[0].id, notes })).error).toBeNull();
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, user);
    await expect(page.getByRole("region", { name: "Saved snapshot", exact: true })).toBeVisible();
    await expect(page.getByText("6 / 10 players", { exact: true })).toBeVisible();
    await capture(page, "dashboard-desktop");

    // Tab must expose the shared visible focus ring on a real interactive item.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const active = document.activeElement!;
      const style = getComputedStyle(active);
      return { interactive: active.matches("a,button,input,select,textarea"), visible: active.matches(":focus-visible"), width: parseFloat(style.outlineWidth), color: style.outlineColor };
    });
    expect(focus.interactive).toBe(true);
    expect(focus.visible).toBe(true);
    expect(focus.width).toBeGreaterThanOrEqual(2);
    expect(focus.color).not.toBe("rgba(0, 0, 0, 0)");
    const first = page.getByLabel("Starter 1", { exact: true });
    const original = await first.inputValue();
    await first.evaluate(element => element.addEventListener("change", () => {
      element.dataset.keyboardChange = (element as HTMLSelectElement).value;
    }, { once: true }));
    await first.focus();
    await page.keyboard.press(players[1].full_name.toLowerCase().slice(0, 1));
    await expect(first).not.toHaveValue(original);
    await expect(first).toHaveAttribute("data-keyboard-change", await first.inputValue());
    await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
    await first.selectOption(original);
    await expect(page.getByText("Saved lineup", { exact: true })).toBeVisible();

    // Hold one genuine action request until the pending UI has been inspected.
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const intercepted = new Promise<void>(resolve => { entered = resolve; });
    const routeAction = async (route: Route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        entered();
        await gate;
      }
      await route.continue();
    };
    await page.route("**/*", routeAction);
    try {
      await page.getByLabel("Roster name", { exact: true }).fill("Historical review roster");
      const click = page.getByRole("button", { name: "Rename roster", exact: true }).click();
      await intercepted;
      await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeVisible();
      await expect(page.getByLabel("Roster name", { exact: true })).toBeDisabled();
      release();
      await click;
      await expect(page.getByText("Roster renamed.", { exact: true })).toBeVisible();
    } finally {
      release();
      await page.unroute("**/*", routeAction);
    }
    await page.getByLabel("Roster name", { exact: true }).fill("   ");
    await page.getByRole("button", { name: "Rename roster", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText("Roster name");
    await expect(page.getByRole("heading", { name: "Historical review roster", exact: true })).toBeVisible();
    await page.reload();

    await page.setViewportSize({ width: 375, height: 812 });
    await capture(page, "dashboard-mobile");
    await page.goto("/players");
    await expect(page.getByRole("table", { name: "Season players", exact: true })).toBeVisible();
    await capture(page, "players-mobile");
    await page.goto(`/players/${players[0].id}`);
    await expect(page.getByRole("heading", { name: players[0].full_name, exact: true })).toBeVisible();
    await capture(page, "details-mobile");
    const historyScroll = page.getByRole("table", { name: "Game history", exact: true }).locator("..");
    expect(await historyScroll.evaluate(element => getComputedStyle(element).overflowX)).toBe("auto");
    await page.goto("/watchlist");
    await expect(page.getByLabel(`Notes for ${players[0].full_name}`, { exact: true })).toHaveValue(notes);
    await capture(page, "watchlist-mobile");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
    await capture(page, "signin-mobile");
  } finally {
    await client.auth.signOut();
    await deleteTestUser(user);
  }
});

test("production empty and recoverable failure states remain visible on a narrow screen", async ({ page }) => {
  const user = await createTestUser("usability-states");
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, user);
    await expect(page.getByText(/Your roster is empty\./)).toBeVisible();
    await expect(page.getByText("Unsaved selection", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save lineup", exact: true })).toBeDisabled();
    await readablePage(page);
    await page.goto("/watchlist");
    await expect(page.getByText("Your watchlist is empty.", { exact: true })).toBeVisible();
    await readablePage(page);
    queryFault(user.id, "empty");
    await page.goto("/players");
    await expect(page.getByText(/No dataset imported/)).toBeVisible();
    await readablePage(page);
    queryFault(user.id, "failure");
    await page.reload();
    await expect(page.getByRole("heading", { name: "We couldn’t load this page", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await capture(page, "error-mobile");
    queryFault(user.id, "clean");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("table", { name: "Season players", exact: true })).toBeVisible();
    await readablePage(page);
  } finally {
    queryFault(user.id, "clean");
    await deleteTestUser(user);
  }
});
