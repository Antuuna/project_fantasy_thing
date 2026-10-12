import Link from "next/link";
import type { PlannerPlayer } from "@/lib/planner/types";
import type { DateAppearance } from "@/lib/lineups/types";

export function RosterGames({ date, members, appearances }: {
  date: string; members: PlannerPlayer[]; appearances: DateAppearance[];
}) {
  return <section aria-labelledby="historical-games-heading" className="card">
    <div className="card-head">
      <h2 id="historical-games-heading" className="card-title">Historical games</h2>
      <p className="text-xs muted">Recorded appearances for your current roster on {date}.</p>
    </div>
    {!members.length ? <p className="muted">Add players to your roster to see recorded appearances.</p> :
      <ul className="-mx-5 -mb-5">
        {members.map(player => {
          const games = appearances.filter(appearance => appearance.player_id === player.id);
          return <li key={player.id} className="border-b border-line px-5 py-3 last:border-b-0">
            <Link href={`/players/${player.id}`} className="link">
              {player.full_name}
            </Link>
            {games.length ? <ul className="mt-1 space-y-1 text-sm">
              {games.map(game => <li key={game.game_id} className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span>{game.team_name} ({game.team_abbreviation}) {game.is_home ? "vs." : "at"} {game.opponent_name} ({game.opponent_abbreviation})</span>
                <span className="muted"><strong className="font-display text-base tabular-nums text-ink">{game.points}</strong> points · Game {game.game_id}</span>
              </li>)}
            </ul> : <p className="mt-1 text-sm muted">No recorded appearance on this date; team and availability are unknown.</p>}
          </li>;
        })}
      </ul>}
  </section>;
}
