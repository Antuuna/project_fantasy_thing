import Link from "next/link";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 py-12">
    <Link href="/" className="text-sm font-semibold uppercase tracking-widest text-orange-400">Roster planner</Link>
    {!hasSupabaseConfig() && <p role="status" className="text-center text-sm text-amber-300">Authentication is not configured yet.</p>}
    {children}
  </main>;
}
