import { beforeEach, expect, it, vi } from 'vitest';
import { visibleIssueIds, visiblePageIds } from '../src/site';

const { jira, confluence } = vi.hoisted(() => ({ jira: vi.fn(), confluence: vi.fn() }));
vi.mock('@forge/api', () => ({
  default: { asUser: () => ({ requestJira: jira, requestConfluence: confluence }) },
  route: (strings: TemplateStringsArray, ...values: string[]) =>
    strings.reduce((path, part, i) => path + part + encodeURIComponent(values[i] ?? ''), ''),
}));

const page = (issues: string[], nextPageToken?: string) => ({
  ok: true,
  json: async () => ({ issues: issues.map((id) => ({ id })), nextPageToken }),
});

beforeEach(() => {
  jira.mockReset();
  confluence.mockReset();
});

it('keeps visible issues from subsequent search pages without exposing unseen IDs', async () => {
  jira.mockResolvedValueOnce(page(['1'], 'second')).mockResolvedValueOnce(page(['2']));

  expect(await visibleIssueIds(['1', '2', '3'])).toEqual(new Set(['1', '2']));
  const bodies = jira.mock.calls.map(([, init]) => JSON.parse(init.body));
  expect(bodies).toEqual([
    { jql: 'id in (1,2,3)', maxResults: 100, fields: ['id'] },
    { jql: 'id in (1,2,3)', maxResults: 100, fields: ['id'], nextPageToken: 'second' },
  ]);
});

it('rejects a repeated search cursor instead of looping or claiming complete visibility', async () => {
  jira.mockResolvedValueOnce(page(['1'], 'repeat')).mockResolvedValueOnce(page([], 'repeat'));
  await expect(visibleIssueIds(['1', '2'])).rejects.toThrow('Jira issue visibility pagination did not advance');
  expect(jira).toHaveBeenCalledTimes(2);
});

const pages = (ids: string[], next?: string) => ({
  ok: true,
  json: async () => ({ results: ids.map((id) => ({ id })), _links: { next } }),
});

it('keeps readable Confluence pages from subsequent visibility pages', async () => {
  confluence.mockResolvedValueOnce(pages(['1'], '/wiki/api/v2/pages?cursor=next%2B%3D'))
    .mockResolvedValueOnce(pages(['2']));

  expect(await visiblePageIds(['1', '2', '3'])).toEqual(new Set(['1', '2']));
  expect(confluence.mock.calls).toEqual([
    ['/wiki/api/v2/pages?id=1%2C2%2C3&limit=250'],
    ['/wiki/api/v2/pages?id=1%2C2%2C3&limit=250&cursor=next%2B%3D'],
  ]);
});

it('rejects a repeated Confluence visibility cursor', async () => {
  confluence.mockResolvedValue(pages(['1'], '/wiki/api/v2/pages?cursor=repeat'));
  await expect(visiblePageIds(['1', '2'])).rejects.toThrow('Confluence page visibility pagination did not advance');
  expect(confluence).toHaveBeenCalledTimes(2);
});
