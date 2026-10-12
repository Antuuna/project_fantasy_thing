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
      <h1 className="page-title">Watchlist</h1>
      <p role="alert" className="mt-4 text-danger">{error.message}</p>
      <Link href="/watchlist" className="link mt-4 inline-block">Back to watchlist</Link>
    </section>;
  }
  const { entries, page, hasNext } = result;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="page-title">Watchlist</h1>
      <Link href="/players" className="link">Search players</Link>
    </div>
    <p className="mt-2 muted">Keep track of players and save your personal notes.</p>
    {entries.length ? <div className="mt-6 grid gap-5 lg:grid-cols-2">
      {entries.map(entry => <WatchlistCard key={entry.id} entry={entry} />)}
    </div> : <p role="status" className="mt-6">Your watchlist is empty.</p>}
    <nav aria-label="Watchlist pagination" className="pager">
      {page > 1 && <Link href={`/watchlist?page=${page - 1}`} className="link">Previous page</Link>}
      <span>Page {page}</span>
      {hasNext && <Link href={`/watchlist?page=${page + 1}`} className="link">Next page</Link>}
    </nav>
  </>;
}
