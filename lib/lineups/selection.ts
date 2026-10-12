export type StarterSelection = [string, string, string, string, string];
type MemberIdentity = { id: number };
type SavedChoice = { player_id: number; slot: string };

export function initialSelection(members: readonly MemberIdentity[], saved: readonly SavedChoice[]): StarterSelection {
  const current = new Set(members.map(member => String(member.id)));
  return [1, 2, 3, 4, 5].map(slot => {
    const entry = saved.find(row => row.slot === `starter_${slot}`);
    return entry && current.has(String(entry.player_id)) ? String(entry.player_id) : "";
  }) as StarterSelection;
}

export function selectionError(selection: readonly string[], members: readonly MemberIdentity[]): string | null {
  if (members.length < 5) return "Add at least five players to your roster before saving a lineup.";
  if (selection.length !== 5 || selection.some(id => id === "")) return "Choose a player for each of the five starting slots.";
  if (new Set(selection).size !== 5) return "Choose five different players for your starters.";
  const current = new Set(members.map(member => String(member.id)));
  if (selection.some(id => !current.has(id))) return "Every starter must belong to your current roster.";
  return null;
}

export function selectionIsDirty(selection: readonly string[], baseline: readonly string[]): boolean {
  return selection.length !== baseline.length || selection.some((id, slot) => id !== baseline[slot]);
}

export function benchPlayers<T extends MemberIdentity>(members: readonly T[], selection: readonly string[]): T[] {
  const starters = new Set(selection.filter(Boolean));
  return members.filter(member => !starters.has(String(member.id)));
}
