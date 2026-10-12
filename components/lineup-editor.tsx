"use client";

import { useActionState, useEffect, useState } from "react";
import { saveLineup } from "@/app/lineups/actions";
import type { SavedPlayer } from "@/lib/lineups/types";
import type { MutationState, PlannerPlayer } from "@/lib/planner/types";
import { benchPlayers, initialSelection, selectionError, selectionIsDirty, type StarterSelection } from "@/lib/lineups/selection";

export function LineupEditor({ date, members, saved }: { date: string; members: PlannerPlayer[]; saved: SavedPlayer[] }) {
  const baseline = initialSelection(members, saved);
  const [selection, setSelection] = useState<StarterSelection>(() => [...baseline]);
  const [state, action, pending] = useActionState<MutationState, FormData>(saveLineup, {});
  const dirty = selectionIsDirty(selection, baseline);
  const warning = selectionError(selection, members);
  const bench = benchPlayers(members, selection);
  const currentIds = new Set(members.map(player => player.id));
  const removedStarters = saved.some(entry => entry.slot.startsWith("starter_") && !currentIds.has(entry.player_id));

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  function changeStarter(slot: number, playerId: string) {
    setSelection(previous => previous.map((id, index) => index === slot ? playerId : id) as StarterSelection);
  }

  return (
    <section aria-labelledby="lineup-editor-heading" className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <h2 id="lineup-editor-heading" className="text-xl font-semibold">Lineup editor</h2>
      <p role="status" className="mt-2 font-medium text-orange-300">
        {dirty ? "Unsaved changes" : saved.length ? "Saved lineup" : "Unsaved selection"}
      </p>
      <p className="mt-2 text-sm text-slate-300">Changing date or leaving this page discards unsaved changes.</p>
      {removedStarters && <p className="mt-3 text-amber-300">A saved starter is no longer on your roster. Choose a current player for each empty slot before saving.</p>}
      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="lineup_date" value={date} />
        <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
          {selection.map((playerId, slot) => (
            <div key={slot} className="block text-sm font-medium">
              <label htmlFor={`starter-${slot + 1}`}>Starter {slot + 1}</label>
              <select
                id={`starter-${slot + 1}`}
                name={`starter_${slot + 1}`}
                value={playerId}
                onChange={event => changeStarter(slot, event.target.value)}
                required
                className="mt-2 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3"
              >
                <option value="">Choose a player</option>
                {members.map(player => <option key={player.id} value={player.id}>{player.full_name}</option>)}
              </select>
            </div>
          ))}
        </fieldset>
        {warning && <p className="text-sm text-amber-300">{warning}</p>}
        <div>
          <h3 className="font-medium">Bench for this selection</h3>
          {bench.length ? <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-300">
            {bench.map(player => <li key={player.id}>{player.full_name}</li>)}
          </ul> : <p className="mt-2 text-sm text-slate-400">No remaining bench players.</p>}
        </div>
        <p className="text-sm text-slate-400">All remaining current roster players are saved on the bench. Players can start even without a game on this date.</p>
        <button disabled={pending || warning !== null} className="rounded-lg bg-orange-400 px-4 py-3 font-semibold text-slate-950 hover:bg-orange-300 disabled:opacity-60">
          {pending ? "Saving…" : "Save lineup"}
        </button>
        {state.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
        {state.message && !dirty && <p role="status" className="text-sm text-green-300">{state.message}</p>}
      </form>
    </section>
  );
}
