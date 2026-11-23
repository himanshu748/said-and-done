/** Reads one comment or page, records the promises in it and the replies that settle earlier ones. */
import { adfToBlocks, type Block } from './core/adf';
import { dayInZone } from './core/dates';
import { detectPromises } from './core/detect';
import { pickPromise, readSignal } from './core/followup';
import { fromCandidate, refresh, withEvent, type FollowUp, type Source } from './core/ledger';
import { MARKER } from './core/reminder';
import { getUser, type Product, type SiteUser } from './site';
import { getFollowUp, listForContainer, saveFollowUp } from './store';

export interface IngestResult {
  found: number;
  settled: number;
}

const users = new Map<string, Promise<SiteUser>>();
function user(product: Product, accountId: string): Promise<SiteUser> {
  const k = `${product}:${accountId}`;
  let u = users.get(k);
  if (!u) {
    u = getUser(product, accountId);
    users.set(k, u);
  }
  return u;
}

export async function ingest(args: { source: Source; doc: unknown; authorId: string; writtenAt: Date; now: number; backfill?: boolean }): Promise<IngestResult> {
  const { source, now } = args;
  const product = source.product;
  const blocks = adfToBlocks(args.doc);
  const text = blocks.map((b) => b.text).join('\n');
  if (!text.trim() || text.includes(MARKER) || !args.authorId) return { found: 0, settled: 0 };
  const author = await user(product, args.authorId);
  if (author.isApp) return { found: 0, settled: 0 };
  const writtenOn = dayInZone(args.writtenAt, author.timeZone);
  const result: IngestResult = { found: 0, settled: 0 };
  const authorPerson = { accountId: author.accountId, name: author.name };

  // A comment from an owner can settle their earlier promise in the same issue or page.
  if (source.kind !== 'page') {
    const signal = readSignal(text);
    const all = signal ? await listForContainer(source.containerId) : [];
    const written = args.writtenAt.getTime();
    if (signal && !all.some((f) => f.settledBy === source.itemId)) {
      const open = all.filter(
        (f) => f.owner.accountId === author.accountId && f.source.itemId !== source.itemId && (f.status === 'open' || (f.status === 'slipping' && signal === 'done')) && (f.writtenAt !== undefined ? f.writtenAt < written : f.createdAt < now),
      );
      const hit = pickPromise(open, text);
      if (hit) {
        await saveFollowUp(withEvent(hit, { status: signal === 'done' ? 'kept' : 'slipping', settledBy: source.itemId }, signal === 'done' ? `Kept — ${author.name} replied` : `Slipping — ${author.name} asked for more time`, now));
        result.settled++;
      }
    }
  }

  const seen = new Set<string>();
  for (const c of detectPromises(blocks, writtenOn)) {
    seen.add(c.fingerprint);
    const owner = c.owner.kind === 'author' ? authorPerson : { accountId: c.owner.accountId, name: (await user(product, c.owner.accountId)).name || c.owner.name };
    const next = fromCandidate(c, { source, author: authorPerson, owner, timeZone: author.timeZone, now });
    next.writtenAt = args.writtenAt.getTime();
    if (args.backfill && next.due && next.due.at < now) next.nudges = ['before', 'overdue'];
    const prev = await getFollowUp(next.id);
    // "I will…" belongs to whoever wrote it first, not to a later editor of the page.
    if (prev && c.owner.kind === 'author') next.owner = prev.author;
    const base = prev?.removed ? withEvent(prev, { status: 'open', removed: false }, 'Reopened — back on the page', now) : prev;
    const save = base ? refresh(base, next, now) : next;
    if (save !== prev) await saveFollowUp(save);
    if (!prev) result.found++;
  }

  // Ticked action items on a page settle their promise.
  if (source.kind === 'page') {
    const ticked: Block[] = blocks.filter((b) => b.task?.state === 'DONE').map((b) => ({ ...b, task: { state: 'TODO', localId: b.task?.localId ?? '' } }));
    for (const c of detectPromises(ticked, writtenOn)) {
      seen.add(c.fingerprint);
      const existing = (await listForContainer(source.containerId)).find((f) => f.fingerprint === c.fingerprint && f.source.itemId === source.itemId);
      if (existing && (existing.status === 'open' || existing.status === 'slipping')) {
        await saveFollowUp(withEvent(existing, { status: 'kept' }, `Kept — action item ticked by ${author.name}`, now));
        result.settled++;
      }
    }
  }
  // A promise edited out of the page is no longer one.
  if (source.kind === 'page') {
    for (const f of await listForContainer(source.containerId)) {
      if (f.source.itemId === source.itemId && (f.status === 'open' || f.status === 'slipping') && !seen.has(f.fingerprint) && (f.writtenAt ?? 0) <= args.writtenAt.getTime()) {
        await saveFollowUp(withEvent(f, { status: 'dropped', removed: true }, `Dropped — removed from the page by ${author.name}`, now));
      }
    }
  }
  return result;
}

export type { FollowUp };
