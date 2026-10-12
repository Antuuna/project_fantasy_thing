import Link from "next/link";
export default function PlayerNotFound() {
  return <section><h1 className="page-title">Player not found</h1><p className="mt-3">Choose a player who appeared in the imported season.</p><Link href="/players" className="link mt-4 inline-block">Back to players</Link></section>;
}
