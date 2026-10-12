import Link from "next/link";
import type { WatchEntry } from "@/lib/planner/types";
import { MutationForm } from "@/components/mutation-form";

export function WatchlistCard({ entry }: { entry: WatchEntry }) {
  return <article className="card">
    <div className="card-head">
      <h2 className="font-display text-xl font-bold">
        <Link href={`/players/${entry.player_id}`} className="link">
          {entry.player.full_name}
        </Link>
      </h2>
      <p className="badge">Position: {entry.player.position ?? "Unknown"}</p>
    </div>
    <MutationForm operation="notes" playerId={entry.player_id} label="Save notes">
      <label htmlFor={`notes-${entry.id}`} className="label">
        Notes for {entry.player.full_name}
      </label>
      <textarea id={`notes-${entry.id}`} key={entry.updated_at} name="notes" defaultValue={entry.notes} maxLength={2000} rows={4}
        className="field resize-y" />
      <p className="mt-1 text-xs muted">Up to 2,000 characters.</p>
    </MutationForm>
    <div className="mt-5 flex flex-wrap items-start gap-3 border-t border-line pt-4">
      <MutationForm operation="add-roster" playerId={entry.player_id} label="Add to roster" />
      <MutationForm operation="remove-watch" playerId={entry.player_id} label="Remove from watchlist" />
    </div>
    <p className="mt-3 text-xs muted">Adding to your roster keeps this player and your notes on the watchlist.</p>
  </article>;
}
