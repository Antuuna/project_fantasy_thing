import { getRoster } from "@/lib/planner/queries";
import { RosterControls } from "@/components/roster-controls";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { roster, members } = await getRoster();
  const params = await searchParams;
  return <>
    {params.password === "updated" && <p role="status" className="mb-6 text-green-300">Your password has been updated.</p>}
    {params.signout === "failed" && <p role="alert" className="mb-6 text-red-300">Unable to sign out. Please try again.</p>}
    <p className="text-sm uppercase tracking-widest text-orange-400">Dashboard</p>
    <h1 className="mt-3 text-4xl font-bold">{roster.name}</h1>
    <RosterControls name={roster.name} members={members} />
  </>;
}
