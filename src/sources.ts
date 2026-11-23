/** Builds the Source for each kind of text and feeds it to ingest. */
import type { Source } from './core/ledger';
import { ingest, type IngestResult } from './ingest';
import { adfOf, getPage, getSpaceKey, type ConfluenceComment, type ConfluencePage, type JiraComment } from './site';

export function jiraSource(issue: { id: string; key: string; summary: string }, commentId: string): Source {
  return { product: 'jira', kind: 'comment', containerId: issue.id, containerKey: issue.key, title: issue.summary, itemId: commentId, url: `/browse/${issue.key}?focusedCommentId=${commentId}` };
}

export function ingestJiraComment(issue: { id: string; key: string; summary: string }, c: JiraComment, now: number, backfill = false): Promise<IngestResult> {
  // Restricted comments stay private: tracking them would quote them in the ledger and in public reminders.
  if ((c as { visibility?: unknown }).visibility) return Promise.resolve({ found: 0, settled: 0 });
  return ingest({ source: jiraSource(issue, c.id), doc: c.body, authorId: c.author?.accountId ?? '', writtenAt: new Date(c.created), now, backfill });
}

const spaceKeys = new Map<string, Promise<string>>();
function spaceKey(id: string): Promise<string> {
  let k = spaceKeys.get(id);
  if (!k) {
    k = getSpaceKey(id);
    spaceKeys.set(id, k);
  }
  return k;
}

export async function ingestPage(p: ConfluencePage, now: number, backfill = false): Promise<IngestResult> {
  const source: Source = { product: 'confluence', kind: 'page', containerId: p.id, containerKey: await spaceKey(p.spaceId), title: p.title, itemId: p.id, url: `/wiki${p._links?.webui ?? `/pages/viewpage.action?pageId=${p.id}`}` };
  return ingest({ source, doc: adfOf(p), authorId: p.version?.authorId ?? p.authorId ?? '', writtenAt: new Date(p.version?.createdAt ?? p.createdAt ?? Date.now()), now, backfill });
}

export async function ingestPageComment(c: ConfluenceComment, now: number, page?: ConfluencePage, backfill = false): Promise<IngestResult> {
  if (!c.pageId) return { found: 0, settled: 0 };
  const p = page ?? (await getPage(c.pageId));
  const source: Source = {
    product: 'confluence',
    kind: 'page-comment',
    containerId: p.id,
    containerKey: await spaceKey(p.spaceId),
    title: p.title,
    itemId: c.id,
    url: `/wiki${p._links?.webui ?? `/pages/viewpage.action?pageId=${p.id}`}?focusedCommentId=${c.id}`,
  };
  return ingest({ source, doc: adfOf(c), authorId: c.version?.authorId ?? '', writtenAt: new Date(c.version?.createdAt ?? Date.now()), now, backfill });
}
