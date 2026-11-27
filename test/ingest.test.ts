import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stats } from '../src/core/ledger';
import type { FollowUp, Source } from '../src/core/ledger';

const db = new Map<string, FollowUp>();
vi.mock('../src/store', () => ({
  getFollowUp: async (id: string) => db.get(id),
  saveFollowUp: async (f: FollowUp) => void db.set(f.id, f),
  listForContainer: async (product: Source['product'], c: string) => [...db.values()].filter((f) => f.source.product === product && f.source.containerId === c),
}));
vi.mock('../src/site', () => ({
  getUser: vi.fn(async (_p: string, accountId: string) => ({ accountId, name: 'Sam', timeZone: 'UTC', isApp: false })),
}));

const { ingest } = await import('../src/ingest');
const { getUser } = await import('../src/site');
const { ingestJiraComment } = await import('../src/sources');

const doc = (text: string) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const source = (itemId: string): Source => ({ product: 'jira', kind: 'comment', containerId: '10001', containerKey: 'LEO-4', title: 'Vendor MSA', itemId, url: 'https://x/browse/LEO-4' });
const at = Date.UTC(2026, 10, 24, 9);

describe('ingest', () => {
  beforeEach(() => db.clear());

  it('looks up the author again after a temporary profile failure', async () => {
    const authorId = 'profile-retry';
    vi.mocked(getUser)
      .mockResolvedValueOnce({ accountId: authorId, name: 'Someone', timeZone: 'UTC', isApp: false, lookupIncomplete: true })
      .mockResolvedValueOnce({ accountId: authorId, name: 'Priya', timeZone: 'Asia/Kolkata', isApp: false });
    const args = { doc: doc("I'll send the redlines by Friday"), authorId, writtenAt: new Date(at), now: at };

    await ingest({ ...args, source: source('retry-first') });
    await ingest({ ...args, source: source('retry-second') });
    await ingest({ ...args, source: source('retry-third') });

    expect([...db.values()].map((record) => record.owner.name)).toEqual(['Someone', 'Priya', 'Priya']);
  });

  it('uses the mentioned name when its profile lookup fails and repairs a stored fallback', async () => {
    const ownerId = 'owner-mention';
    const fallback = { accountId: ownerId, name: 'Someone', timeZone: 'UTC', isApp: false, lookupIncomplete: true } as const;
    vi.mocked(getUser)
      .mockResolvedValueOnce({ accountId: 'mention-author', name: 'Sam', timeZone: 'UTC', isApp: false })
      .mockResolvedValueOnce(fallback)
      .mockResolvedValueOnce(fallback);
    const mention = {
      type: 'doc', version: 1, content: [{ type: 'paragraph', content: [
        { type: 'mention', attrs: { id: ownerId, text: '@Priya Shah' } },
        { type: 'text', text: ' will send the redlines by Friday' },
      ] }],
    };
    const args = { source: source('mention'), doc: mention, authorId: 'mention-author', writtenAt: new Date(at), now: at };

    await ingest(args);
    const [record] = [...db.values()];
    if (!record) throw new Error('not saved');
    expect(record.owner).toEqual({ accountId: ownerId, name: 'Priya Shah' });

    db.set(record.id, { ...record, owner: { accountId: ownerId, name: 'Someone' }, status: 'kept' });
    expect((await ingest({ ...args, now: at + 1000 })).found).toBe(0);
    expect([...db.values()]).toEqual([{ ...record, status: 'kept' }]);
  });

  it('repairs a stored comment link on rescan without changing the record history', async () => {
    const comment: Source = {
      ...source('456'),
      product: 'confluence',
      kind: 'page-comment',
      containerId: '123',
      url: '/wiki/pages/viewpage.action?pageId=123?focusedCommentId=456',
    };
    const args = { source: comment, doc: doc("I'll send the redlines by Friday"), authorId: 'acc', writtenAt: new Date(at), now: at };
    await ingest(args);
    const [record] = [...db.values()];
    if (!record) throw new Error('not saved');
    db.set(record.id, { ...record, status: 'kept' });
    const repaired = { ...comment, url: '/wiki/pages/viewpage.action?pageId=123&focusedCommentId=456' };

    expect((await ingest({ ...args, source: repaired, now: at + 1000, backfill: true })).found).toBe(0);
    expect([...db.values()]).toEqual([{ ...record, source: repaired, status: 'kept' }]);
  });

  it.each(['page', 'page-comment'] as const)('repairs a missing space key on a stored %s commitment', async (kind) => {
    const confluence: Source = { ...source('123'), product: 'confluence', kind, containerKey: '' };
    const args = { source: confluence, doc: doc("I'll send the redlines by Friday"), authorId: 'acc', writtenAt: new Date(at), now: at };
    await ingest(args);
    const [record] = [...db.values()];
    if (!record) throw new Error('not saved');
    const kept: FollowUp = { ...record, status: 'kept' };
    db.set(record.id, kept);
    const repaired = { ...confluence, containerKey: 'OPS' };

    expect((await ingest({ ...args, source: repaired, now: at + 1000 })).found).toBe(0);
    expect([...db.values()]).toEqual([{ ...kept, source: repaired }]);
  });

  it('only settles promises from the same product when container IDs match', async () => {
    const page: Source = { ...source('p1'), product: 'confluence', kind: 'page' };
    await ingest({ source: page, doc: doc("I'll send the redlines by Friday"), authorId: 'acc', writtenAt: new Date(at), now: at });
    const later = at + 1000;
    const reply = await ingest({ source: source('reply'), doc: doc('Sent the redlines.'), authorId: 'acc', writtenAt: new Date(later), now: later });
    expect(reply.settled).toBe(0);
    expect([...db.values()]).toMatchObject([{ status: 'open', source: { product: 'confluence' } }]);
  });

  it.each([
    [Date.UTC(2026, 10, 27, 12), 100],
    [Date.UTC(2026, 10, 28, 12), 0],
  ])('uses the original reply time for backfilled on-time totals', async (repliedAt, keptOnTime) => {
    const now = Date.UTC(2026, 10, 30, 12);
    const scanReply = () => ingest({
      source: source('reply'), doc: doc('Sent the redlines.'), authorId: 'acc',
      writtenAt: new Date(repliedAt), now, backfill: true,
    });
    await ingest({
      source: source('promise'), doc: doc("I'll send the redlines by Friday"), authorId: 'acc',
      writtenAt: new Date(at), now, backfill: true,
    });

    expect((await scanReply()).settled).toBe(1);
    expect((await scanReply()).settled).toBe(0);
    expect(stats([...db.values()], now).keptOnTime).toBe(keptOnTime);
    expect([...db.values()]).toMatchObject([{ status: 'kept', updatedAt: now, history: [
      { at: now, what: 'Promise found' }, { at: repliedAt, what: expect.stringContaining('Kept') },
    ] }]);
  });

  it.each([
    { updated: '2026-11-28T12:00:00Z', keptOnTime: 0 },
    { updated: undefined, keptOnTime: 100 },
    { updated: 'invalid', keptOnTime: 100 },
  ])('uses the current Jira reply revision when available ($updated)', async ({ updated, keptOnTime }) => {
    const now = Date.UTC(2026, 10, 30, 12);
    const issue = { id: '10001', key: 'LEO-4', summary: 'Vendor MSA' };
    const author = { accountId: 'acc' };

    // The edited promise keeps the deadline relative to the original comment date.
    await ingestJiraComment(issue, {
      id: 'promise', body: doc("I'll send the redlines tomorrow"), author,
      created: '2026-11-24T09:00:00Z', updated: '2026-11-27T12:00:00Z',
    }, now, true);
    const reply = { id: 'reply', body: doc('Sent the redlines.'), author, created: '2026-11-25T12:00:00Z', ...(updated ? { updated } : {}) };
    expect((await ingestJiraComment(issue, reply, now, true)).settled).toBe(1);
    expect([...db.values()]).toMatchObject([{ due: { day: '2026-11-25' }, status: 'kept', updatedAt: now }]);
    expect(stats([...db.values()], now).keptOnTime).toBe(keptOnTime);
  });

  it('settles from an older Jira comment edited during the scan without importing its promises', async () => {
    const now = Date.UTC(2026, 10, 30, 12);
    const issue = { id: '10001', key: 'LEO-4', summary: 'Vendor MSA' };
    const author = { accountId: 'acc' };
    await ingestJiraComment(issue, {
      id: 'promise', body: doc("I'll send the redlines by Friday"), author, created: '2026-11-24T09:00:00Z',
    }, now, true);

    const unrelated = {
      id: 'unrelated', body: doc('Sent the electricity invoice.'), author,
      created: '2026-10-01T12:00:00Z', updated: '2026-11-26T12:00:00Z',
    };
    expect(await ingestJiraComment(issue, unrelated, now, true, { settlementOnly: true })).toEqual({ found: 0, settled: 0 });
    expect([...db.values()]).toMatchObject([{ status: 'open' }]);

    const reply = {
      id: 'reply', body: doc("Sent the redlines. I'll file the binder by Friday."), author,
      created: '2026-10-01T12:00:00Z', updated: '2026-11-27T12:00:00Z',
    };
    expect(await ingestJiraComment(issue, reply, now, true, { settlementOnly: true })).toEqual({ found: 0, settled: 1 });
    expect([...db.values()]).toMatchObject([{ status: 'kept', updatedAt: now, history: [
      { at: now, what: 'Promise found' },
      { at: Date.parse(reply.updated), what: expect.stringContaining('Kept') },
    ] }]);
  });

  it('never brings back text marked not a promise', async () => {
    const args = { source: source('1'), doc: doc("I'll send the redlines by Friday"), authorId: 'acc', writtenAt: new Date(at), now: at };
    expect((await ingest(args)).found).toBe(1);
    const [f] = [...db.values()];
    if (!f) throw new Error('not saved');
    db.set(f.id, { ...f, dismissed: true });

    expect((await ingest({ ...args, doc: doc("I'll send the redlines by Monday"), now: at + 1000 })).found).toBe(0);
    expect(db.get(f.id)).toEqual({ ...f, dismissed: true });

    await ingest({ source: source('3'), doc: doc("I'll book the review room by Monday"), authorId: 'acc', writtenAt: new Date(at + 2000), now: at + 2000 });
    const reply = await ingest({ source: source('2'), doc: doc('Sent the redlines.'), authorId: 'acc', writtenAt: new Date(at + 5000), now: at + 5000 });
    expect(reply.settled).toBe(0);
    expect([...db.values()].map((x) => x.status)).toEqual(['open', 'open']);
  });

  it('drops promises only when a valid page edit clears them', async () => {
    const page: Source = { ...source('p1'), product: 'confluence', kind: 'page', containerId: 'p1' };
    const args = { source: page, doc: doc("I'll send the redlines by Friday"), authorId: 'acc', writtenAt: new Date(at), now: at };
    expect((await ingest(args)).found).toBe(1);

    const now = at + 1000;
    await ingest({ ...args, doc: undefined, writtenAt: new Date(now), now });
    await ingest({ ...args, doc: doc(''), writtenAt: new Date(at - 1000), now });
    expect([...db.values()]).toMatchObject([{ status: 'open' }]);

    await ingest({ ...args, doc: doc(''), writtenAt: new Date(now), now });
    expect([...db.values()]).toMatchObject([{ status: 'dropped', removed: true }]);
  });

  it('ignores older snapshots after a page promise is removed and restored', async () => {
    const page: Source = { ...source('p1'), product: 'confluence', kind: 'page', containerId: 'p1' };
    const promise = doc("I'll send the redlines by Friday");
    const ingestVersion = (body: unknown, writtenAt: number) =>
      ingest({ source: page, doc: body, authorId: 'acc', writtenAt: new Date(writtenAt), now: at + 5000 });

    await ingestVersion(promise, at);
    await ingestVersion(doc(''), at + 1000);
    await ingestVersion(promise, at);
    expect([...db.values()]).toMatchObject([{ status: 'dropped', writtenAt: at + 1000 }]);

    await ingestVersion(promise, at + 2000);
    await ingestVersion(doc(''), at + 1000);
    expect([...db.values()]).toMatchObject([{ status: 'open', writtenAt: at + 2000 }]);
  });

  it('brings back a dismissed action item rewritten as a new commitment', async () => {
    const task = (text: string) => ({ type: 'doc', version: 1, content: [{ type: 'taskList', attrs: { localId: 'l1' }, content: [{ type: 'taskItem', attrs: { localId: 't1', state: 'TODO' }, content: [{ type: 'text', text }] }] }] });
    const page: Source = { ...source('p1'), product: 'confluence', kind: 'page', containerId: 'p1' };
    const args = { source: page, doc: task('@Sam to tidy the old notes by Friday'), authorId: 'acc', writtenAt: new Date(at), now: at };
    await ingest(args);
    const [f] = [...db.values()];
    if (!f) throw new Error('not saved');
    db.set(f.id, { ...f, dismissed: true, settledBy: 'r1' });

    await ingest({ ...args, doc: task('@Sam to tidy the old notes by Monday'), writtenAt: new Date(at + 1000), now: at + 1000 });
    expect(db.get(f.id)?.dismissed).toBe(true);
    await ingest({ ...args, doc: task('I will send the signed contract to Legal by Friday'), writtenAt: new Date(at + 500), now: at + 1000 });
    expect(db.get(f.id)?.dismissed).toBe(true);

    const back = await ingest({ ...args, doc: task('I will send the signed contract to Legal by Friday'), authorId: 'kim', writtenAt: new Date(at + 2000), now: at + 2000 });
    expect(back.found).toBe(1);
    expect(db.get(f.id)).toMatchObject({ status: 'open', writtenAt: at + 2000, owner: { accountId: 'kim' }, action: expect.stringContaining('signed contract') });
    expect(db.get(f.id)?.dismissed).toBeUndefined();
    expect(db.get(f.id)?.settledBy).toBe('r1');
  });

  it('ignores a delayed tick after a newer page still shows the task open', async () => {
    const task = (state: 'TODO' | 'DONE') => ({
      type: 'doc', version: 1,
      content: [{ type: 'taskList', attrs: { localId: 'l1' }, content: [{
        type: 'taskItem', attrs: { localId: 't1', state },
        content: [{ type: 'text', text: 'I will send the signed contract by Friday' }],
      }] }],
    });
    const page: Source = { ...source('p1'), product: 'confluence', kind: 'page', containerId: 'p1' };
    const ingestTask = (state: 'TODO' | 'DONE', writtenAt: number) =>
      ingest({ source: page, doc: task(state), authorId: 'acc', writtenAt: new Date(writtenAt), now: at + 5000 });

    await ingestTask('TODO', at);
    await ingestTask('TODO', at + 2000);
    expect((await ingestTask('DONE', at + 1000)).settled).toBe(0);
    expect([...db.values()]).toMatchObject([{ status: 'open', writtenAt: at, pageSnapshotAt: at + 2000 }]);

    expect((await ingestTask('DONE', at + 3000)).settled).toBe(1);
    expect((await ingestTask('DONE', at + 3000)).settled).toBe(0);
    expect([...db.values()]).toMatchObject([{ status: 'kept', writtenAt: at, pageSnapshotAt: at + 3000 }]);
  });
});
