import Link from "next/link";
export default function PlayerNotFound() {
  return <section><h1 className="text-3xl font-bold">Player not found</h1><p className="mt-3">Choose a player who appeared in the imported season.</p><Link href="/players" className="mt-4 inline-block text-orange-300">Back to players</Link></section>;
}
