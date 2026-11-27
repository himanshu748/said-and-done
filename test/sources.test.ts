import { expect, it, vi } from 'vitest';
import { ingest } from '../src/ingest';
import { ingestPageComment } from '../src/sources';
import type { ConfluencePage } from '../src/site';

vi.mock('../src/ingest', () => ({ ingest: vi.fn(async () => ({ found: 1, settled: 0 })) }));
vi.mock('../src/site', () => ({ adfOf: vi.fn(), getSpaceKey: vi.fn(async () => 'OPS') }));

it.each([
  [undefined, '/wiki/pages/viewpage.action?pageId=123&focusedCommentId=456'],
  ['/spaces/OPS/pages/123?origin=watch#notes', '/wiki/spaces/OPS/pages/123?origin=watch&focusedCommentId=456#notes'],
])('links directly to the comment without losing the page or other parameters', async (webui, url) => {
  const page: ConfluencePage = { id: '123', title: 'Plan', spaceId: '1' };
  if (webui) page._links = { webui };
  await ingestPageComment({ id: '456', pageId: page.id }, 0, page);
  expect(vi.mocked(ingest).mock.lastCall?.[0].source.url).toBe(url);
});
