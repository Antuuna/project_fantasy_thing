'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { parsePlayerId, PlayerValidationError } from '@/lib/players/validation';
import { PlannerValidationError, rosterName, textField, watchNotes } from '@/lib/planner/validation';
import type { MutationState } from '@/lib/planner/types';

export async function mutatePlanner(_: MutationState, form: FormData): Promise<MutationState> {
  const { supabase, claims } = await requireUser();
  try {
    const operation = textField(form, 'operation');
    let error: {code?: string} | null;
    let message: string;
    if (operation === 'rename') {
      const name = rosterName(textField(form, 'name'));
      const init = await supabase.rpc('ensure_roster');
      if (init.error) return {error: 'Unable to initialize your roster. Please try again.'};
      const result = await supabase.from('rosters').update({name}).eq('user_id', claims.sub).select('id').maybeSingle();
      error = result.error;
      if (!error && !result.data) return {error: 'Your roster could not be renamed. Please try again.'};
      message = 'Roster renamed.';
    } else {
      const player = parsePlayerId(textField(form, 'player_id'));
      if (operation === 'add-roster' || operation === 'remove-roster') {
        const result = await supabase.rpc(operation === 'add-roster' ? 'add_roster_player' : 'remove_roster_player', {p_player_id: player});
        error = result.error;
        message = operation === 'add-roster' ? 'Player added to roster.' : 'Player removed from roster. Saved lineups are preserved.';
      } else if (operation === 'add-watch') {
        const result = await supabase.from('watchlist_entries').insert({player_id: player, notes: ''});
        error = result.error;
        message = 'Player added to watchlist.';
      } else if (operation === 'notes' || operation === 'remove-watch') {
        const request = operation === 'notes'
          ? supabase.from('watchlist_entries').update({notes: watchNotes(textField(form, 'notes'))})
          : supabase.from('watchlist_entries').delete();
        const result = await request.eq('player_id', player).eq('user_id', claims.sub).select('id').maybeSingle();
        error = result.error;
        if (!error && !result.data) return {error: 'This watchlist entry no longer exists. Reload your watchlist.'};
        message = operation === 'notes' ? 'Notes saved.' : 'Player removed from watchlist.';
      } else return {error: 'Choose a supported roster or watchlist action.'};
    }
    if (error) {
      if (error.code === '23505') return {error: operation === 'add-watch' ? 'Player is already on your watchlist.' : 'Player is already on your roster.'};
      if (error.code === '23514' && operation === 'add-roster') return {error: 'Your roster is full. Remove a player before adding another (maximum 10).'};
      if (error.code === '23503') return {error: 'This player is unavailable. Please choose an imported player.'};
      return {error: 'Unable to save your change. Please try again.'};
    }
    revalidatePath('/dashboard');
    revalidatePath('/watchlist');
    revalidatePath('/players', 'layout');
    return {message};
  } catch (error) {
    if (error instanceof PlannerValidationError || error instanceof PlayerValidationError) return {error: error.message};
    return {error: 'Unable to save your change. Please try again.'};
  }
}
