export class PlannerValidationError extends Error {}
export function textField(form: FormData, name: string) {
  const fields = form.getAll(name);
  if (fields.length !== 1 || typeof fields[0] !== 'string') throw new PlannerValidationError(`Provide one ${name.replaceAll('_', ' ')}.`);
  return fields[0];
}
export function rosterName(value: string) {
  const name = value.trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 80) throw new PlannerValidationError('Roster name must be 1–80 characters.');
  return name;
}
export function watchNotes(value: string) {
  if (Array.from(value).length > 2000) throw new PlannerValidationError('Notes must be at most 2,000 characters.');
  return value;
}
