'use client';
import { useActionState } from 'react';
import { mutatePlanner } from '@/app/planner/actions';
import type { MutationState, PlannerOperation } from '@/lib/planner/types';

const primaryOperations: PlannerOperation[] = ['add-roster', 'add-watch'];

export function MutationForm({operation, playerId, label, children}: {operation: PlannerOperation;playerId?: number;label: string;children?: React.ReactNode}) {
  const [state, action, pending] = useActionState<MutationState, FormData>(mutatePlanner, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="operation" value={operation} />
    {playerId !== undefined && <input type="hidden" name="player_id" value={playerId} />}
    <fieldset disabled={pending} className="space-y-3">{children}<button disabled={pending} className={primaryOperations.includes(operation) ? 'btn-primary' : 'btn-secondary'}>{pending ? 'Saving…' : label}</button></fieldset>
    {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
    {state.message && <p role="status" className="text-sm text-success">{state.message}</p>}
  </form>;
}
