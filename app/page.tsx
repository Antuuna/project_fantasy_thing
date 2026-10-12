import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen border-b-4 border-brand bg-masthead text-white">
      <section>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-16 sm:px-6">
          <p className="eyebrow mb-4 text-[#ff5c5c]">Fantasy basketball</p>
          <h1 className="max-w-3xl font-display text-5xl font-bold uppercase italic leading-[0.95] tracking-tight sm:text-7xl">Your roster. Your starting five.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-neutral-300">Explore historical NBA performance, build a personal roster, and plan daily lineups for the 2025–26 regular season.</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/sign-up" className="btn-primary btn-lg">Create account</Link>
            <Link href="/sign-in" className="btn btn-lg border border-neutral-500 text-white hover:bg-neutral-800">Sign in</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
