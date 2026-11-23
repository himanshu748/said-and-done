/** The follow-up record and the rules that move it: merge new detections, read replies, decide nudges. */
import type { PromiseCandidate } from './detect';
import { endOfDayInZone } from './dates';

export type Status = 'open' | 'slipping' | 'kept' | 'dropped';
export type Nudge = 'before' | 'overdue';

export interface Person {
  accountId: string;
  name: string;
}

export interface Source {
  product: 'jira' | 'confluence';
  kind: 'comment' | 'page' | 'page-comment';
  /** Jira issue id or Confluence page id that owns the text. */
  containerId: string;
  /** Issue key, or the page's space key. */
  containerKey: string;
  title: string;
  /** Comment id, or the page id for page bodies. */
  itemId: string;
  url: string;
}

export interface FollowUp {
  id: string;
  fingerprint: string;
  action: string;
  quote: string;
  owner: Person;
  author: Person;
  confidence: PromiseCandidate['confidence'];
  due: { day: string; phrase: string; precision: 'day' | 'week' | 'month'; at: number } | null;
  source: Source;
  status: Status;
  createdAt: number;
  updatedAt: number;
  nudges: Nudge[];
  /** When the source text was written, for ordering replies. */
  writtenAt?: number;
  /** The reply that settled it, so rereading that reply settles nothing else. */
  settledBy?: string;
  /** Dropped because its text left the page; restoring the text reopens it. */
  removed?: boolean;
  history: { at: number; what: string }[];
}

const DAY = 86_400_000;

export const followUpId = (s: Source, fingerprint: string): string =>
  `${s.product === 'jira' ? 'j' : 'c'}:${s.containerId}:${s.itemId}:${fingerprint}`;

export function fromCandidate(c: PromiseCandidate, ctx: { source: Source; author: Person; owner: Person; timeZone: string; now: number }): FollowUp {
  return {
    id: followUpId(ctx.source, c.fingerprint),
    fingerprint: c.fingerprint,
    action: c.action,
    quote: c.quote,
    owner: ctx.owner,
    author: ctx.author,
    confidence: c.confidence,
    due: c.due ? { ...c.due, at: endOfDayInZone(c.due.day, ctx.timeZone) } : null,
    source: ctx.source,
    status: 'open',
    createdAt: ctx.now,
    updatedAt: ctx.now,
    nudges: [],
    history: [{ at: ctx.now, what: 'Promise found' }],
  };
}

const MAX_HISTORY = 20;
export function withEvent(f: FollowUp, patch: Partial<FollowUp>, what: string, now: number): FollowUp {
  return { ...f, ...patch, updatedAt: now, history: [...f.history, { at: now, what }].slice(-MAX_HISTORY) };
}

/** Re-detected text keeps the record and its status; only wording and date move. */
export function refresh(prev: FollowUp, next: FollowUp, now: number): FollowUp {
  // Unchanged text keeps its date: a later edit elsewhere or a hand-set deadline must not move it.
  if (prev.quote === next.quote && prev.due?.phrase === next.due?.phrase) return prev;
  const dueMoved = prev.due?.day !== next.due?.day;
  return withEvent(prev, { quote: next.quote, action: next.action, due: next.due, nudges: dueMoved ? [] : prev.nudges }, dueMoved ? `Due date changed to ${next.due?.day ?? 'none'}` : 'Wording updated', now);
}

export type Timing = 'overdue' | 'today' | 'soon' | 'later' | 'undated';

export function timing(f: Pick<FollowUp, 'due'>, now: number): Timing {
  if (!f.due) return 'undated';
  const left = f.due.at - now;
  if (left < 0) return 'overdue';
  if (left < DAY) return 'today';
  if (left < 3 * DAY) return 'soon';
  return 'later';
}

/** Which reminder is owed now, if any: one a day before the deadline, one after it passes. */
export function nudgeDue(f: FollowUp, now: number): Nudge | null {
  if ((f.status !== 'open' && f.status !== 'slipping') || !f.due) return null;
  const left = f.due.at - now;
  if (left < 0) return f.nudges.includes('overdue') || -left > 7 * DAY ? null : 'overdue';
  if (left < DAY && !f.nudges.includes('before') && now - f.createdAt > 60 * 60_000) return 'before';
  return null;
}

export interface Stats {
  open: number;
  overdue: number;
  dueThisWeek: number;
  kept: number;
  dropped: number;
  /** Kept share of closed promises with a date, 0..100, or null with none closed. */
  keptOnTime: number | null;
}

export function stats(all: FollowUp[], now: number): Stats {
  const live = all.filter((f) => f.status === 'open' || f.status === 'slipping');
  const kept = all.filter((f) => f.status === 'kept');
  const closedDated = all.filter((f) => (f.status === 'kept' || f.status === 'dropped') && f.due);
  const onTime = closedDated.filter((f) => f.status === 'kept' && f.due && keptAt(f) <= f.due.at).length;
  return {
    open: live.length,
    overdue: live.filter((f) => timing(f, now) === 'overdue').length,
    dueThisWeek: live.filter((f) => f.due && f.due.at >= now && f.due.at - now < 7 * DAY).length,
    kept: kept.length,
    dropped: all.filter((f) => f.status === 'dropped').length,
    keptOnTime: closedDated.length ? Math.round((onTime / closedDated.length) * 100) : null,
  };
}

function keptAt(f: FollowUp): number {
  for (let i = f.history.length - 1; i >= 0; i--) if (f.history[i]?.what.startsWith('Kept')) return f.history[i]?.at ?? f.updatedAt;
  return f.updatedAt;
}

/** Live first by deadline, then undated, then closed most recent first. */
export function sortForLedger(all: FollowUp[]): FollowUp[] {
  const rank = (f: FollowUp): number => (f.status === 'open' || f.status === 'slipping' ? (f.due ? 0 : 1) : 2);
  return [...all].sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? (a.due?.at ?? 0) - (b.due?.at ?? 0) : b.updatedAt - a.updatedAt));
}
