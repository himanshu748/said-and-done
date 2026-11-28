import { beforeEach, expect, it, vi } from 'vitest';

const { handlers, jira, confluence } = vi.hoisted(() => ({
  handlers: {} as Record<string, (params: { context: { moduleKey: string } }) => Promise<unknown>>,
  jira: vi.fn(),
  confluence: vi.fn(),
}));
vi.mock('@forge/resolver', () => ({
  default: class {
    define(name: string, fn: (typeof handlers)[string]) { handlers[name] = fn; }
    getDefinitions() { return handlers; }
  },
}));
vi.mock('@forge/api', () => ({
  default: { asUser: () => ({ requestJira: jira, requestConfluence: confluence }) },
  route: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((path, chunk, i) => path + chunk + (values[i] ?? ''), ''),
}));
vi.mock('../src/sources', () => ({
  ingestJiraComment: vi.fn(async () => ({ found: 1 })),
  ingestPage: vi.fn(async () => ({ found: 1 })),
  ingestPageComment: vi.fn(async () => ({ found: 1 })),
}));
vi.mock('../src/store', () => ({}));

await import('../src/resolver');

const scan = (moduleKey: string) => {
  const handler = handlers.scan;
  if (!handler) throw new Error('Scan resolver was not registered');
  return handler({ context: { moduleKey } });
};
const response = (body: object) => ({ ok: true, json: async () => body });

beforeEach(() => {
  jira.mockReset();
  confluence.mockReset();
});

it.each(['issues', 'comments'])('reports a partial Jira scan when the %s response is truncated', async (kind) => {
  const created = new Date(Date.now() - 60_000).toISOString();
  const comment = { comments: [{ id: 'c1', created }], total: kind === 'comments' ? 2 : 1 };
  jira.mockResolvedValue(response({
    issues: [{ id: '1', key: 'APP-1', fields: { summary: 'Draft', comment } }],
    isLast: kind !== 'issues',
    ...(kind === 'issues' ? { nextPageToken: 'next' } : {}),
  }));
  expect(await scan('jira-ledger')).toEqual({ scanned: 1, found: 1, partial: true });
  expect(jira).toHaveBeenCalledTimes(1);
});

it('reports a partial Confluence scan when the pages response has a next cursor', async () => {
  const createdAt = new Date(Date.now() - 60_000).toISOString();
  confluence
    .mockResolvedValueOnce(response({ results: [{ id: 'p1', createdAt }], _links: { next: '/pages?cursor=next' } }))
    .mockResolvedValueOnce(response({ results: [{ id: 'c1', version: { createdAt } }] }));
  expect(await scan('confluence-ledger')).toEqual({ scanned: 2, found: 2, partial: true });
  expect(confluence).toHaveBeenCalledTimes(2);
});

it('scans Confluence footer comments across pages and replays them chronologically', async () => {
  const createdAt = new Date(Date.now() - 60_000).toISOString();
  const earlier = new Date(Date.now() - 120_000).toISOString();
  const { ingestPageComment } = await import('../src/sources');
  vi.mocked(ingestPageComment).mockClear();
  confluence
    .mockResolvedValueOnce(response({ results: [{ id: 'p1', createdAt }] }))
    .mockResolvedValueOnce(response({ results: [{ id: 'reply', version: { createdAt } }], _links: { next: '/footer-comments?cursor=next' } }))
    .mockResolvedValueOnce(response({ results: [{ id: 'promise', version: { createdAt: earlier } }] }));
  expect(await scan('confluence-ledger')).toEqual({ scanned: 3, found: 3, partial: false });
  expect(confluence.mock.calls[2]?.[0]).toContain('cursor=next');
  expect(vi.mocked(ingestPageComment).mock.calls.map(([comment]) => comment.id)).toEqual(['promise', 'reply']);
});

it('keeps the first page and marks the scan partial when a later comment page fails', async () => {
  const createdAt = new Date(Date.now() - 60_000).toISOString();
  confluence
    .mockResolvedValueOnce(response({ results: [{ id: 'p1', createdAt }] }))
    .mockResolvedValueOnce(response({ results: [{ id: 'c1', version: { createdAt } }], _links: { next: '/footer-comments?cursor=next' } }))
    .mockRejectedValueOnce(new Error('Confluence unavailable'));
  expect(await scan('confluence-ledger')).toEqual({ scanned: 2, found: 2, partial: true });
  expect(confluence).toHaveBeenCalledTimes(3);
});

it('replays collected comments even if the next page stalls', async () => {
  vi.useFakeTimers();
  try {
    const createdAt = new Date(Date.now() - 60_000).toISOString();
    confluence
      .mockResolvedValueOnce(response({ results: [{ id: 'p1', createdAt }] }))
      .mockResolvedValueOnce(response({ results: [{ id: 'c1', version: { createdAt } }], _links: { next: '/footer-comments?cursor=next' } }))
      .mockImplementationOnce(() => new Promise(() => {}));
    const finished = vi.fn();
    void scan('confluence-ledger').then(finished);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(confluence).toHaveBeenCalledTimes(3);
    expect(finished).toHaveBeenCalledWith({ scanned: 2, found: 2, partial: true });
  } finally {
    vi.useRealTimers();
  }
});
