import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createTestClient, createTestUser, deleteTestUser, getTestAdmin,
  type TestUser,
} from "../support/local-supabase";

const shared = ["nba_teams", "nba_players", "nba_games", "nba_player_game_stats", "nba_dataset_imports", "nba_player_season_averages"];
const privateTables = ["rosters", "roster_members", "watchlist_entries", "lineup_entries"];

async function signIn(user: TestUser): Promise<SupabaseClient> {
  const client = createTestClient();
  const result = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  expect(result.error).toBeNull();
  expect(result.data.session).not.toBeNull();
  return client;
}

async function requirePlayers(client: SupabaseClient): Promise<number[]> {
  const result = await client.from("nba_player_season_averages").select("player_id")
    .eq("season", "2025-26").order("player_id").limit(6);
  expect(result.error).toBeNull();
  expect(result.data).toHaveLength(6);
  return result.data!.map(row => Number(row.player_id));
}

async function requireDate(client: SupabaseClient): Promise<string> {
  const result = await client.from("nba_dataset_imports").select("date_min")
    .order("completed_at", { ascending: false }).order("id", { ascending: false }).limit(1).single();
  expect(result.error).toBeNull();
  expect(result.data?.date_min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  return result.data!.date_min;
}

async function seedPrivate(client: SupabaseClient, players: number[], date: string): Promise<string> {
  const roster = await client.rpc("ensure_roster");
  expect(roster.error).toBeNull();
  expect(typeof roster.data).toBe("string");
  for (const player of players) {
    expect((await client.rpc("add_roster_player", { p_player_id: player })).error).toBeNull();
  }
  expect((await client.from("watchlist_entries").insert({ player_id: players[0], notes: "Original private note" })).error).toBeNull();
  expect((await client.rpc("save_lineup", { p_date: date, p_starters: players.slice(0, 5) })).error).toBeNull();
  return roster.data;
}

test("real authenticated sessions read shared season data while anonymous access and ordinary writes are denied", async () => {
  const users: TestUser[] = [];
  try {
    const first = await createTestUser("shared-security");
    users.push(first);
    const second = await createTestUser("shared-security");
    users.push(second);
    const clients = [await signIn(first), await signIn(second)];
    const anonymous = createTestClient();
    for (const table of shared) {
      for (const client of clients) {
        const result = await client.from(table).select("*", { count: "exact" }).limit(1);
        expect(result.error, `${table} authenticated read`).toBeNull();
        expect(result.data, `${table} imported data is required`).toHaveLength(1);
        expect(result.count).toBeGreaterThan(0);
      }
      const denied = await anonymous.from(table).select("*").limit(1);
      expect(denied.error, `${table} anonymous read must fail`).not.toBeNull();
    }
    const existingPlayer = await clients[0].from("nba_players").select("id,full_name").order("id").limit(1).single();
    expect(existingPlayer.error).toBeNull();
    for (const table of shared) {
      // Delete with an impossible predicate still must reject missing write grants.
      const column = table === "nba_player_season_averages" || table === "nba_player_game_stats" ? "player_id" : "id";
      const impossibleId = table === "nba_dataset_imports" ? "00000000-0000-0000-0000-000000000000" : "0";
      expect((await clients[0].from(table).delete().eq(column, impossibleId)).error,
        `${table} ordinary DELETE denied`).not.toBeNull();
    }
    expect((await clients[0].from("nba_players").insert({ id: 999999999, full_name: "Forbidden ordinary write" })).error).not.toBeNull();
    expect((await clients[0].from("nba_players").update({ full_name: "Forbidden rename" }).eq("id", existingPlayer.data!.id)).error).not.toBeNull();
    const unchanged = await clients[1].from("nba_players").select("id,full_name").eq("id", existingPlayer.data!.id).single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toEqual(existingPlayer.data);
    for (const [rpc, params] of [
      ["ensure_roster", {}],
      ["add_roster_player", { p_player_id: existingPlayer.data!.id }],
      ["remove_roster_player", { p_player_id: existingPlayer.data!.id }],
      ["save_lineup", { p_date: "2025-10-21", p_starters: [1, 2, 3, 4, 5] }],
    ] as const) {
      expect((await anonymous.rpc(rpc, params)).error, `${rpc} anonymous execution`).not.toBeNull();
    }
    for (const table of privateTables) {
      expect((await anonymous.from(table).select("*").limit(1)).error, `${table} anonymous access`).not.toBeNull();
    }
  } finally {
    for (const user of users) await deleteTestUser(user);
  }
});

test("two real users isolate every private table and cannot bypass ownership or roster and lineup RPC writes", async () => {
  const users: TestUser[] = [];
  try {
    const first = await createTestUser("private-security");
    users.push(first);
    const second = await createTestUser("private-security");
    users.push(second);
    const owner = await signIn(first);
    const other = await signIn(second);
    const players = await requirePlayers(owner);
    const date = await requireDate(owner);
    const firstRoster = await seedPrivate(owner, players, date);
    const secondRoster = await seedPrivate(other, players, date);
    const snapshot: Record<string, unknown[]> = {};
    for (const table of privateTables) {
      const own = await owner.from(table).select("*").order("id");
      expect(own.error).toBeNull();
      expect(own.data!.length).toBeGreaterThan(0);
      expect(own.data!.every(row => row.user_id === first.id)).toBe(true);
      snapshot[table] = own.data!;
      const theirs = await other.from(table).select("*").order("id");
      expect(theirs.error).toBeNull();
      expect(theirs.data!.length).toBeGreaterThan(0);
      expect(theirs.data!.every(row => row.user_id === second.id)).toBe(true);
      expect((await other.from(table).select("*").eq("user_id", first.id)).data).toEqual([]);
      const crossId = (own.data![0] as { id: string }).id;
      const hidden = await other.from(table).select("*").eq("id", crossId);
      expect(hidden.error).toBeNull();
      expect(hidden.data).toEqual([]);
    }
    const ownRename = await owner.from("rosters").update({ name: "Private renamed roster" }).eq("id", firstRoster).select("name");
    expect(ownRename.error).toBeNull();
    expect(ownRename.data).toEqual([{ name: "Private renamed roster" }]);
    const forbiddenRename = await other.from("rosters").update({ name: "Cross-user attempt" }).eq("id", firstRoster).select("id");
    expect(forbiddenRename.error).toBeNull();
    expect(forbiddenRename.data).toEqual([]);
    expect((await owner.from("rosters").update({ user_id: second.id }).eq("id", firstRoster)).error).not.toBeNull();
    expect((await owner.from("rosters").delete().eq("id", firstRoster)).error).not.toBeNull();
    expect((await owner.from("rosters").insert({ user_id: first.id, name: "Bypass" })).error).not.toBeNull();

    const note = await owner.from("watchlist_entries").select("id,notes").eq("player_id", players[0]).single();
    expect(note.error).toBeNull();
    const noteId = note.data!.id;
    const ownNote = await owner.from("watchlist_entries").update({ notes: "Persisted owner note" }).eq("id", noteId).select("notes");
    expect(ownNote.error).toBeNull();
    expect(ownNote.data).toEqual([{ notes: "Persisted owner note" }]);
    for (const operation of [
      other.from("watchlist_entries").update({ notes: "Cross-user attempt" }).eq("id", noteId).select("id"),
      other.from("watchlist_entries").delete().eq("id", noteId).select("id"),
    ]) {
      const forbidden = await operation;
      expect(forbidden.error).toBeNull();
      expect(forbidden.data).toEqual([]);
    }
    expect((await owner.from("watchlist_entries").update({ user_id: second.id }).eq("id", noteId)).error).not.toBeNull();
    expect((await owner.from("watchlist_entries").insert({ user_id: second.id, player_id: players[1] })).error).not.toBeNull();
    expect((await owner.from("watchlist_entries").insert({ player_id: players[0] })).error).not.toBeNull();
    const persistedNote = await owner.from("watchlist_entries").select("notes").eq("id", noteId).single();
    expect(persistedNote.error).toBeNull();
    expect(persistedNote.data).toEqual({ notes: "Persisted owner note" });

    const craftedMember = { user_id: first.id, roster_id: secondRoster, player_id: players[0] };
    expect((await owner.from("roster_members").insert(craftedMember)).error).not.toBeNull();
    expect((await owner.from("lineup_entries").insert({ ...craftedMember, lineup_date: date, slot: "starter_1" })).error).not.toBeNull();
    for (const table of ["roster_members", "lineup_entries"]) {
      const rowId = (snapshot[table][0] as { id: string }).id;
      for (const client of [owner, other]) {
        expect((await client.from(table).update({ user_id: second.id }).eq("id", rowId)).error).not.toBeNull();
        expect((await client.from(table).update({ roster_id: secondRoster }).eq("id", rowId)).error).not.toBeNull();
        expect((await client.from(table).delete().eq("id", rowId)).error).not.toBeNull();
      }
      const unchanged = await owner.from(table).select("*").order("id");
      expect(unchanged.error).toBeNull();
      expect(unchanged.data).toEqual(snapshot[table]);
    }
    const unchangedRoster = await owner.from("rosters").select("id,user_id,name").single();
    expect(unchangedRoster.data).toEqual({ id: firstRoster, user_id: first.id, name: "Private renamed roster" });
    const removeNote = await owner.from("watchlist_entries").delete().eq("id", noteId).select("id");
    expect(removeNote.error).toBeNull();
    expect(removeNote.data).toEqual([{ id: noteId }]);
    expect((await other.from("watchlist_entries").select("id")).data).toHaveLength(1);

    // Account cleanup is privileged setup only; application assertions use sessions.
    await deleteTestUser(first);
    users.splice(users.indexOf(first), 1);
    for (const table of privateTables) {
      const cleaned = await getTestAdmin().from(table).select("id").eq("user_id", first.id);
      expect(cleaned.error).toBeNull();
      expect(cleaned.data).toEqual([]);
      const surviving = await other.from(table).select("id");
      expect(surviving.error).toBeNull();
      expect(surviving.data!.length).toBeGreaterThan(0);
    }
    expect(await requirePlayers(other)).toEqual(players);
  } finally {
    for (const user of users) await deleteTestUser(user);
  }
});
