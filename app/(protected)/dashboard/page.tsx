import Link from 'next/link';
import { getDashboard } from '@/lib/lineups/queries';
import { PlannerValidationError } from '@/lib/planner/validation';
import { RosterControls } from '@/components/roster-controls';
import { LineupEditor } from '@/components/lineup-editor';
import { LineupSnapshot } from '@/components/lineup-snapshot';
import { RosterGames } from '@/components/roster-games';

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  let result;
  try { result = await getDashboard(params.date); }
  catch(error) {
    if (!(error instanceof PlannerValidationError)) throw error;
    return <section><h1 className="text-3xl font-bold">Historical lineup</h1><p role="alert" className="mt-4 text-red-300">{error.message}</p><Link href="/dashboard" className="mt-4 inline-block text-orange-300">Back to dashboard</Link></section>;
  }
  const {roster,members,metadata,date,saved,appearances} = result;
  return <>
    {params.password === "updated" && <p role="status" className="mb-6 text-green-300">Your password has been updated.</p>}
    {params.signout === "failed" && <p role="alert" className="mb-6 text-red-300">Unable to sign out. Please try again.</p>}
    <p className="text-sm uppercase tracking-widest text-orange-400">Dashboard</p>
    <h1 className="mt-3 break-words text-4xl font-bold">{roster.name}</h1>
    <div className="mt-6"><RosterControls name={roster.name} members={members} /></div>
    {metadata && date ? <>
      <section className="mt-8 rounded-xl border border-slate-700 p-5">
        <h2 className="text-xl font-semibold">Historical lineup</h2>
        <p className="mt-3 text-slate-300">Season {metadata.season} · Last successful import: <time dateTime={metadata.completed_at}>{new Date(metadata.completed_at).toLocaleString('en-US',{timeZone:'UTC'})} UTC</time></p>
        <form action="/dashboard" className="mt-5 flex flex-wrap items-end gap-3">
          <label htmlFor="lineup-date">Lineup date</label>
          <input key={date} id="lineup-date" type="date" name="date" defaultValue={date} min={metadata.date_min} max={metadata.date_max} required className="block rounded-lg border border-slate-600 bg-slate-900 px-4 py-3" />
          <button className="rounded-lg border border-slate-500 px-4 py-3">Change date</button>
        </form>
        <p className="mt-3 text-sm text-slate-300">Changing date or leaving this page discards unsaved changes. Saved lineups stay unchanged.</p>
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LineupSnapshot saved={saved} members={members}/>
        <LineupEditor key={`${date}:${members.map(p=>p.id).join(',')}`} date={date} members={members} saved={saved}/>
      </div>
      <div className="mt-6"><RosterGames date={date} members={members} appearances={appearances}/></div>
    </> : <p role="status" className="mt-8">No dataset imported. Ask the administrator to import the season dataset before saving a lineup.</p>}
  </>;
}
