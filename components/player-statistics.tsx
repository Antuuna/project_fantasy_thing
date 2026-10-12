import type { SeasonPlayer } from "@/lib/players/types";

export function PlayerStatistics({ player }: { player: SeasonPlayer }) {
  return <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
    {([['Appearances', player.appearances], ['Minutes', player.minutes], ['Points', player.points],
      ['Rebounds', player.rebounds], ['Assists', player.assists], ['Steals', player.steals],
      ['Blocks', player.blocks], ['Turnovers', player.turnovers]] as const).map(([label, value]) =>
      <div key={label} className="bg-surface p-4 text-center">
        <dt className="font-display text-xs font-bold uppercase tracking-wide text-muted">{label}</dt>
        <dd className="mt-1 font-display text-3xl font-bold tabular-nums text-ink">{label === 'Appearances' ? value : Number(value).toFixed(1)}</dd></div>)}
  </dl>;
}
