import 'server-only';
import { requireUser } from '@/lib/auth/session';
import { parsePage, type UrlValue } from '@/lib/players/validation';
import type { PlannerPlayer, Roster, WatchEntry } from './types';

export async function getRoster(): Promise<{roster: Roster; members: PlannerPlayer[]}> {
  const { supabase } = await requireUser();
  const init = await supabase.rpc('ensure_roster');
  if (init.error) throw new Error('Unable to initialize your roster. Please try again.');
  const [roster, members] = await Promise.all([
    supabase.from('rosters').select('id,name').single(),
    supabase.from('roster_members').select('player:nba_players(id,full_name,position)').order('created_at').order('id').limit(10),
  ]);
  if (roster.error || members.error || !roster.data) throw new Error('Unable to load your roster. Please try again.');
  const rows = members.data as unknown as {player: PlannerPlayer}[];
  return { roster: roster.data as Roster, members: rows.map(row => row.player) };
}

export async function getWatchlist(value?: UrlValue): Promise<{entries: WatchEntry[];page: number;hasNext: boolean}> {
  const { supabase } = await requireUser();
  const page = parsePage(value);
  const offset = (page - 1) * 20;
  const { data, error } = await supabase.from('watchlist_entries')
    .select('id,player_id,notes,updated_at,player:nba_players(id,full_name,position)')
    .order('created_at', {ascending: false}).order('id', {ascending: false}).range(offset, offset + 20);
  if (error) throw new Error('Unable to load your watchlist. Please try again.');
  const entries = (data ?? []) as unknown as WatchEntry[];
  return {entries: entries.slice(0, 20), page, hasNext: entries.length > 20};
}
