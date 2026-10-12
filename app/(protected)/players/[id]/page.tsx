import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayer } from "@/lib/players/queries";
import { PlayerValidationError } from "@/lib/players/validation";
import { PlayerStatistics } from "@/components/player-statistics";
import { PlayerControls } from "@/components/player-controls";

export default async function Player({ params, searchParams }: { params: Promise<{id: string}>, searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const search = await searchParams;
  let result;
  try { result = await getPlayer(id, search.page); }
  catch (error) {
    if (!(error instanceof PlayerValidationError)) throw error;
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
    return <section><h1 className="text-3xl font-bold">Game history</h1><p role="alert" className="mt-4 text-red-300">{error.message}</p><Link href={`/players/${id}`} className="mt-4 inline-block text-orange-300">Back to player</Link></section>;
  }
  if (!result.metadata) return <section><h1 className="text-3xl font-bold">No dataset imported</h1><p className="mt-3">Ask the administrator to import the season dataset.</p><Link href="/players" className="mt-4 inline-block text-orange-300">Back to players</Link></section>;
  if (!result.player) notFound();
  const { player, history, metadata, page, hasNext } = result;
  return <>
    <Link href="/players" className="text-orange-300">Back to players</Link>
    <h1 className="mt-5 text-3xl font-bold">{player.full_name}</h1>
    <p className="mt-3 text-slate-300">Position: {player.position ?? 'Unknown'} · {metadata.season}</p>
    <PlayerControls playerId={player.id} />
    <h2 className="mt-8 text-xl font-semibold">Season averages</h2><PlayerStatistics player={player} />
    <h2 className="mt-8 text-xl font-semibold">Game history</h2>
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700">
      <table aria-label="Game history" className="w-full text-left text-sm">
        <caption className="p-3 text-left text-slate-300">Recorded appearances, most recent first</caption>
        <thead className="bg-slate-800"><tr>{['Date', 'Team', 'Opponent', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO'].map(column => <th scope="col" key={column} className="p-3">{column}</th>)}</tr></thead>
        <tbody>{history.map(game => <tr key={game.game_id} className="border-t border-slate-700">
          <th scope="row" className="whitespace-nowrap p-3">{game.game_date}</th>
          <td className="p-3" title={game.team.name}>{game.team.abbreviation}</td><td className="p-3" title={game.opponent.name}>{game.is_home ? 'vs' : '@'} {game.opponent.abbreviation}</td>
          {[game.minutes, game.points, game.rebounds, game.assists, game.steals, game.blocks, game.turnovers].map((value, index) => <td key={index} className="p-3">{value}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {!history.length && <p role="status" className="mt-4">No recorded appearances on this page.</p>}
    <nav aria-label="History pagination" className="mt-6 flex gap-6">
      {page > 1 && <Link className="text-orange-300" href={`/players/${id}?page=${page - 1}`}>Previous page</Link>}
      <span>Page {page}</span>{hasNext && <Link className="text-orange-300" href={`/players/${id}?page=${page + 1}`}>Next page</Link>}
    </nav>
  </>;
}
