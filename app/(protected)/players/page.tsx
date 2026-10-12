import Link from "next/link";
import { listPlayers } from "@/lib/players/queries";
import { PlayerValidationError } from "@/lib/players/validation";

export default async function Players({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  let result;
  try { result = await listPlayers({ query: params.q, page: params.page }); }
  catch (error) {
    if (!(error instanceof PlayerValidationError)) throw error;
    return <section><h1 className="text-3xl font-bold">Players</h1><p role="alert" className="mt-4 text-red-300">{error.message}</p><Link href="/players" className="mt-4 inline-block text-orange-300">Back to players</Link></section>;
  }
  const { metadata, players, query, page, hasNext } = result;
  const href = (target: number) => `/players?${new URLSearchParams({ q: query, page: String(target) })}`;
  return <>
    <h1 className="text-3xl font-bold">Players</h1>
    <p className="mt-3 text-slate-300">{metadata ? `${metadata.season} regular season · Averages per recorded appearance` : 'No dataset imported. Ask the administrator to import the season dataset.'}</p>
    <form action="/players" className="mt-6 flex flex-wrap items-end gap-3">
      <label className="flex-1">Search players<input name="q" defaultValue={query} maxLength={80} className="mt-2 block w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-3" /></label>
      <button className="rounded-lg bg-orange-400 px-5 py-3 font-semibold text-slate-950">Search</button>
    </form>
    {metadata && (players.length ? <div className="mt-6 overflow-x-auto rounded-xl border border-slate-700">
      <table aria-label="Season players" className="w-full text-left text-sm">
        <thead className="bg-slate-800"><tr>{['Player', 'Position', 'Games', 'PTS', 'REB', 'AST'].map(column => <th key={column} scope="col" className="p-3">{column}</th>)}</tr></thead>
        <tbody>{players.map(player => <tr key={player.id} className="border-t border-slate-700">
          <th scope="row" className="p-3"><Link className="text-orange-300 underline underline-offset-4" href={`/players/${player.id}`}>{player.full_name}</Link></th>
          <td className="p-3">{player.position ?? 'Unknown'}</td><td className="p-3">{player.appearances}</td>
          <td className="p-3">{Number(player.points).toFixed(1)}</td><td className="p-3">{Number(player.rebounds).toFixed(1)}</td><td className="p-3">{Number(player.assists).toFixed(1)}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p role="status" className="mt-6">No players match your search.</p>)}
    {players.length > 0 && <p className="mt-3 text-sm text-slate-300 sm:hidden">Swipe or scroll the table to see all season averages.</p>}
    <nav aria-label="Player pagination" className="mt-6 flex items-center gap-6">
      {page > 1 && <Link className="text-orange-300" href={href(page - 1)}>Previous page</Link>}
      <span>Page {page}</span>{hasNext && <Link className="text-orange-300" href={href(page + 1)}>Next page</Link>}
    </nav>
  </>;
}
