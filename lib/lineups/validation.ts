import { PlannerValidationError } from '../planner/validation.ts';
export function seasonDate(value: string, min: string, max: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new PlannerValidationError('Choose a valid historical date (YYYY-MM-DD).');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw new PlannerValidationError('Choose a valid historical date (YYYY-MM-DD).');
  if (value < min || value > max) throw new PlannerValidationError('Date must be within the imported season.');
  return value;
}
