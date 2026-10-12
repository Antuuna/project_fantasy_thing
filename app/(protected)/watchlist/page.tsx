import Link from "next/link";
import { WatchlistCard } from "@/components/watchlist-card";
import { getWatchlist } from "@/lib/planner/queries";
import { PlayerValidationError } from "@/lib/players/validation";

export default async function Watchlist({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let result;
  try {
    result = await getWatchlist(params.page);
  } catch (error) {
    if (!(error instanceof PlayerValidationError)) throw error;
    return <section>
      <h1 className="text-3xl font-bold">Watchlist</h1>
      <p role="alert" className="mt-4 text-red-300">{error.message}</p>
      <Link href="/watchlist" className="mt-4 inline-block text-orange-300">Back to watchlist</Link>
    </section>;
  }
  const { entries, page, hasNext } = result;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-3xl font-bold">Watchlist</h1>
      <Link href="/players" className="text-orange-300 underline underline-offset-4">Search players</Link>
    </div>
    <p className="mt-3 text-slate-300">Keep track of players and save your personal notes.</p>
    {entries.length ? <div className="mt-6 grid gap-5 lg:grid-cols-2">
      {entries.map(entry => <WatchlistCard key={entry.id} entry={entry} />)}
    </div> : <p role="status" className="mt-6">Your watchlist is empty.</p>}
    <nav aria-label="Watchlist pagination" className="mt-6 flex items-center gap-6">
      {page > 1 && <Link href={`/watchlist?page=${page - 1}`} className="text-orange-300">Previous page</Link>}
      <span>Page {page}</span>
      {hasNext && <Link href={`/watchlist?page=${page + 1}`} className="text-orange-300">Next page</Link>}
    </nav>
  </>;
}
