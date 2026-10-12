import type { SeasonPlayer } from "@/lib/players/types";

export function PlayerStatistics({ player }: { player: SeasonPlayer }) {
  return <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
    {([['Appearances', player.appearances], ['Minutes', player.minutes], ['Points', player.points],
      ['Rebounds', player.rebounds], ['Assists', player.assists], ['Steals', player.steals],
      ['Blocks', player.blocks], ['Turnovers', player.turnovers]] as const).map(([label, value]) =>
      <div key={label} className="rounded-lg bg-slate-800 p-3"><dt className="text-sm text-slate-300">{label}</dt>
        <dd className="mt-1 text-xl font-semibold">{label === 'Appearances' ? value : Number(value).toFixed(1)}</dd></div>)}
  </dl>;
}
