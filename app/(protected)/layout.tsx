import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { signOut } from "@/app/auth/actions";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-screen">
    <header className="border-b border-slate-700">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
        <Link href="/dashboard" className="font-bold text-orange-400">Roster planner</Link>
        <form action={signOut}><button className="rounded-lg border border-slate-600 px-4 py-2 hover:bg-slate-800">Sign out</button></form>
      </nav>
    </header>
    <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
  </div>;
}
