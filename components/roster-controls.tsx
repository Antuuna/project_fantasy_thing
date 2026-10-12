import Link from "next/link";
import type { PlannerPlayer } from "@/lib/planner/types";
import { MutationForm } from "./mutation-form";

export function RosterControls({ name, members }: { name: string; members: PlannerPlayer[] }) {
  return (
    <section aria-labelledby="current-roster-heading" className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="current-roster-heading" className="text-xl font-semibold">Current roster</h2>
        <p className="text-slate-300">{members.length} / 10 players</p>
      </div>

      <MutationForm operation="rename" label="Rename roster">
        <label htmlFor="roster-name" className="block text-sm font-medium text-slate-200">Roster name</label>
        <input
          id="roster-name"
          name="name"
          defaultValue={name}
          required
          maxLength={80}
          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
        />
      </MutationForm>

      {members.length === 0 ? (
        <p className="mt-6 text-slate-300">
          Your roster is empty. <Link href="/players" className="text-orange-300 underline">Search players</Link> to choose up to ten players.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-700">
          {members.map((player) => (
            <li key={player.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <Link href={`/players/${player.id}`} className="font-medium text-orange-300 underline">{player.full_name}</Link>
                <p className="mt-1 text-sm text-slate-400">{player.position ?? "Position unknown"}</p>
              </div>
              <MutationForm operation="remove-roster" playerId={player.id} label="Remove from roster" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
