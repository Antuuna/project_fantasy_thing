import { expect, test } from "@playwright/test";
import {
  createTestClient, createTestUser, deleteTestUser,
} from "../support/local-supabase";

const averageColumns = "appearances,minutes,points,rebounds,assists,steals,blocks,turnovers";
const directoryColumns = `id,full_name,position,season,${averageColumns}`;

// These checks use authenticated PostgREST requests against actual imported data.
// The companion rollback SQL fixture proves the synthetic zero-minute/trade cases.
test("season directory query joins actual appearances and names with stable bounded pagination", async () => {
  const user = await createTestUser("directory-query");
  try {
    const client = createTestClient();
    expect((await client.auth.signInWithPassword({ email: user.email, password: user.password })).error).toBeNull();
    const metadata = await client.from("nba_dataset_imports").select("season")
      .order("completed_at", { ascending: false }).order("id", { ascending: false }).limit(1).single();
    expect(metadata.error).toBeNull();
    const season = metadata.data!.season;
    const ordered = () => client.from("nba_season_players").select(directoryColumns, { count: "exact" })
      .eq("season", season).order("full_name", { ascending: true }).order("id", { ascending: true });
    const first = await ordered().range(0, 5);
    const second = await ordered().range(6, 11);
    const combined = await ordered().range(0, 11);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(combined.error).toBeNull();
    expect(first.data).toHaveLength(6);
    expect(second.data).toHaveLength(6);
    expect(combined.data).toEqual([...first.data!, ...second.data!]);
    expect(new Set(combined.data!.map(player => player.id)).size).toBe(12);
    const again = await ordered().range(0, 5);
    expect(again.error).toBeNull();
    expect(again.data).toEqual(first.data);
    const averagesCount = await client.from("nba_player_season_averages")
      .select("player_id", { count: "exact", head: true }).eq("season", season);
    expect(averagesCount.error).toBeNull();
    expect(first.count).toBe(averagesCount.count);
    const players = await client.from("nba_players").select("id,full_name,position")
      .in("id", first.data!.map(player => player.id));
    const averages = await client.from("nba_player_season_averages")
      .select(`player_id,season,${averageColumns}`).eq("season", season)
      .in("player_id", first.data!.map(player => player.id));
    expect(players.error).toBeNull();
    expect(averages.error).toBeNull();
    for (const row of first.data!) {
      const identity = players.data!.find(player => player.id === row.id)!;
      const average = averages.data!.find(player => player.player_id === row.id)!;
      const { player_id, ...stats } = average;
      expect(player_id).toBe(row.id);
      expect(row).toEqual({ ...identity, ...stats });
      expect(row.appearances).toBeGreaterThan(0);
      expect(row.season).toBe(season);
    }
    const name = first.data![0].full_name as string;
    // Escape pattern metacharacters so searching the complete name is literal.
    const literalName = name.replace(/[\\%_]/g, "\\$&");
    const searched = await ordered().ilike("full_name", literalName).range(0, 5);
    expect(searched.error).toBeNull();
    expect(searched.data!.some(player => player.id === first.data![0].id)).toBe(true);
    const absentSeason = await client.from("nba_season_players").select("id").eq("season", "synthetic-nonexistent-season").limit(1);
    expect(absentSeason.error).toBeNull();
    expect(absentSeason.data).toEqual([]);
    const missing = await client.from("nba_season_players").select("id").eq("id", 999999999).limit(1);
    expect(missing.error).toBeNull();
    expect(missing.data).toEqual([]);
    const anonymous = createTestClient();
    expect((await anonymous.from("nba_season_players").select("id").limit(1)).error).not.toBeNull();
    expect((await client.from("nba_season_players").delete().eq("id", 999999999)).error).not.toBeNull();
  } finally {
    await deleteTestUser(user);
  }
});

test("bounded recent history exposes textual game IDs and teams from recorded game relationships", async () => {
  const user = await createTestUser("history-query");
  try {
    const client = createTestClient();
    expect((await client.auth.signInWithPassword({ email: user.email, password: user.password })).error).toBeNull();
    const metadata = await client.from("nba_dataset_imports").select("season")
      .order("completed_at", { ascending: false }).order("id", { ascending: false }).limit(1).single();
    expect(metadata.error).toBeNull();
    const season = metadata.data!.season;
    const selected = await client.from("nba_season_players").select("id,appearances")
      .eq("season", season).order("appearances", { ascending: false }).order("id").limit(1).single();
    expect(selected.error).toBeNull();
    const historyQuery = () => client.from("nba_player_history").select("*")
      .eq("player_id", selected.data!.id).eq("season", season)
      .order("game_date", { ascending: false }).order("game_id", { ascending: false });
    const history = await historyQuery().range(0, 20);
    expect(history.error).toBeNull();
    expect(history.data!.length).toBeGreaterThan(0);
    expect(history.data!.length).toBeLessThanOrEqual(21);
    const again = await historyQuery().range(0, 20);
    expect(again.error).toBeNull();
    expect(again.data).toEqual(history.data);
    const allCount = await client.from("nba_player_history").select("game_id", { count: "exact", head: true })
      .eq("player_id", selected.data!.id).eq("season", season);
    expect(allCount.error).toBeNull();
    expect(allCount.count).toBe(selected.data!.appearances);
    const rows = history.data!;
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      expect(typeof row.game_id).toBe("string");
      expect(row.game_id).toMatch(/^00225\d{5}$/);
      expect(row.game_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.player_id).toBe(selected.data!.id);
      expect(row.season).toBe(season);
      if (index > 0) {
        const previous = rows[index - 1];
        expect(previous.game_date > row.game_date ||
          (previous.game_date === row.game_date && previous.game_id >= row.game_id)).toBe(true);
      }
    }
    const recent = rows[0];
    const stat = await client.from("nba_player_game_stats").select("*")
      .eq("player_id", recent.player_id).eq("game_id", recent.game_id).single();
    const game = await client.from("nba_games").select("*").eq("id", recent.game_id).single();
    expect(stat.error).toBeNull();
    expect(game.error).toBeNull();
    const isHome = stat.data!.team_id === game.data!.home_team_id;
    const opponentId = isHome ? game.data!.away_team_id : game.data!.home_team_id;
    const teams = await client.from("nba_teams").select("id,name,abbreviation").in("id", [stat.data!.team_id, opponentId]);
    expect(teams.error).toBeNull();
    const team = teams.data!.find(team => team.id === stat.data!.team_id)!;
    const opponent = teams.data!.find(team => team.id === opponentId)!;
    expect(recent.team_id).toBe(stat.data!.team_id);
    expect(recent.team_name).toBe(team.name);
    expect(recent.team_abbreviation).toBe(team.abbreviation);
    expect(recent.opponent_id).toBe(opponentId);
    expect(recent.opponent_name).toBe(opponent.name);
    expect(recent.opponent_abbreviation).toBe(opponent.abbreviation);
    expect(recent.is_home).toBe(isHome);
    expect(recent.game_date).toBe(game.data!.game_date);
    for (const column of ["minutes", "points", "rebounds", "assists", "steals", "blocks", "turnovers"]) {
      expect(recent[column]).toBe(stat.data![column]);
    }
    const anonymous = createTestClient();
    expect((await anonymous.from("nba_player_history").select("game_id").limit(1)).error).not.toBeNull();
    expect((await client.from("nba_player_history").delete().eq("player_id", 999999999)).error).not.toBeNull();
  } finally {
    await deleteTestUser(user);
  }
});

test("authenticated search RPC treats wildcard characters literally and enforces bounds", async () => {
  const user = await createTestUser("literal-query");
  try {
    const client = createTestClient();
    expect((await client.auth.signInWithPassword({ email: user.email, password: user.password })).error).toBeNull();
    const metadata = await client.from("nba_dataset_imports").select("season")
      .order("completed_at", { ascending: false }).order("id", { ascending: false }).limit(1).single();
    expect(metadata.error).toBeNull();
    const season = metadata.data!.season;
    const first = await client.from("nba_season_players").select("id,full_name")
      .eq("season", season).order("full_name").order("id").limit(1).single();
    expect(first.error).toBeNull();
    const search = (query: string | null, offset: number | null) => client.rpc("search_season_players", {
      p_season: season, p_query: query, p_offset: offset,
    });
    const normal = await search(first.data!.full_name, 0);
    expect(normal.error).toBeNull();
    expect(normal.data.some((player: { id: number }) => player.id === first.data!.id)).toBe(true);
    // The real and ordinary synthetic datasets contain no names with these
    // literal characters. Positive literal matches have rollback SQL fixtures.
    for (const literal of ["*", "%", "_", "\\"]) {
      const result = await search(literal, 0);
      expect(result.error, `literal ${literal}`).toBeNull();
      expect(result.data, `literal ${literal} must not match ordinary names`).toEqual([]);
    }
    const bounded = await search("", 0);
    const sourcePage = await client.from("nba_season_players").select(directoryColumns)
      .eq("season", season).order("full_name").order("id").range(0, 20);
    expect(bounded.error).toBeNull();
    expect(sourcePage.error).toBeNull();
    expect(bounded.data).toHaveLength(21);
    expect(bounded.data).toEqual(sourcePage.data);
    const next = await search("", 20);
    const sourceNext = await client.from("nba_season_players").select(directoryColumns)
      .eq("season", season).order("full_name").order("id").range(20, 40);
    expect(next.error).toBeNull();
    expect(sourceNext.error).toBeNull();
    expect(next.data.length).toBeLessThanOrEqual(21);
    expect(next.data).toEqual(sourceNext.data);
    for (const invalidOffset of [null, -1, 199981]) {
      const rejected = await search("", invalidOffset);
      expect(rejected.error?.code).toBe("22023");
      expect(rejected.data).toBeNull();
    }
    for (const invalidQuery of [null, "x".repeat(81)]) {
      const rejected = await search(invalidQuery, 0);
      expect(rejected.error?.code).toBe("22023");
      expect(rejected.data).toBeNull();
    }
    const anonymous = await createTestClient().rpc("search_season_players", {
      p_season: season, p_query: "", p_offset: 0,
    });
    expect(anonymous.error?.code).toBe("42501");
    expect(anonymous.data).toBeNull();
  } finally {
    await deleteTestUser(user);
  }
});
