import Link from "next/link";
import type { PlannerPlayer } from "@/lib/planner/types";
import type { DateAppearance } from "@/lib/lineups/types";

export function RosterGames({ date, members, appearances }: {
  date: string; members: PlannerPlayer[]; appearances: DateAppearance[];
}) {
  return <section aria-labelledby="historical-games-heading" className="rounded-xl border border-slate-700 bg-slate-900 p-5">
    <h2 id="historical-games-heading" className="text-xl font-semibold">Historical games</h2>
    <p className="mt-2 text-sm text-slate-400">Recorded appearances for your current roster on {date}.</p>
    {!members.length ? <p className="mt-4 text-slate-300">Add players to your roster to see recorded appearances.</p> :
      <ul className="mt-4 divide-y divide-slate-700">
        {members.map(player => {
          const games = appearances.filter(appearance => appearance.player_id === player.id);
          return <li key={player.id} className="py-4">
            <Link href={`/players/${player.id}`} className="font-medium text-orange-300 underline underline-offset-4">
              {player.full_name}
            </Link>
            {games.length ? <ul className="mt-2 space-y-2 text-sm text-slate-300">
              {games.map(game => <li key={game.game_id}>
                <span>{game.team_name} ({game.team_abbreviation}) {game.is_home ? "vs." : "at"} {game.opponent_name} ({game.opponent_abbreviation})</span>
                <span className="mt-1 block text-slate-400">{game.points} points · Game {game.game_id}</span>
              </li>)}
            </ul> : <p className="mt-2 text-sm text-slate-400">No recorded appearance on this date; team and availability are unknown.</p>}
          </li>;
        })}
      </ul>}
  </section>;
}
