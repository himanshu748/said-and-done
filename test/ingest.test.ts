import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowUp, Source } from '../src/core/ledger';

const db = new Map<string, FollowUp>();
vi.mock('../src/store', () => ({
  getFollowUp: async (id: string) => db.get(id),
  saveFollowUp: async (f: FollowUp) => void db.set(f.id, f),
  listForContainer: async (c: string) => [...db.values()].filter((f) => f.source.containerId === c),
}));
vi.mock('../src/site', () => ({
  getUser: async (_p: string, accountId: string) => ({ accountId, name: 'Sam', timeZone: 'UTC', isApp: false }),
}));

const { ingest } = await import('../src/ingest');

const doc = (text: string) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const source = (itemId: string): Source => ({ product: 'jira', kind: 'comment', containerId: '10001', containerKey: 'LEO-4', title: 'Vendor MSA', itemId, url: 'https://x/browse/LEO-4' });
const at = Date.UTC(2026, 10, 24, 9);

describe('ingest', () => {
  beforeEach(() => db.clear());

  it('never brings back text marked not a promise', async () => {
    const args = { source: source('1'), doc: doc("I'll send the redlines by Friday"), authorId: 'acc', writtenAt: new Date(at), now: at };
    expect((await ingest(args)).found).toBe(1);
    const [f] = [...db.values()];
    if (!f) throw new Error('not saved');
    db.set(f.id, { ...f, dismissed: true });

    expect((await ingest({ ...args, doc: doc("I'll send the redlines by Monday"), now: at + 1000 })).found).toBe(0);
    expect(db.get(f.id)).toEqual({ ...f, dismissed: true });

    const reply = await ingest({ source: source('2'), doc: doc('Sent the redlines.'), authorId: 'acc', writtenAt: new Date(at + 5000), now: at + 5000 });
    expect(reply.settled).toBe(0);
    expect(db.get(f.id)?.status).toBe('open');
  });
});
