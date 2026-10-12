import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeSearch, parsePage, parsePlayerId, parseSearch } from "../../lib/players/validation.ts";

test("URL validation rejects ambiguous and unbounded directory requests", () => {
  for (const value of ['0', '-1', '1.5', '10001', '', ['1', '2']]) assert.throws(() => parsePage(value));
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage('10000'), 10000);
  assert.throws(() => parseSearch(['a', 'b']));
  assert.throws(() => parseSearch('a'.repeat(81)));
  assert.equal(parseSearch('  Name  '), 'Name');
});

test("player IDs and search metacharacters preserve data boundaries", () => {
  for (const id of ['0', '001', '-1', '1.2', '9007199254740992', '1 OR true']) assert.throws(() => parsePlayerId(id));
  assert.equal(parsePlayerId('2544'), 2544);
  assert.equal(escapeSearch('50%_\\'), '50\\%\\_\\\\');
});
