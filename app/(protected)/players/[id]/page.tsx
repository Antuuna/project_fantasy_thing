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
    return <section><h1 className="page-title">Game history</h1><p role="alert" className="mt-4 text-danger">{error.message}</p><Link href={`/players/${id}`} className="link mt-4 inline-block">Back to player</Link></section>;
  }
  if (!result.metadata) return <section><h1 className="page-title">No dataset imported</h1><p className="mt-3">Ask the administrator to import the season dataset.</p><Link href="/players" className="link mt-4 inline-block">Back to players</Link></section>;
  if (!result.player) notFound();
  const { player, history, metadata, page, hasNext } = result;
  return <>
    <Link href="/players" className="link text-sm">Back to players</Link>
    <div className="mt-3 flex flex-wrap items-center gap-5 rounded-md border-t-4 border-brand bg-masthead p-5 text-white sm:p-6">
      <div aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-neutral-700 font-display text-2xl font-bold sm:size-20 sm:text-3xl">
        {player.full_name.split(' ').map(part => part[0]).slice(0, 2).join('')}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="break-words font-display text-3xl font-bold tracking-tight sm:text-4xl">{player.full_name}</h1>
        <p className="mt-1 text-sm text-neutral-300">Position: {player.position ?? 'Unknown'} · {metadata.season}</p>
      </div>
    </div>
    <div className="mt-4"><PlayerControls playerId={player.id} /></div>
    <h2 className="section-title mt-8 mb-3">Season averages</h2><PlayerStatistics player={player} />
    <h2 className="section-title mt-8 mb-3">Game history</h2>
    <div className="table-wrap mt-3">
      <table aria-label="Game history" className="data-table">
        <caption>Recorded appearances, most recent first</caption>
        <thead><tr>{['Date', 'Team', 'Opponent', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO'].map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody>{history.map(game => <tr key={game.game_id}>
          <th scope="row" className="whitespace-nowrap font-medium">{game.game_date}</th>
          <td title={game.team.name}>{game.team.abbreviation}</td><td title={game.opponent.name}>{game.is_home ? 'vs' : '@'} {game.opponent.abbreviation}</td>
          {[game.minutes, game.points, game.rebounds, game.assists, game.steals, game.blocks, game.turnovers].map((value, index) => <td key={index}>{value}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {!history.length && <p role="status" className="mt-4">No recorded appearances on this page.</p>}
    {history.length > 0 && <p className="mt-3 text-xs muted sm:hidden">Swipe or scroll the table to see all game statistics.</p>}
    <nav aria-label="History pagination" className="pager">
      {page > 1 && <Link className="link" href={`/players/${id}?page=${page - 1}`}>Previous page</Link>}
      <span>Page {page}</span>{hasNext && <Link className="link" href={`/players/${id}?page=${page + 1}`}>Next page</Link>}
    </nav>
  </>;
}
