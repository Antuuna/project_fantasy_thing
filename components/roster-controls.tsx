import Link from "next/link";
import type { PlannerPlayer } from "@/lib/planner/types";
import { MutationForm } from "./mutation-form";

export function RosterControls({ name, members }: { name: string; members: PlannerPlayer[] }) {
  return (
    <section aria-labelledby="current-roster-heading" className="card">
      <div className="card-head">
        <h2 id="current-roster-heading" className="card-title">Current roster</h2>
        <p className="font-display text-sm font-bold tabular-nums muted">{members.length} / 10 players</p>
      </div>

      <MutationForm operation="rename" label="Rename roster">
        <label htmlFor="roster-name" className="label">Roster name</label>
        <input
          id="roster-name"
          name="name"
          defaultValue={name}
          required
          maxLength={80}
          className="field"
        />
      </MutationForm>

      {members.length === 0 ? (
        <p className="mt-6 muted">
          Your roster is empty. <Link href="/players" className="link">Search players</Link> to choose up to ten players.
        </p>
      ) : (
        <ul className="-mx-5 mt-6 border-t border-line">
          {members.map((player) => (
            <li key={player.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-b-0 hover:bg-surface-alt">
              <div>
                <Link href={`/players/${player.id}`} className="link">{player.full_name}</Link>
                <p className="mt-0.5 text-xs uppercase tracking-wide muted">{player.position ?? "Position unknown"}</p>
              </div>
              <MutationForm operation="remove-roster" playerId={player.id} label="Remove from roster" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
