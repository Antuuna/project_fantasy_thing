import { requireUser } from "@/lib/auth/session";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireUser();
  const params = await searchParams;
  const { error: initializationError } = await supabase.rpc("ensure_roster");
  if (initializationError) throw new Error("Unable to initialize your roster. Please try again.");
  const { data: roster, error } = await supabase.from("rosters").select("id, name").single();
  if (error || !roster) throw new Error("Unable to load your roster. Please try again.");
  return <>
    {params.password === "updated" && <p role="status" className="mb-6 text-green-300">Your password has been updated.</p>}
    {params.signout === "failed" && <p role="alert" className="mb-6 text-red-300">Unable to sign out. Please try again.</p>}
    <p className="text-sm uppercase tracking-widest text-orange-400">Dashboard</p>
    <h1 className="mt-3 text-4xl font-bold">{roster.name}</h1>
    <p className="mt-5 max-w-xl text-slate-300">Your roster is ready. Player browsing, watchlists, and historical lineups are coming next.</p>
  </>;
}
