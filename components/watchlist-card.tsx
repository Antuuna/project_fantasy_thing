import Link from "next/link";
import type { WatchEntry } from "@/lib/planner/types";
import { MutationForm } from "@/components/mutation-form";

export function WatchlistCard({ entry }: { entry: WatchEntry }) {
  return <article className="rounded-xl border border-slate-700 bg-slate-900 p-5">
    <h2 className="text-xl font-semibold">
      <Link href={`/players/${entry.player_id}`} className="text-orange-300 underline underline-offset-4">
        {entry.player.full_name}
      </Link>
    </h2>
    <p className="mt-2 text-sm text-slate-300">Position: {entry.player.position ?? "Unknown"}</p>
    <div className="mt-4">
      <MutationForm operation="notes" playerId={entry.player_id} label="Save notes">
        <label htmlFor={`notes-${entry.id}`} className="block">
          Notes for {entry.player.full_name}
        </label>
        <textarea id={`notes-${entry.id}`} key={entry.updated_at} name="notes" defaultValue={entry.notes} maxLength={2000} rows={4}
          className="mt-2 block w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
        <p className="mt-1 text-sm text-slate-400">Up to 2,000 characters.</p>
      </MutationForm>
    </div>
    <div className="mt-5 flex flex-wrap items-start gap-4">
      <MutationForm operation="add-roster" playerId={entry.player_id} label="Add to roster" />
      <MutationForm operation="remove-watch" playerId={entry.player_id} label="Remove from watchlist" />
    </div>
    <p className="mt-3 text-sm text-slate-400">Adding to your roster keeps this player and your notes on the watchlist.</p>
  </article>;
}
