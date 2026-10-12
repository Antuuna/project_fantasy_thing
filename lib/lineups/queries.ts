import 'server-only';
import { requireUser } from '@/lib/auth/session';
import { getRoster } from '@/lib/planner/queries';
import type { DatasetMetadata } from '@/lib/players/types';
import type { DashboardData, DateAppearance, SavedPlayer } from './types';
import { seasonDate } from './validation';
import { PlannerValidationError } from '@/lib/planner/validation';

export async function getDashboard(value?: string|string[]): Promise<DashboardData> {
  const {supabase} = await requireUser();
  const {roster, members} = await getRoster();
  const importResult = await supabase.from('nba_dataset_imports').select('season,completed_at,date_min,date_max')
    .order('completed_at', {ascending:false}).order('id', {ascending:false}).limit(1).maybeSingle();
  if (importResult.error) throw new Error('Unable to load dataset information.');
  const metadata = importResult.data as DatasetMetadata|null;
  if (!metadata) return {roster,members,metadata,date:null,saved:[],appearances:[]};
  if (value !== undefined && typeof value !== 'string') throw new PlannerValidationError('Choose one historical date.');
  const date = seasonDate(value ?? metadata.date_min, metadata.date_min, metadata.date_max);
  const savedResult = await supabase.from('lineup_entries').select('player_id,slot,player:nba_players(id,full_name,position)')
    .eq('lineup_date', date).order('slot').order('player_id').limit(10);
  if (savedResult.error) throw new Error('Unable to load your saved lineup.');
  let appearances: DateAppearance[] = [];
  if (members.length) {
    const result = await supabase.from('nba_player_history')
      .select('player_id,game_id,team_name,team_abbreviation,opponent_name,opponent_abbreviation,is_home,points')
      .eq('season', metadata.season).eq('game_date', date).in('player_id', members.map(player=>player.id))
      .order('game_id').order('player_id').limit(100);
    if (result.error) throw new Error('Unable to load historical games.');
    appearances = result.data as DateAppearance[];
  }
  return {roster,members,metadata,date,saved:savedResult.data as unknown as SavedPlayer[],appearances};
}
