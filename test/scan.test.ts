import { expect, it, vi } from 'vitest';

const { handlers, pageComments, ingestPage, ingestPageComment } = vi.hoisted(() => ({
  handlers: {} as Record<string, (params: { context: { moduleKey: string } }) => Promise<unknown>>,
  pageComments: vi.fn(),
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
  recentPages: async () => [{ id: 'first' }, { id: 'second' }],
  pageComments,
}));
vi.mock('../src/sources', () => ({ ingestPage, ingestPageComment }));
vi.mock('../src/store', () => ({}));

await import('../src/resolver');

it('keeps scanning other pages and reports partial results when comments cannot be read', async () => {
  ingestPage.mockResolvedValue({ found: 0 });
  ingestPageComment.mockResolvedValue({ found: 1 });
  pageComments.mockRejectedValueOnce(new Error('comments unavailable')).mockResolvedValueOnce([{ id: 'visible' }]);

  const scan = handlers.scan;
  if (!scan) throw new Error('Scan resolver was not registered');
  const result = await scan({ context: { moduleKey: 'confluence-ledger' } });

  expect(result).toMatchObject({ scanned: 3, found: 1, partial: true });
  expect(ingestPageComment).toHaveBeenCalledTimes(1);
});
