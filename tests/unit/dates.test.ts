import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seasonDate} from '../../lib/lineups/validation.ts';
test('date-only bounds and calendar validation do not shift across timezones',()=>{
  for (const timezone of ['America/Los_Angeles','Asia/Tokyo']) {
    const original = process.env.TZ;
    process.env.TZ = timezone;
    try {
      assert.equal(seasonDate('2025-10-21','2025-10-21','2026-04-12'),'2025-10-21');
      assert.equal(seasonDate('2026-04-12','2025-10-21','2026-04-12'),'2026-04-12');
      for (const date of ['2025-10-20','2026-04-13','2026-02-30','2025-1-01','invalid']) assert.throws(()=>seasonDate(date,'2025-10-21','2026-04-12'));
    } finally {if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
  }
});
