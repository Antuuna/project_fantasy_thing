import { MutationForm } from "./mutation-form";

export function PlayerControls({ playerId }: { playerId: number }) {
  return (
    <div className="flex flex-wrap gap-4" aria-label="Save this player">
      <MutationForm operation="add-roster" playerId={playerId} label="Add to roster" />
      <MutationForm operation="add-watch" playerId={playerId} label="Add to watchlist" />
    </div>
  );
}
