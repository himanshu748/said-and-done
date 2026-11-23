import { describe, expect, it } from 'vitest';
import { parseYmd } from '../src/core/dates';
import { detectPromises } from '../src/core/detect';
import { textToBlocks } from '../src/core/adf';
import { fromCandidate, nudgeDue, refresh, sortForLedger, stats, timing, withEvent, type FollowUp, type Source } from '../src/core/ledger';

const source: Source = { product: 'jira', kind: 'comment', containerId: '10001', containerKey: 'LEO-4', title: 'Vendor MSA', itemId: '20001', url: 'https://x/browse/LEO-4' };
const person = { accountId: 'acc', name: 'Sam' };
const created = Date.UTC(2026, 10, 24, 9);

function make(text: string, now = created): FollowUp {
  const [c] = detectPromises(textToBlocks(text), parseYmd('2026-11-24'));
  if (!c) throw new Error('no promise');
  return fromCandidate(c, { source, author: person, owner: person, timeZone: 'UTC', now });
}

describe('ledger', () => {
  it('builds a record due at the end of the day', () => {
    const f = make("I'll send the redlines by Friday");
    expect(f.id).toMatch(/^j:10001:20001:/);
    expect(new Date(f.due?.at ?? 0).toISOString()).toBe('2026-11-27T23:59:59.999Z');
    expect(timing(f, created)).toBe('later');
    expect(timing(f, Date.UTC(2026, 10, 27, 12))).toBe('today');
    expect(timing(f, Date.UTC(2026, 10, 28))).toBe('overdue');
  });

  it('nudges once the day before and once after', () => {
    const f = make("I'll send the redlines by Friday");
    expect(nudgeDue(f, Date.UTC(2026, 10, 25))).toBeNull();
    expect(nudgeDue(f, Date.UTC(2026, 10, 27, 8))).toBe('before');
    const nudged = { ...f, nudges: ['before' as const] };
    expect(nudgeDue(nudged, Date.UTC(2026, 10, 27, 9))).toBeNull();
    expect(nudgeDue(nudged, Date.UTC(2026, 10, 28, 9))).toBe('overdue');
    expect(nudgeDue({ ...nudged, status: 'kept' }, Date.UTC(2026, 10, 28, 9))).toBeNull();
    expect(nudgeDue(nudged, Date.UTC(2026, 11, 10))).toBeNull();
  });

  it('does not nudge a promise written less than an hour ago', () => {
    const f = make("I'll send the redlines today", Date.UTC(2026, 10, 24, 20));
    expect(nudgeDue(f, Date.UTC(2026, 10, 24, 20, 30))).toBeNull();
  });

  it('keeps status when text is re-detected and resets nudges when the date moves', () => {
    const f = { ...make("I'll send the redlines by Friday"), status: 'slipping' as const, nudges: ['before' as const] };
    expect(refresh(f, make("I'll send the redlines by Friday"), created + 1)).toBe(f);
    expect(refresh(f, make("I'll send the redlines by Friday", created + 3 * 86_400_000), created + 1)).toBe(f);
    const handSet = { ...f, due: f.due && { ...f.due, day: '2026-12-01' } };
    expect(refresh(handSet, make("I'll send the redlines by Friday"), created + 1)).toBe(handSet);
    const moved = refresh(f, make("I'll send the redlines by Dec 4"), created + 1);
    expect(moved).toMatchObject({ status: 'slipping', nudges: [], due: { day: '2026-12-04' } });
    expect(moved.history.at(-1)?.what).toBe('Due date changed to 2026-12-04');
  });

  it('counts and sorts', () => {
    const a = make("I'll send the redlines by Friday");
    const b = withEvent(make("I'll book the room by Dec 1"), { status: 'kept' }, 'Kept', Date.UTC(2026, 10, 30));
    const c = make("I'll share the slides when ready");
    const s = stats([a, b, c], created);
    expect(s).toEqual({ open: 2, overdue: 0, dueThisWeek: 1, kept: 1, dropped: 0, keptOnTime: 100 });
    expect(sortForLedger([b, c, a]).map((f) => f.action)).toEqual(['send the redlines', 'share the slides when ready', 'book the room']);
  });
});
