import "server-only";

import { requireUser } from "@/lib/auth/session";
import { PLAYER_PAGE_SIZE, type DatasetMetadata, type PlayerAppearance, type PlayerDetails, type PlayerList, type SeasonPlayer } from "./types";
import { escapeSearch, parsePage, parsePlayerId, parseSearch, type UrlValue } from "./validation";

export class PlayerQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerQueryError";
  }
}

type SessionClient = Awaited<ReturnType<typeof requireUser>>["supabase"];

async function latestMetadata(supabase: SessionClient): Promise<DatasetMetadata | null> {
  const { data, error } = await supabase.from("nba_dataset_imports")
    .select("season,completed_at,date_min,date_max").order("completed_at", { ascending: false })
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new PlayerQueryError("Dataset information could not be loaded. Please try again.");
  return data as DatasetMetadata | null;
}

const playerColumns = "id,full_name,position,season,appearances,minutes,points,rebounds,assists,steals,blocks,turnovers";
const historyColumns = "game_id,game_date,season,team_id,team_name,team_abbreviation,opponent_id,opponent_name,opponent_abbreviation,is_home,minutes,points,rebounds,assists,steals,blocks,turnovers";

type HistoryRow = Omit<PlayerAppearance, "team" | "opponent"> & {
  team_id: number; team_name: string; team_abbreviation: string;
  opponent_id: number; opponent_name: string; opponent_abbreviation: string;
};

function appearance(row: HistoryRow): PlayerAppearance {
  return {
    game_id: row.game_id, game_date: row.game_date, season: row.season,
    team: { id: row.team_id, name: row.team_name, abbreviation: row.team_abbreviation },
    opponent: { id: row.opponent_id, name: row.opponent_name, abbreviation: row.opponent_abbreviation },
    is_home: row.is_home, minutes: row.minutes, points: row.points,
    rebounds: row.rebounds, assists: row.assists, steals: row.steals,
    blocks: row.blocks, turnovers: row.turnovers,
  };
}

export async function listPlayers(input: { query?: UrlValue; page?: UrlValue } = {}): Promise<PlayerList> {
  const { supabase } = await requireUser();
  const query = parseSearch(input.query);
  const page = parsePage(input.page);
  const metadata = await latestMetadata(supabase);
  const empty: PlayerList = { metadata, players: [], query, page, pageSize: PLAYER_PAGE_SIZE, hasNext: false };
  if (!metadata) return empty;
  let request = supabase.from("nba_season_players").select(playerColumns).eq("season", metadata.season)
    .order("full_name", { ascending: true }).order("id", { ascending: true });
  if (query) request = request.ilike("full_name", `%${escapeSearch(query)}%`);
  const offset = (page - 1) * PLAYER_PAGE_SIZE;
  const { data, error } = await request.range(offset, offset + PLAYER_PAGE_SIZE);
  if (error) throw new PlayerQueryError("Players could not be loaded. Please try again.");
  const rows = (data ?? []) as SeasonPlayer[];
  return { ...empty, players: rows.slice(0, PLAYER_PAGE_SIZE), hasNext: rows.length > PLAYER_PAGE_SIZE };
}

export async function getPlayer(id: string, pageValue?: UrlValue): Promise<PlayerDetails> {
  const { supabase } = await requireUser();
  const playerId = parsePlayerId(id);
  const page = parsePage(pageValue);
  const metadata = await latestMetadata(supabase);
  const empty: PlayerDetails = { metadata, player: null, history: [], page, pageSize: PLAYER_PAGE_SIZE, hasNext: false };
  if (!metadata) return empty;
  const { data: player, error: playerError } = await supabase.from("nba_season_players")
    .select(playerColumns).eq("season", metadata.season).eq("id", playerId).maybeSingle();
  if (playerError) throw new PlayerQueryError("Player details could not be loaded. Please try again.");
  if (!player) return empty;
  const offset = (page - 1) * PLAYER_PAGE_SIZE;
  const { data, error } = await supabase.from("nba_player_history").select(historyColumns)
    .eq("season", metadata.season).eq("player_id", playerId)
    .order("game_date", { ascending: false }).order("game_id", { ascending: false })
    .range(offset, offset + PLAYER_PAGE_SIZE);
  if (error) throw new PlayerQueryError("Game history could not be loaded. Please try again.");
  const rows = (data ?? []) as HistoryRow[];
  return { ...empty, player: player as SeasonPlayer,
    history: rows.slice(0, PLAYER_PAGE_SIZE).map(appearance), hasNext: rows.length > PLAYER_PAGE_SIZE };
}
