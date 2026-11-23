import { describe, expect, it } from 'vitest';
import { dayInZone, endOfDayInZone, parseDue, parseYmd } from '../src/core/dates';

// Written on Tuesday 2026-11-24.
const tue = parseYmd('2026-11-24');
const due = (s: string): string | undefined => parseDue(s, tue)?.day;

describe('parseDue', () => {
  it.each([
    ['send it by Friday', '2026-11-27'],
    ['by Tuesday', '2026-11-24'],
    ['by next Friday', '2026-12-04'],
    ['next Monday', '2026-11-30'],
    ['tomorrow', '2026-11-25'],
    ['by EOD', '2026-11-24'],
    ['by end of week', '2026-11-27'],
    ['next week', '2026-12-04'],
    ['by end of month', '2026-11-30'],
    ['next month', '2026-12-31'],
    ['by Dec 12', '2026-12-12'],
    ['on December 3rd', '2026-12-03'],
    ['by 12th of December', '2026-12-12'],
    ['on 2027-01-05', '2027-01-05'],
    ['by Jan 5', '2027-01-05'],
    ['by Nov 20', '2026-11-20'],
    ['in 3 days', '2026-11-27'],
    ['within two weeks', '2026-12-08'],
    ['in 2 business days', '2026-11-26'],
    ['by the 15th', '2026-12-15'],
    ['by the 30th', '2026-11-30'],
    ['by 12/24', '2026-12-24'],
    ['by end of Q1', '2027-03-31'],
    ['this weekend', '2026-11-29'],
  ])('%s -> %s', (text, day) => {
    expect(due(text)).toBe(day);
  });

  it.each(['soon', 'when I can', 'after the launch', 'by 3/4', 'I sat down with legal', 'monitor the queue'])('no date in "%s"', (text) => {
    expect(parseDue(text, tue)).toBeNull();
  });

  it('takes the earliest phrase and reports it', () => {
    expect(parseDue("I'll send it Friday, or Monday at the latest", tue)).toMatchObject({ day: '2026-11-27', phrase: 'Friday' });
  });

  it('marks week and month precision', () => {
    expect(parseDue('next week', tue)?.precision).toBe('week');
    expect(parseDue('end of month', tue)?.precision).toBe('month');
  });
});

describe('time zones', () => {
  it('uses the calendar day in the writer zone', () => {
    const at = new Date('2026-11-24T22:30:00Z');
    expect(dayInZone(at, 'Asia/Kolkata')).toEqual({ y: 2026, m: 11, d: 25 });
    expect(dayInZone(at, 'America/Los_Angeles')).toEqual({ y: 2026, m: 11, d: 24 });
    expect(dayInZone(at, 'Not/AZone')).toEqual({ y: 2026, m: 11, d: 24 });
  });

  it('ends the day at local midnight', () => {
    expect(new Date(endOfDayInZone('2026-11-27', 'UTC')).toISOString()).toBe('2026-11-27T23:59:59.999Z');
    expect(new Date(endOfDayInZone('2026-11-27', 'Asia/Kolkata')).toISOString()).toBe('2026-11-27T18:29:59.999Z');
    expect(new Date(endOfDayInZone('2026-07-01', 'America/New_York')).toISOString()).toBe('2026-07-02T03:59:59.999Z');
  });
});
