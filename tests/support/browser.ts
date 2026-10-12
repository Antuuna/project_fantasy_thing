import { expect, type Page } from "@playwright/test";
import { getTestAdmin, type TestUser } from "./local-supabase";

export type FixturePlayer = { id: number; full_name: string };

export async function signIn(page: Page, user: TestUser) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
}

export async function fixturePlayers(count = 12): Promise<FixturePlayer[]> {
  if (!Number.isInteger(count) || count < 1 || count > 25) throw new Error("Fixture reads must remain bounded.");
  const admin = getTestAdmin();
  const metadata = await admin.from("nba_dataset_imports").select("season")
    .order("completed_at", { ascending: false }).order("id", { ascending: false }).limit(1).single();
  expect(metadata.error).toBeNull();
  const result = await admin.from("nba_season_players").select("id,full_name")
    .eq("season", metadata.data!.season).order("full_name").order("id").limit(count);
  expect(result.error).toBeNull();
  expect(result.data).toHaveLength(count);
  return result.data as FixturePlayer[];
}
