import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rosterName, watchNotes, textField } from '../../lib/planner/validation.ts';

test('roster and note limits match PostgreSQL Unicode character counts', () => {
  assert.equal(rosterName('  Roster  '), 'Roster');
  assert.equal(rosterName('🏀'.repeat(80)), '🏀'.repeat(80));
  for (const name of ['', '  ', 'x'.repeat(81), '🏀'.repeat(81)]) assert.throws(() => rosterName(name));
  assert.equal(watchNotes('🏀'.repeat(2000)), '🏀'.repeat(2000));
  assert.throws(() => watchNotes('🏀'.repeat(2001)));
});
test('server fields reject repeated, missing, and non-text submissions', () => {
  const form = new FormData();
  assert.throws(() => textField(form, 'player_id'));
  form.set('player_id', '2544');
  assert.equal(textField(form, 'player_id'), '2544');
  form.append('player_id', '203999');
  assert.throws(() => textField(form, 'player_id'));
});
