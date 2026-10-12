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
    return <section><h1 className="page-title">Historical lineup</h1><p role="alert" className="mt-4 text-danger">{error.message}</p><Link href="/dashboard" className="link mt-4 inline-block">Back to dashboard</Link></section>;
  }
  const {roster,members,metadata,date,saved,appearances} = result;
  return <>
    {params.password === "updated" && <p role="status" className="mb-6 text-success">Your password has been updated.</p>}
    {params.signout === "failed" && <p role="alert" className="mb-6 text-danger">Unable to sign out. Please try again.</p>}
    <div className="mb-6 border-b border-line pb-5">
      <p className="eyebrow">Dashboard</p>
      <h1 className="page-title mt-1 break-words">{roster.name}</h1>
    </div>
    <div><RosterControls name={roster.name} members={members} /></div>
    {metadata && date ? <>
      <section className="card mt-6">
        <div className="card-head">
          <h2 className="card-title">Historical lineup</h2>
          <p className="text-xs muted">Season {metadata.season} · Last successful import: <time dateTime={metadata.completed_at}>{new Date(metadata.completed_at).toLocaleString('en-US',{timeZone:'UTC'})} UTC</time></p>
        </div>
        <form action="/dashboard" className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="lineup-date" className="label">Lineup date</label>
          <input key={date} id="lineup-date" type="date" name="date" defaultValue={date} min={metadata.date_min} max={metadata.date_max} required className="field w-auto" /></div>
          <button className="btn-secondary py-2.5">Change date</button>
        </form>
        <p className="mt-3 text-xs muted">Changing date or leaving this page discards unsaved changes. Saved lineups stay unchanged.</p>
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LineupSnapshot saved={saved} members={members}/>
        <LineupEditor key={`${date}:${members.map(p=>p.id).join(',')}`} date={date} members={members} saved={saved}/>
      </div>
      <div className="mt-6"><RosterGames date={date} members={members} appearances={appearances}/></div>
    </> : <p role="status" className="mt-8">No dataset imported. Ask the administrator to import the season dataset before saving a lineup.</p>}
  </>;
}
