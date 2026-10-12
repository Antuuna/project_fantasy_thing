import Link from "next/link";
import type { PlannerPlayer } from "@/lib/planner/types";
import type { SavedPlayer } from "@/lib/lineups/types";

export function LineupSnapshot({ saved, members }: { saved: SavedPlayer[]; members: PlannerPlayer[] }) {
  const currentIds = new Set(members.map(player => player.id));
  const bench = saved.filter(entry => entry.slot === "bench");
  const playerLabel = (entry: SavedPlayer) => <>
    <Link href={`/players/${entry.player_id}`} className="text-orange-300 underline underline-offset-4">
      {entry.player.full_name}
    </Link>
    {!currentIds.has(entry.player_id) && <span className="mt-1 block text-sm text-amber-300">Removed from current roster</span>}
  </>;
  return <section aria-labelledby="saved-snapshot-heading" className="rounded-xl border border-slate-700 bg-slate-900 p-5">
    <h2 id="saved-snapshot-heading" className="text-xl font-semibold">Saved snapshot</h2>
    {!saved.length ? <p role="status" className="mt-4 text-slate-300">No saved lineup for this date.</p> : <>
      <p className="mt-2 text-sm text-slate-400">The saved assignments remain available after roster changes.</p>
      <h3 className="mt-5 font-semibold">Starters</h3>
      <ol className="mt-2 divide-y divide-slate-700">
        {[1, 2, 3, 4, 5].map(slot => {
          const entry = saved.find(player => player.slot === `starter_${slot}`);
          return <li key={slot} className="flex gap-3 py-3">
            <span className="shrink-0 text-sm text-slate-400">Starter {slot}</span>
            <div>{entry ? playerLabel(entry) : <span className="text-slate-400">No player saved in this slot.</span>}</div>
          </li>;
        })}
      </ol>
      <h3 className="mt-5 font-semibold">Bench</h3>
      {bench.length ? <ul className="mt-2 divide-y divide-slate-700">
        {bench.map(entry => <li key={entry.player_id} className="py-3">{playerLabel(entry)}</li>)}
      </ul> : <p className="mt-2 text-sm text-slate-400">No players were saved on the bench.</p>}
    </>}
  </section>;
}
