import { beforeEach, expect, it, vi } from 'vitest';
import type { FollowUp, Source } from '../src/core/ledger';

type Call = { context: Record<string, unknown>; payload?: unknown };
const { handlers, records, visibleIssueIds, visiblePageIds } = vi.hoisted(() => ({
  handlers: new Map<string, (call: Call) => Promise<unknown>>(),
  records: new Map<string, FollowUp>(),
  visibleIssueIds: vi.fn(),
  visiblePageIds: vi.fn(),
}));

vi.mock('@forge/resolver', () => ({
  default: class {
    define(name: string, handler: (call: Call) => Promise<unknown>) { handlers.set(name, handler); }
    getDefinitions() { return handlers; }
  },
}));
vi.mock('@forge/kvs', () => ({
  WhereConditions: { beginsWith: vi.fn() },
  kvs: {
    get: async (key: string) => records.get(key),
    set: async (key: string, f: FollowUp) => void records.set(key, f),
    query: () => ({ where: () => ({ limit: () => ({ getMany: async () => ({ results: [...records.values()].map((value) => ({ value })) }) }) }) }),
  },
}));
vi.mock('../src/site', () => ({ visibleIssueIds, visiblePageIds }));
await import('../src/resolver');

const containerId = '10001';
const jiraSource: Source = { product: 'jira', kind: 'comment', containerId, containerKey: 'TEAM-1', title: 'Issue', itemId: '2', url: '/browse/TEAM-1' };
const pageSource: Source = { product: 'confluence', kind: 'page', containerId, containerKey: 'TEAM', title: 'Page', itemId: containerId, url: '/wiki/page/10001' };
const person = { accountId: 'owner', name: 'Owner' };
function record(source: Source): FollowUp {
  return { id: source.product, fingerprint: 'record', action: 'send the plan', quote: "I'll send the plan", owner: person, author: person, confidence: 'high', due: null, source, status: 'open', createdAt: 1, updatedAt: 1, nudges: [], history: [] };
}

beforeEach(() => {
  records.clear();
  records.set('fu:jira', record(jiraSource));
  records.set('fu:confluence', record(pageSource));
  visibleIssueIds.mockReset().mockResolvedValue(new Set([containerId]));
  visiblePageIds.mockReset().mockResolvedValue(new Set([containerId]));
});

function handler(name: string) {
  const found = handlers.get(name);
  if (!found) throw new Error(`Missing resolver ${name}`);
  return found;
}

it('keeps panel records in their product when container IDs match', async () => {
  const list = handler('list');
  const jira = await list({ context: { moduleKey: 'jira-issue-promises', extension: { issue: { id: containerId } } } });
  const confluence = await list({ context: { moduleKey: 'confluence-page-promises', extension: { content: { id: containerId } } } });
  expect(jira).toMatchObject({ items: [{ id: 'jira' }], stats: { open: 1 } });
  expect(confluence).toMatchObject({ items: [{ id: 'confluence' }], stats: { open: 1 } });
});

it('keeps visibility results local to their product in the global ledger', async () => {
  const list = handler('list');
  expect(await list({ context: { moduleKey: 'jira-ledger' } })).toMatchObject({ items: [{ id: 'jira' }] });
  expect(await list({ context: { moduleKey: 'confluence-ledger' } })).toMatchObject({ items: [{ id: 'confluence' }] });
});

it('bounds edits to the current product and still permits an authorized edit', async () => {
  const change = handler('setStatus');
  const context = { moduleKey: 'jira-ledger' };
  await expect(change({ context, payload: { id: 'confluence', status: 'kept' } })).rejects.toThrow('You cannot see where this promise was made.');
  expect(records.get('fu:confluence')?.status).toBe('open');
  await expect(change({ context, payload: { id: 'jira', status: 'kept' } })).resolves.toMatchObject({ status: 'kept' });
});
