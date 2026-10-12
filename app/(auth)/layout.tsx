import Link from "next/link";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">
    <header className="border-b-4 border-brand bg-masthead">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
        <Link href="/" className="font-display text-xl font-bold italic tracking-tight text-white"><span className="text-brand">Roster</span> planner</Link>
      </div>
    </header>
    <main className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-12">
      {!hasSupabaseConfig() && <p role="status" className="text-center text-sm text-warning">Authentication is not configured yet.</p>}
      {children}
    </main>
  </div>;
}
