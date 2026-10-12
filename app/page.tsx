import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16 sm:px-12">
      <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-orange-400">Fantasy basketball</p>
      <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">Your roster. Your starting five.</h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Explore historical NBA performance, build a personal roster, and plan daily lineups for the 2025–26 regular season.</p>
      <div className="mt-10 flex flex-wrap gap-4"><Link href="/sign-up" className="rounded-lg bg-orange-400 px-6 py-3 font-semibold text-slate-950">Create account</Link><Link href="/sign-in" className="rounded-lg border border-slate-600 px-6 py-3">Sign in</Link></div>
    </main>
  );
}
