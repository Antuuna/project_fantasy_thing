'use client';
import { useActionState } from 'react';
import { mutatePlanner } from '@/app/planner/actions';
import type { MutationState, PlannerOperation } from '@/lib/planner/types';

export function MutationForm({operation, playerId, label, children}: {operation: PlannerOperation;playerId?: number;label: string;children?: React.ReactNode}) {
  const [state, action, pending] = useActionState<MutationState, FormData>(mutatePlanner, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="operation" value={operation} />
    {playerId !== undefined && <input type="hidden" name="player_id" value={playerId} />}
    <fieldset disabled={pending} className="space-y-3">{children}<button disabled={pending} className="rounded-lg border border-slate-500 px-4 py-2 hover:bg-slate-800 disabled:opacity-60">{pending ? 'Saving…' : label}</button></fieldset>
    {state.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
    {state.message && <p role="status" className="text-sm text-green-300">{state.message}</p>}
  </form>;
}
