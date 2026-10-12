import { test } from "node:test";
import assert from "node:assert/strict";
import { benchPlayers, initialSelection, selectionError, selectionIsDirty } from "../../lib/lineups/selection.ts";

const members = [1, 2, 3, 4, 5, 6].map(id => ({ id, full_name: `Player ${id}` }));

test("unsaved lineup starts with blank ordered slots and the complete current roster on bench", () => {
  const selection = initialSelection(members, []);
  assert.deepEqual(selection, ["", "", "", "", ""]);
  assert.deepEqual(benchPlayers(members, selection), members);
  assert.ok(selectionError(selection, members));
  assert.equal(selectionIsDirty(selection, selection), false);
});

test("saved starters restore exact slots independently of row order and removed players leave gaps", () => {
  const selection = initialSelection(members, [
    { player_id: 5, slot: "starter_5" }, { player_id: 2, slot: "starter_1" },
    { player_id: 99, slot: "starter_2" }, { player_id: 4, slot: "starter_4" },
    { player_id: 3, slot: "starter_3" }, { player_id: 6, slot: "bench" },
  ]);
  assert.deepEqual(selection, ["2", "", "3", "4", "5"]);
  assert.deepEqual(benchPlayers(members, selection).map(player => player.id), [1, 6]);
  assert.ok(selectionError(selection, members));
});

test("valid selection captures all newly added current members on bench", () => {
  const expanded = [...members, { id: 7, full_name: "New Player" }];
  const selection = ["5", "4", "3", "2", "1"];
  assert.equal(selectionError(selection, expanded), null);
  assert.deepEqual(benchPlayers(expanded, selection).map(player => player.id), [6, 7]);
});

test("duplicates, missing starters, removed members, and fewer than five roster members cannot save", () => {
  for (const selection of [
    ["1", "1", "3", "4", "5"], ["1", "2", "3", "4", ""],
    ["1", "2", "3", "4", "99"], ["1", "2", "3", "4"],
    ["1", "2", "3", "4", "5", "6"],
  ]) assert.ok(selectionError(selection, members));
  assert.ok(selectionError(["1", "2", "3", "4", "5"], members.slice(0, 4)));
});

test("dirty selection tracks ordered slots and clears when the user restores the exact saved order", () => {
  const baseline = ["1", "2", "3", "4", "5"];
  assert.equal(selectionIsDirty(["2", "1", "3", "4", "5"], baseline), true);
  assert.equal(selectionIsDirty(["1", "2", "3", "4", ""], baseline), true);
  assert.equal(selectionIsDirty(["1", "2", "3", "4"], baseline), true);
  assert.equal(selectionIsDirty([...baseline], baseline), false);
});
