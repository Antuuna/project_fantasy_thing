export const PLAYER_PAGE_SIZE = 20 as const;

export type DatasetMetadata = {
  season: string;
  completed_at: string;
  date_min: string;
  date_max: string;
};

export type BasketballStats = {
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
};

export type SeasonPlayer = BasketballStats & {
  id: number;
  full_name: string;
  position: string | null;
  season: string;
  appearances: number;
};

export type HistoricalTeam = { id: number; name: string; abbreviation: string };

export type PlayerAppearance = BasketballStats & {
  game_id: string;
  game_date: string;
  season: string;
  team: HistoricalTeam;
  opponent: HistoricalTeam;
  is_home: boolean;
};

export type PlayerList = {
  metadata: DatasetMetadata | null;
  players: SeasonPlayer[];
  query: string;
  page: number;
  pageSize: typeof PLAYER_PAGE_SIZE;
  hasNext: boolean;
};

export type PlayerDetails = {
  metadata: DatasetMetadata | null;
  player: SeasonPlayer | null;
  history: PlayerAppearance[];
  page: number;
  pageSize: typeof PLAYER_PAGE_SIZE;
  hasNext: boolean;
};
