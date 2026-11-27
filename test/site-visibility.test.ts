import { beforeEach, expect, it, vi } from 'vitest';
import { visibleIssueIds } from '../src/site';

const { jira } = vi.hoisted(() => ({ jira: vi.fn() }));
vi.mock('@forge/api', () => ({
  default: { asUser: () => ({ requestJira: jira }) },
  route: (strings: TemplateStringsArray) => strings[0],
}));

const page = (issues: string[], nextPageToken?: string) => ({
  ok: true,
  json: async () => ({ issues: issues.map((id) => ({ id })), nextPageToken }),
});

beforeEach(() => jira.mockReset());

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
