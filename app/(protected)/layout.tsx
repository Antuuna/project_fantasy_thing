import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { signOut } from "@/app/auth/actions";
import { NavLink } from "@/components/nav-link";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-screen">
    <header className="border-b-4 border-brand bg-masthead">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 sm:px-6">
        <Link href="/dashboard" className="py-3 font-display text-xl font-bold italic tracking-tight text-white">
          <span className="text-brand">Roster</span> planner
        </Link>
        <div className="order-last flex w-full gap-6 sm:order-none sm:w-auto">
          <NavLink href="/dashboard">My team</NavLink>
          <NavLink href="/players">Players</NavLink>
          <NavLink href="/watchlist">Watchlist</NavLink>
        </div>
        <form action={signOut} className="ml-auto py-2">
          <button className="rounded-md border border-neutral-600 px-3 py-1.5 text-sm font-bold text-neutral-200 hover:bg-neutral-800">Sign out</button>
        </form>
      </nav>
    </header>
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
  </div>;
}
