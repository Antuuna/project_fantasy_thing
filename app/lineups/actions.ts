'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { parsePlayerId } from '@/lib/players/validation';
import { PlannerValidationError, textField } from '@/lib/planner/validation';
import { seasonDate } from '@/lib/lineups/validation';
import type { MutationState } from '@/lib/planner/types';

export async function saveLineup(_:MutationState, form:FormData): Promise<MutationState> {
  const {supabase} = await requireUser();
  try {
    const metadata = await supabase.from('nba_dataset_imports').select('date_min,date_max')
      .order('completed_at', {ascending:false}).order('id', {ascending:false}).limit(1).maybeSingle();
    if (metadata.error) return {error:'Unable to load dataset information. Please try again.'};
    if (!metadata.data) return {error:'No dataset imported. A lineup cannot be saved yet.'};
    const date = seasonDate(textField(form,'lineup_date'),metadata.data.date_min,metadata.data.date_max);
    let starters: number[];
    try { starters = Array.from({length:5},(_,index)=>parsePlayerId(textField(form,`starter_${index+1}`))); }
    catch { return {error:'Choose exactly five distinct starters.'}; }
    if (new Set(starters).size !== 5) return {error:'Choose exactly five distinct starters.'};
    const members = await supabase.from('roster_members').select('player_id').limit(10);
    if (members.error) return {error:'Unable to load your roster. Please try again.'};
    if (!starters.every(id=>members.data?.some(member=>member.player_id===id))) return {error:'Every starter must belong to your current roster.'};
    const {error} = await supabase.rpc('save_lineup', {p_date:date,p_starters:starters});
    if (error) {
      if (error.code==='23514') return {error:'The roster or season changed. Reload and choose five current roster players for a valid date.'};
      return {error:'Unable to save your lineup. Please try again.'};
    }
    revalidatePath('/dashboard');
    return {message:'Lineup saved.'};
  } catch (error) {
    if (error instanceof PlannerValidationError) return {error:error.message};
    return {error:'Unable to save your lineup. Please try again.'};
  }
}
