import { afterEach, expect, it, vi } from 'vitest';
import type { FollowUp } from '../src/core/ledger';

const { listFollowUps, getFollowUp, saveFollowUp, addJiraComment } = vi.hoisted(() => ({
  listFollowUps: vi.fn(),
  getFollowUp: vi.fn(),
  saveFollowUp: vi.fn(),
  addJiraComment: vi.fn(),
}));

vi.mock('../src/store', () => ({ listFollowUps, getFollowUp, saveFollowUp }));
vi.mock('../src/site', () => ({ addJiraComment }));
vi.mock('../src/resolver', () => ({ handler: {} }));

const { sendReminders } = await import('../src/index');
const now = Date.UTC(2026, 10, 24, 12);
const person = { accountId: 'acc', name: 'Sam' };
const due = { day: '2026-11-23', phrase: 'by Monday', precision: 'day' as const, at: now - 86_400_000 };
const record: FollowUp = {
  id: 'promise',
  fingerprint: 'promise',
  action: 'send the redlines',
  quote: "I'll send the redlines by Monday",
  owner: person,
  author: person,
  confidence: 'high',
  due,
  source: { product: 'jira', kind: 'comment', containerId: '10001', containerKey: 'LEO-4', title: 'Vendor MSA', itemId: '1', url: 'https://x/browse/LEO-4' },
  status: 'open',
  createdAt: now - 2 * 86_400_000,
  updatedAt: now - 2 * 86_400_000,
  nudges: [],
  history: [],
};

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it.each([
  { ...record, status: 'kept' },
  { ...record, due: { ...due, day: '2026-11-27', at: now + 3 * 86_400_000 } },
  undefined,
])('skips a reminder when its listed snapshot is no longer owed', async (current) => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  listFollowUps.mockResolvedValue([record]);
  getFollowUp.mockResolvedValue(current);

  await sendReminders();

  expect(addJiraComment).not.toHaveBeenCalled();
  expect(saveFollowUp).not.toHaveBeenCalled();
});

it('posts and records a reminder that the current promise still owes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  listFollowUps.mockResolvedValue([record]);
  getFollowUp.mockResolvedValue(record);

  await sendReminders();

  expect(addJiraComment).toHaveBeenCalledOnce();
  expect(saveFollowUp).toHaveBeenCalledWith(expect.objectContaining({ id: 'promise', nudges: ['overdue'] }));
});
