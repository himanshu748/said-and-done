/** The few Jira and Confluence REST calls the app makes. Every call names who it runs as. */
import api, { route } from '@forge/api';
import type { Person } from './core/ledger';

export type Product = 'jira' | 'confluence';
export type As = 'app' | 'user';
interface ScanPage<T> { items: T[]; more: boolean }

const client = (as: As) => (as === 'app' ? api.asApp() : api.asUser());

async function json<T>(res: { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }, what: string): Promise<T> {
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export interface SiteUser extends Person {
  timeZone: string;
  isApp: boolean;
  lookupIncomplete?: true;
}

export async function getUser(product: Product, accountId: string): Promise<SiteUser> {
  try {
    const res =
      product === 'jira'
        ? await api.asApp().requestJira(route`/rest/api/3/user?accountId=${accountId}`)
        : await api.asApp().requestConfluence(route`/wiki/rest/api/user?accountId=${accountId}`);
    const u = await json<{ displayName?: string; publicName?: string; timeZone?: string; accountType?: string }>(res, 'user');
    return { accountId, name: u.displayName ?? u.publicName ?? 'Someone', timeZone: u.timeZone ?? 'UTC', isApp: u.accountType === 'app' };
  } catch {
    return { accountId, name: 'Someone', timeZone: 'UTC', isApp: false, lookupIncomplete: true };
  }
}

// ---------- Jira ----------

export interface JiraComment {
  id: string;
  body: unknown;
  created: string;
  updated?: string;
  author?: { accountId: string; displayName?: string; accountType?: string };
}

export async function getJiraComment(issueId: string, commentId: string): Promise<JiraComment> {
  return json(await api.asApp().requestJira(route`/rest/api/3/issue/${issueId}/comment/${commentId}`), 'comment');
}

export async function getIssue(issueId: string): Promise<{ id: string; key: string; summary: string }> {
  const r = await json<{ id: string; key: string; fields: { summary: string } }>(await api.asApp().requestJira(route`/rest/api/3/issue/${issueId}?fields=summary`), 'issue');
  return { id: r.id, key: r.key, summary: r.fields.summary };
}

export interface JiraIssueWithComments {
  id: string;
  key: string;
  fields: { summary: string; comment?: { comments: JiraComment[]; total?: number } };
}

export async function searchRecentIssues(as: As, days: number, max: number): Promise<ScanPage<JiraIssueWithComments>> {
  const res = await client(as).requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jql: `updated >= -${days}d ORDER BY updated DESC`, maxResults: max, fields: ['summary', 'comment'] }),
  });
  const page = await json<{ issues: JiraIssueWithComments[]; isLast?: boolean; nextPageToken?: string }>(res, 'search');
  return { items: page.issues, more: page.isLast === false || Boolean(page.nextPageToken) };
}

/** Ids of the issues the viewer can see, out of `ids`. */
export async function visibleIssueIds(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100).filter((x) => /^\d+$/.test(x));
    if (!part.length) continue;
    const jql = `id in (${part.join(',')})`;
    const cursors = new Set<string>();
    let nextPageToken: string | undefined;
    do {
      const res = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jql, maxResults: 100, fields: ['id'], nextPageToken }),
      });
      const page = await json<{ issues: { id: string }[]; nextPageToken?: string }>(res, 'visibility');
      for (const x of page.issues) out.add(x.id);
      nextPageToken = page.nextPageToken;
      if (nextPageToken) {
        if (cursors.has(nextPageToken)) throw new Error('Jira issue visibility pagination did not advance');
        cursors.add(nextPageToken);
      }
    } while (nextPageToken);
  }
  return out;
}

export async function addJiraComment(issueId: string, body: unknown): Promise<void> {
  await json(
    await api.asApp().requestJira(route`/rest/api/3/issue/${issueId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ body }),
    }),
    'add comment',
  );
}

// ---------- Confluence ----------

interface V2Body {
  body?: { atlas_doc_format?: { value?: string } };
}

export interface ConfluencePage extends V2Body {
  id: string;
  title: string;
  spaceId: string;
  authorId?: string;
  createdAt?: string;
  version?: { authorId?: string; createdAt?: string; number?: number };
  _links?: { webui?: string };
}

export interface ConfluenceComment extends V2Body {
  id: string;
  pageId?: string;
  version?: { authorId?: string; createdAt?: string };
}

export function adfOf(x: V2Body): unknown {
  const v = x.body?.atlas_doc_format?.value;
  if (!v) return undefined;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return undefined;
  }
}

export async function getPage(pageId: string): Promise<ConfluencePage> {
  return json(await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`), 'page');
}

export async function getPageComment(commentId: string): Promise<ConfluenceComment> {
  return json(await api.asApp().requestConfluence(route`/wiki/api/v2/footer-comments/${commentId}?body-format=atlas_doc_format`), 'page comment');
}

export async function getSpaceKey(spaceId: string): Promise<string> {
  try {
    return (await json<{ key: string }>(await api.asApp().requestConfluence(route`/wiki/api/v2/spaces/${spaceId}`), 'space')).key;
  } catch {
    return '';
  }
}

export async function recentPages(as: As, limit: number): Promise<ScanPage<ConfluencePage>> {
  const res = await client(as).requestConfluence(route`/wiki/api/v2/pages?sort=-modified-date&limit=${limit}&body-format=atlas_doc_format`);
  const page = await json<{ results: ConfluencePage[]; _links?: { next?: string } }>(res, 'pages');
  return { items: page.results, more: Boolean(page._links?.next) };
}

export async function pageComments(as: As, pageId: string, shouldStop: () => boolean): Promise<ScanPage<ConfluenceComment>> {
  const items: ConfluenceComment[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const path = cursor
      ? route`/wiki/api/v2/pages/${pageId}/footer-comments?body-format=atlas_doc_format&limit=50&cursor=${cursor}`
      : route`/wiki/api/v2/pages/${pageId}/footer-comments?body-format=atlas_doc_format&limit=50`;
    try {
      const res = await client(as).requestConfluence(path);
      const page = await json<{ results: ConfluenceComment[]; _links?: { next?: string } }>(res, 'page comments');
      for (const comment of page.results) items.push({ ...comment, pageId });
      if (!page._links?.next) return { items, more: false };
      cursor = new URL(page._links.next, 'https://confluence.invalid').searchParams.get('cursor');
      if (!cursor || cursors.has(cursor)) return { items, more: true };
      cursors.add(cursor);
    } catch {
      return { items, more: true };
    }
  } while (!shouldStop());
  return { items, more: true };
}

export async function visiblePageIds(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100).filter((x) => /^\d+$/.test(x));
    if (!part.length) continue;
    const cursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const path = cursor
        ? route`/wiki/api/v2/pages?id=${part.join(',')}&limit=250&cursor=${cursor}`
        : route`/wiki/api/v2/pages?id=${part.join(',')}&limit=250`;
      const res = await api.asUser().requestConfluence(path);
      const page = await json<{ results: { id: string }[]; _links?: { next?: string } }>(res, 'visibility');
      for (const p of page.results) out.add(p.id);
      const next = page._links?.next;
      cursor = next ? new URL(next, 'https://confluence.invalid').searchParams.get('cursor') : null;
      if (next && (!cursor || cursors.has(cursor))) throw new Error('Confluence page visibility pagination did not advance');
      if (cursor) cursors.add(cursor);
    } while (cursor);
  }
  return out;
}

export async function addPageComment(pageId: string, body: unknown): Promise<void> {
  await json(
    await api.asApp().requestConfluence(route`/wiki/api/v2/footer-comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ pageId, body: { representation: 'atlas_doc_format', value: JSON.stringify(body) } }),
    }),
    'add page comment',
  );
}
