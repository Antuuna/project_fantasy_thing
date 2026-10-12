import Link from "next/link";
import { listPlayers } from "@/lib/players/queries";
import { PlayerValidationError } from "@/lib/players/validation";

export default async function Players({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  let result;
  try { result = await listPlayers({ query: params.q, page: params.page }); }
  catch (error) {
    if (!(error instanceof PlayerValidationError)) throw error;
    return <section><h1 className="page-title">Players</h1><p role="alert" className="mt-4 text-danger">{error.message}</p><Link href="/players" className="link mt-4 inline-block">Back to players</Link></section>;
  }
  const { metadata, players, query, page, hasNext } = result;
  const href = (target: number) => `/players?${new URLSearchParams({ q: query, page: String(target) })}`;
  return <>
    <h1 className="page-title">Players</h1>
    <p className="mt-2 muted">{metadata ? `${metadata.season} regular season · Averages per recorded appearance` : 'No dataset imported. Ask the administrator to import the season dataset.'}</p>
    <form action="/players" className="mt-6 flex flex-wrap items-end gap-3">
      <label className="label min-w-0 flex-1">Search players<input name="q" defaultValue={query} maxLength={80} className="field font-normal" /></label>
      <button className="btn-primary btn-lg">Search</button>
    </form>
    {metadata && (players.length ? <div className="table-wrap mt-6">
      <table aria-label="Season players" className="data-table">
        <thead><tr>{['Player', 'Position', 'Games', 'PTS', 'REB', 'AST'].map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{players.map(player => <tr key={player.id}>
          <th scope="row"><Link className="link" href={`/players/${player.id}`}>{player.full_name}</Link></th>
          <td>{player.position ?? 'Unknown'}</td><td>{player.appearances}</td>
          <td>{Number(player.points).toFixed(1)}</td><td>{Number(player.rebounds).toFixed(1)}</td><td>{Number(player.assists).toFixed(1)}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p role="status" className="mt-6">No players match your search.</p>)}
    {players.length > 0 && <p className="mt-3 text-xs muted sm:hidden">Swipe or scroll the table to see all season averages.</p>}
    <nav aria-label="Player pagination" className="pager">
      {page > 1 && <Link className="link" href={href(page - 1)}>Previous page</Link>}
      <span>Page {page}</span>{hasNext && <Link className="link" href={href(page + 1)}>Next page</Link>}
    </nav>
  </>;
}
