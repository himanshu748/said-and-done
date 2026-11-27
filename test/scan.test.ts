import { expect, it, vi } from 'vitest';

const { handlers, searchRecentIssues, recentPages, pageComments, ingestJiraComment, ingestPage, ingestPageComment } = vi.hoisted(() => ({
  handlers: {} as Record<string, (params: { context: { moduleKey: string } }) => Promise<unknown>>,
  searchRecentIssues: vi.fn(),
  recentPages: vi.fn(),
  pageComments: vi.fn(),
  ingestJiraComment: vi.fn(),
  ingestPage: vi.fn(),
  ingestPageComment: vi.fn(),
}));

vi.mock('@forge/resolver', () => ({
  default: class {
    define(name: string, fn: (typeof handlers)[string]) { handlers[name] = fn; }
    getDefinitions() { return handlers; }
  },
}));

vi.mock('../src/site', () => ({
  recentPages,
  searchRecentIssues,
  pageComments,
}));
vi.mock('../src/sources', () => ({ ingestJiraComment, ingestPage, ingestPageComment }));
vi.mock('../src/store', () => ({}));

await import('../src/resolver');

it('imports only Jira comments in the advertised scan window', async () => {
  const scan = handlers.scan;
  if (!scan) throw new Error('Scan resolver was not registered');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-27T12:00:00Z'));
  const recent = { id: 'recent', created: '2026-10-28T12:00:00Z' };
  searchRecentIssues.mockResolvedValue({ items: [{ id: '12', key: 'APP-1', fields: { summary: 'Draft', comment: { comments: [
    { id: 'old', created: '2026-10-28T11:59:59Z' },
    recent,
    { id: 'invalid', created: 'unavailable' },
  ] } } }], more: false });
  ingestJiraComment.mockResolvedValue({ found: 1 });
  try {
    expect(await scan({ context: { moduleKey: 'jira-ledger' } })).toEqual({ scanned: 1, found: 1, partial: true });
    expect(ingestJiraComment).toHaveBeenCalledExactlyOnceWith({ id: '12', key: 'APP-1', summary: 'Draft' }, recent, Date.now(), true);
  } finally {
    clock.mockRestore();
  }
});

it('keeps scanning other pages and reports partial results when comments cannot be read', async () => {
  const recent = new Date(Date.now() - 60_000).toISOString();
  recentPages.mockResolvedValue({ items: [{ id: 'first', createdAt: recent }, { id: 'second', createdAt: recent }], more: false });
  ingestPage.mockResolvedValue({ found: 0 });
  ingestPageComment.mockResolvedValue({ found: 1 });
  pageComments.mockRejectedValueOnce(new Error('comments unavailable')).mockResolvedValueOnce({ items: [{ id: 'visible', version: { createdAt: recent } }], more: false });

  const scan = handlers.scan;
  if (!scan) throw new Error('Scan resolver was not registered');
  const result = await scan({ context: { moduleKey: 'confluence-ledger' } });

  expect(result).toMatchObject({ scanned: 3, found: 1, partial: true });
  expect(ingestPageComment).toHaveBeenCalledTimes(1);
});

it('ignores older Confluence snapshots while scanning their recent footer comments', async () => {
  const scan = handlers.scan;
  if (!scan) throw new Error('Scan resolver was not registered');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-27T12:00:00Z'));
  const old = '2026-10-27T12:00:00Z';
  const recent = '2026-11-20T12:00:00Z';
  const oldPage = { id: 'old-page', createdAt: old };
  const edited = { id: 'edited-page', createdAt: old, version: { createdAt: recent } };
  const newComment = { id: 'recent-comment', version: { createdAt: recent } };
  recentPages.mockResolvedValue({ items: [oldPage, edited], more: false });
  pageComments.mockResolvedValueOnce({ items: [{ id: 'old-comment', version: { createdAt: old } }, newComment], more: false }).mockResolvedValueOnce({ items: [], more: false });
  ingestPage.mockClear().mockResolvedValue({ found: 1 });
  ingestPageComment.mockClear().mockResolvedValue({ found: 1 });
  try {
    expect(await scan({ context: { moduleKey: 'confluence-ledger' } })).toEqual({ scanned: 2, found: 2, partial: false });
    expect(ingestPage).toHaveBeenCalledExactlyOnceWith(edited, Date.now(), true);
    expect(ingestPageComment).toHaveBeenCalledExactlyOnceWith(newComment, Date.now(), oldPage, true);
  } finally {
    clock.mockRestore();
  }
});

it('continues a Jira scan after an individual comment cannot be recorded', async () => {
  const scan = handlers.scan;
  if (!scan) throw new Error('Scan resolver was not registered');
  const recent = new Date(Date.now() - 60_000).toISOString();
  const comments = [{ id: 'unavailable', created: recent }, { id: 'visible', created: recent }];
  searchRecentIssues.mockResolvedValue({ items: [{ id: '12', key: 'APP-1', fields: { summary: 'Draft', comment: { comments } } }], more: false });
  ingestJiraComment.mockClear().mockRejectedValueOnce(new Error('Could not record comment')).mockResolvedValueOnce({ found: 1 });

  expect(await scan({ context: { moduleKey: 'jira-ledger' } })).toEqual({ scanned: 1, found: 1, partial: true });
  expect(ingestJiraComment.mock.calls.map((call) => call[1].id)).toEqual(['unavailable', 'visible']);
});

it('continues reading footer comments when their page cannot be recorded', async () => {
  const scan = handlers.scan;
  if (!scan) throw new Error('Scan resolver was not registered');
  const recent = new Date(Date.now() - 60_000).toISOString();
  const page = { id: 'page', createdAt: recent };
  const comments = [{ id: 'unavailable', version: { createdAt: recent } }, { id: 'visible', version: { createdAt: recent } }];
  recentPages.mockResolvedValue({ items: [page], more: false });
  pageComments.mockResolvedValue({ items: comments, more: false });
  ingestPage.mockRejectedValueOnce(new Error('Could not record page'));
  ingestPageComment.mockClear().mockRejectedValueOnce(new Error('Could not record comment')).mockResolvedValueOnce({ found: 1 });

  expect(await scan({ context: { moduleKey: 'confluence-ledger' } })).toEqual({ scanned: 1, found: 1, partial: true });
  expect(ingestPageComment.mock.calls.map((call) => call[0].id)).toEqual(['unavailable', 'visible']);
});
