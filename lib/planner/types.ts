export type PlannerPlayer = { id: number; full_name: string; position: string | null };
export type Roster = { id: string; name: string };
export type WatchEntry = { id: string; player_id: number; notes: string; updated_at: string; player: PlannerPlayer };
export type MutationState = { error?: string; message?: string };
export type PlannerOperation = 'rename' | 'add-roster' | 'remove-roster' | 'add-watch' | 'remove-watch' | 'notes';
