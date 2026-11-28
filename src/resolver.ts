import Resolver from '@forge/resolver';
import { sortForLedger, stats, withEvent, type FollowUp, type Status } from './core/ledger';
import { endOfDayInZone, isCalendarDay } from './core/dates';
import { recentPages, pageComments, searchRecentIssues, visibleIssueIds, visiblePageIds, getUser, type Product } from './site';
import { ingestJiraComment, ingestPage, ingestPageComment, jiraCommentRevisionAt } from './sources';
import { getFollowUp, listFollowUps, listForContainer, saveFollowUp } from './store';

interface Ctx {
  accountId?: string;
  moduleKey?: string;
  extension?: { type?: string; issue?: { id?: string | number }; content?: { id?: string | number } };
}

const productOf = (ctx: Ctx): Product => (ctx.moduleKey?.startsWith('confluence') ? 'confluence' : 'jira');
const containerOf = (ctx: Ctx): string | null => {
  const id = ctx.extension?.issue?.id ?? ctx.extension?.content?.id;
  return id === undefined ? null : String(id);
};

async function visible(product: Product, items: FollowUp[]): Promise<FollowUp[]> {
  const scoped = items.filter((f) => f.source.product === product);
  const ids = [...new Set(scoped.map((f) => f.source.containerId))];
  if (!ids.length) return [];
  const ok = product === 'jira' ? await visibleIssueIds(ids) : await visiblePageIds(ids);
  return scoped.filter((f) => ok.has(f.source.containerId));
}

async function editable(ctx: Ctx, id: string): Promise<FollowUp> {
  const f = await getFollowUp(id);
  if (!f) throw new Error('This follow-up no longer exists.');
  if (!(await visible(productOf(ctx), [f])).length) throw new Error('You cannot see where this promise was made.');
  return f;
}

const STATUS_LABEL: Record<Status, string> = { open: 'Reopened', slipping: 'Marked as slipping', kept: 'Kept', dropped: 'Dropped' };

const resolver = new Resolver();

resolver.define('list', async ({ context }) => {
  const ctx = context as Ctx;
  const product = productOf(ctx);
  const container = containerOf(ctx);
  // Panels sit on an issue or page the viewer already has open.
  const items = container ? await listForContainer(product, container) : await visible(product, await listFollowUps());
  const now = Date.now();
  return { product, now, viewer: ctx.accountId ?? null, scoped: Boolean(container), items: sortForLedger(items), stats: stats(items, now) };
});

resolver.define('setStatus', async ({ payload, context }) => {
  const { id, status } = payload as { id: string; status: Status };
  if (!['open', 'slipping', 'kept', 'dropped'].includes(status)) throw new Error('Unknown status');
  const ctx = context as Ctx;
  const f = await editable(ctx, id);
  const who = ctx.accountId ? (await getUser(productOf(ctx), ctx.accountId)).name : 'someone';
  const next = withEvent(f, { status }, `${STATUS_LABEL[status]} by ${who}`, Date.now());
  await saveFollowUp(next);
  return next;
});

resolver.define('setDue', async ({ payload, context }) => {
  const { id, day } = payload as { id: string; day: string | null };
  if (day !== null && !isCalendarDay(day)) throw new Error('Use a valid YYYY-MM-DD date');
  const ctx = context as Ctx;
  const f = await editable(ctx, id);
  const tz = ctx.accountId ? (await getUser(productOf(ctx), ctx.accountId)).timeZone : 'UTC';
  const due = day ? { day, phrase: f.due?.phrase ?? 'set by hand', precision: 'day' as const, at: endOfDayInZone(day, tz) } : null;
  const next = withEvent(f, { due, dueByHand: true, nudges: [] }, day ? `Due date set to ${day}` : 'Due date cleared', Date.now());
  await saveFollowUp(next);
  return next;
});

resolver.define('dismiss', async ({ payload, context }) => {
  const { id, dismissed } = payload as { id: string; dismissed: boolean };
  const ctx = context as Ctx;
  const f = await editable(ctx, id);
  const who = ctx.accountId ? (await getUser(productOf(ctx), ctx.accountId)).name : 'someone';
  const next = withEvent(f, { dismissed: Boolean(dismissed) }, dismissed ? `Marked not a promise by ${who}` : `Restored by ${who}`, Date.now());
  await saveFollowUp(next);
  return next;
});

/** Reads recent comments and pages the viewer can see and records the promises in them. */
resolver.define('scan', async ({ context }) => {
  const ctx = context as Ctx;
  const now = Date.now();
  let scanned = 0;
  let found = 0;
  let partial = false;
  const deadline = now + 20_000;
  const scanDays = 30;
  const since = now - scanDays * 24 * 60 * 60 * 1_000;
  const timedOut = () => {
    if (Date.now() <= deadline) return false;
    partial = true;
    return true;
  };
  const inScanWindow = (stamp: string | number | undefined) => {
    const time = typeof stamp === 'number' ? stamp : Date.parse(stamp ?? '');
    if (!Number.isFinite(time)) partial = true;
    return time >= since && time <= now;
  };
  const record = async (item: Promise<{ found: number }>) => {
    try {
      found += (await item).found;
      scanned++;
    } catch {
      partial = true;
    }
  };
  if (productOf(ctx) === 'jira') {
    const issues = await searchRecentIssues('user', scanDays, 40);
    partial ||= issues.more;
    for (const issue of issues.items) {
      if (timedOut()) break;
      const comments = issue.fields.comment;
      if (!comments) continue;
      partial ||= (comments.total ?? 0) > comments.comments.length;
      const sourceIssue = { id: issue.id, key: issue.key, summary: issue.fields.summary };
      const recent: { comment: (typeof comments.comments)[number]; time: number }[] = [];
      const edited: { comment: (typeof comments.comments)[number]; time: number }[] = [];
      for (const c of comments.comments) {
        if (timedOut()) break;
        const created = Date.parse(c.created);
        if (inScanWindow(created)) {
          recent.push({ comment: c, time: created });
        } else {
          const time = jiraCommentRevisionAt(c);
          if (inScanWindow(time)) edited.push({ comment: c, time });
        }
      }
      for (const { comment } of recent.sort((a, b) => a.time - b.time)) {
        if (timedOut()) break;
        await record(ingestJiraComment(sourceIssue, comment, now, true));
      }
      // Register recent promises before letting older comments' edits settle them.
      for (const { comment } of edited.sort((a, b) => a.time - b.time)) {
        if (timedOut()) break;
        await record(ingestJiraComment(sourceIssue, comment, now, true, { settlementOnly: true }));
      }
    }
  } else {
    const pages = await recentPages('user', 25);
    partial ||= pages.more;
    for (const p of pages.items) {
      if (timedOut()) break;
      if (inScanWindow(p.version?.createdAt ?? p.createdAt)) {
        await record(ingestPage(p, now, true));
      }
      // Recent footer comments can belong to a page whose own text is older.
      if (timedOut()) break;
      const comments = await pageComments('user', p.id).catch(() => ({ items: [], more: true }));
      partial ||= comments.more;
      const ordered = comments.items
        .map((comment) => ({ comment, time: Date.parse(comment.version?.createdAt ?? '') }))
        .filter(({ time }) => inScanWindow(time))
        .sort((a, b) => a.time - b.time);
      for (const { comment } of ordered) {
        if (timedOut()) break;
        await record(ingestPageComment(comment, now, p, true));
      }
    }
  }
  return { scanned, found, partial };
});

export const handler = resolver.getDefinitions();
