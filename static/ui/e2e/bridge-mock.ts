/**
 * Mock of the parts of @forge/bridge the UI uses, selected by vite.config.e2e.ts.
 * Query: module=jira-ledger (default) | jira-issue-promises | confluence-ledger | confluence-page-promises
 *        empty=1 starts with no promises      theme=dark
 * Calls are recorded on window.__sdCalls and router navigations on window.__sdNav.
 */
import type { FollowUp } from '../../../src/core/ledger';

declare global {
  interface Window {
    __sdCalls?: { name: string; payload: unknown }[];
    __sdNav?: string[];
  }
}

const params = new URLSearchParams(window.location.search);
const moduleKey = params.get('module') ?? 'jira-ledger';
const NOW = Date.UTC(2026, 10, 25, 10);
const day = (d: number) => Date.UTC(2026, 10, 25 + d, 23, 59, 59, 999);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const lead = { accountId: 'a-legal', name: 'Legal lead' };
const design = { accountId: 'a-design', name: 'Design lead' };

function item(id: string, action: string, quote: string, offset: number | null, extra: Partial<FollowUp> = {}): FollowUp {
  return {
    id,
    fingerprint: id,
    action,
    quote,
    owner: lead,
    author: lead,
    confidence: 'high',
    due: offset === null ? null : { day: iso(day(offset)), phrase: 'by Friday', precision: 'day', at: day(offset) },
    source: { product: 'jira', kind: 'comment', containerId: '10001', containerKey: 'LEO-4', title: 'Vendor MSA renewal', itemId: '2000' + id, url: '/browse/LEO-4' },
    status: 'open',
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 86_400_000,
    nudges: [],
    history: [{ at: NOW - 86_400_000, what: 'Promise found' }],
    ...extra,
  };
}

let items: FollowUp[] =
  params.get('empty') === '1'
    ? []
    : [
        item('1', 'send the redlined MSA', "I'll send the redlined MSA by Friday.", -1),
        item('2', 'share the final banner set', 'I will share the final banner set tomorrow', 0, { owner: design, author: design }),
        item('3', 'book the review session', "I'll book the review session next week", 6, { confidence: 'medium' }),
        item('4', 'update the checklist', "I'll update the checklist.", null),
        item('5', 'file the signed NDA', "I'll file the signed NDA by Monday", -3, { status: 'kept', history: [{ at: NOW - 3e8, what: 'Promise found' }, { at: NOW - 2e8, what: 'Kept — Legal lead replied' }] }),
      ];

window.__sdCalls = [];
window.__sdNav = [];

function stats() {
  const live = items.filter((f) => !f.dismissed).filter((f) => f.status === 'open' || f.status === 'slipping');
  return { open: live.length, overdue: live.filter((f) => f.due && f.due.at < NOW).length, dueThisWeek: live.filter((f) => f.due && f.due.at >= NOW && f.due.at - NOW < 7 * 86_400_000).length, kept: items.filter((f) => f.status === 'kept').length, dropped: 0, keptOnTime: 100 };
}

export async function invoke(name: string, payload?: Record<string, unknown>): Promise<unknown> {
  window.__sdCalls?.push({ name, payload });
  await new Promise((r) => setTimeout(r, 30));
  if (name === 'list') return { product: moduleKey.startsWith('confluence') ? 'confluence' : 'jira', now: NOW, viewer: 'a-legal', scoped: !moduleKey.endsWith('ledger'), items, stats: stats() };
  if (name === 'setStatus' || name === 'setDue') {
    const f = items.find((x) => x.id === payload?.['id']);
    if (!f) throw new Error('missing');
    const next: FollowUp =
      name === 'setStatus'
        ? { ...f, status: payload?.['status'] as FollowUp['status'], history: [...f.history, { at: NOW, what: `${String(payload?.['status'])} by Legal lead` }] }
        : { ...f, due: { day: String(payload?.['day']), phrase: 'set by hand', precision: 'day', at: Date.parse(`${String(payload?.['day'])}T23:59:59Z`) } };
    items = items.map((x) => (x.id === f.id ? next : x));
    return next;
  }
  if (name === 'dismiss') {
    const f = items.find((x) => x.id === payload?.['id']);
    if (!f) throw new Error('missing');
    const next: FollowUp = { ...f, dismissed: Boolean(payload?.['dismissed']) };
    items = items.map((x) => (x.id === f.id ? next : x));
    return next;
  }
  if (name === 'scan') {
    items = [...items, item('9', 'send the onboarding pack', "I'll send the onboarding pack by Dec 3", 8)];
    return { scanned: 12, found: 1 };
  }
  throw new Error(`unknown ${name}`);
}

export const view = {
  getContext: async () => ({ moduleKey, extension: {} }),
  theme: {
    enable: async () => {
      document.documentElement.dataset['colorMode'] = params.get('theme') === 'dark' ? 'dark' : 'light';
    },
  },
};

export const router = {
  navigate: async (url: string) => {
    window.__sdNav?.push(url);
  },
};
