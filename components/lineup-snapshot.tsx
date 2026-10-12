import Link from "next/link";
import type { PlannerPlayer } from "@/lib/planner/types";
import type { SavedPlayer } from "@/lib/lineups/types";

export function LineupSnapshot({ saved, members }: { saved: SavedPlayer[]; members: PlannerPlayer[] }) {
  const currentIds = new Set(members.map(player => player.id));
  const bench = saved.filter(entry => entry.slot === "bench");
  const playerLabel = (entry: SavedPlayer) => <>
    <Link href={`/players/${entry.player_id}`} className="link">
      {entry.player.full_name}
    </Link>
    {!currentIds.has(entry.player_id) && <span className="mt-0.5 block text-xs text-warning">Removed from current roster</span>}
  </>;
  const groupHeading = "-mx-5 border-y border-line bg-surface-alt px-5 py-1.5 font-display text-xs font-bold uppercase tracking-wide muted";
  return <section aria-labelledby="saved-snapshot-heading" className="card">
    <h2 id="saved-snapshot-heading" className="card-head card-title">Saved snapshot</h2>
    {!saved.length ? <p role="status" className="muted">No saved lineup for this date.</p> : <>
      <p className="text-sm muted">The saved assignments remain available after roster changes.</p>
      <h3 className={`mt-4 ${groupHeading}`}>Starters</h3>
      <ol>
        {[1, 2, 3, 4, 5].map(slot => {
          const entry = saved.find(player => player.slot === `starter_${slot}`);
          return <li key={slot} className="flex items-start gap-3 border-b border-line py-2.5 last:border-b-0">
            <span className="w-20 shrink-0 font-display text-xs font-bold uppercase tracking-wide muted pt-0.5">Starter {slot}</span>
            <div>{entry ? playerLabel(entry) : <span className="muted">No player saved in this slot.</span>}</div>
          </li>;
        })}
      </ol>
      <h3 className={`mt-2 ${groupHeading}`}>Bench</h3>
      {bench.length ? <ul>
        {bench.map(entry => <li key={entry.player_id} className="border-b border-line py-2.5 last:border-b-0">{playerLabel(entry)}</li>)}
      </ul> : <p className="mt-2 text-sm muted">No players were saved on the bench.</p>}
    </>}
  </section>;
}
