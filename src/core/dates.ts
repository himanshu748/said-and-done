/** Deterministic due-date parsing. Dates are calendar days ("YYYY-MM-DD") in the writer's time zone. */

export interface DueDate {
  /** Calendar day the promise is due, in the writer's time zone. */
  day: string;
  /** The words the date came from, e.g. "by Friday". */
  phrase: string;
  precision: 'day' | 'week' | 'month';
}

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, couple: 2, 'a couple of': 2, few: 3, 'a few': 3 };

const pad = (n: number): string => String(n).padStart(2, '0');
export const formatYmd = (v: Ymd): string => `${v.y}-${pad(v.m)}-${pad(v.d)}`;

export function parseYmd(day: string): Ymd {
  const [y, m, d] = day.split('-').map(Number);
  return { y: y ?? 0, m: m ?? 0, d: d ?? 0 };
}

function toUtc(v: Ymd): Date {
  return new Date(Date.UTC(v.y, v.m - 1, v.d));
}

function fromUtc(t: Date): Ymd {
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function addDays(v: Ymd, n: number): Ymd {
  const t = toUtc(v);
  t.setUTCDate(t.getUTCDate() + n);
  return fromUtc(t);
}

export const weekday = (v: Ymd): number => toUtc(v).getUTCDay();
const lastDayOfMonth = (y: number, m: number): Ymd => fromUtc(new Date(Date.UTC(y, m, 0)));
export const compareYmd = (a: Ymd, b: Ymd): number => toUtc(a).getTime() - toUtc(b).getTime();

function validDate({ y, m, d }: Ymd): boolean {
  return y > 0 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= lastDayOfMonth(y, m).d;
}

export function isCalendarDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && validDate(parseYmd(day));
}

/** Business days after `v` (Mon-Fri). */
export function addBusinessDays(v: Ymd, n: number): Ymd {
  let cur = v;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    const wd = weekday(cur);
    if (wd !== 0 && wd !== 6) left--;
  }
  return cur;
}

/** Calendar day of an instant in a time zone. Unknown zones fall back to UTC. */
export function dayInZone(at: Date, timeZone: string): Ymd {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  return parseYmd(fmt.format(at));
}

/** The instant a calendar day ends (23:59:59.999 local) in a time zone. */
export function endOfDayInZone(day: string, timeZone: string): number {
  const v = parseYmd(day);
  const naive = Date.UTC(v.y, v.m - 1, v.d, 23, 59, 59, 999);
  // Offset of the zone at that wall time, found by formatting the naive instant back in the zone.
  const offsetAt = (t: number): number => {
    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(t));
    } catch {
      return 0;
    }
    const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'), 999) - t;
  };
  const first = naive - offsetAt(naive);
  return naive - offsetAt(first);
}

function nextWeekday(today: Ymd, target: number, allowToday: boolean): Ymd {
  const diff = (target - weekday(today) + 7) % 7;
  return addDays(today, diff === 0 && !allowToday ? 7 : diff);
}

/** Friday of the week containing `v` (weeks start Monday). */
function fridayOf(v: Ymd): Ymd {
  const wd = weekday(v);
  const mondayOffset = wd === 0 ? -6 : 1 - wd;
  return addDays(v, mondayOffset + 4);
}

function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, '');
  return MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w) && (w !== 'sept' || m === 'september')));
}

/** A day-month without a year: this year, or next year if that day has clearly passed. */
function resolveDayMonth(today: Ymd, month: number, day: number): Ymd | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const sameYear = { y: today.y, m: month, d: day };
  // A date up to 7 days back is a late reply ("by Dec 1" written Dec 3), not next year.
  return compareYmd(sameYear, addDays(today, -7)) < 0 ? { y: today.y + 1, m: month, d: day } : sameYear;
}

const WD = '(sun(?=day)|mon|tue|tues|wed(?=nesday)|thu|thur|thurs|fri|sat(?=urday))(?:day|nesday|sday|urday)?';
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const ORD = '(\\d{1,2})(?:st|nd|rd|th)?';
const LEAD = '(?:(?:by|before|on|until|till|due|no later than|ahead of|for)\\s+)?';

interface Rule {
  re: RegExp;
  resolve: (m: RegExpExecArray, today: Ymd) => { day: Ymd; precision: DueDate['precision'] } | null;
}

const wdIndex = (w: string): number => WEEKDAYS.findIndex((d) => d.startsWith(w.toLowerCase().slice(0, 3)));

const RULES: Rule[] = [
  // ISO 2026-12-12
  { re: new RegExp(`\\b${LEAD}(\\d{4})-(\\d{2})-(\\d{2})\\b`, 'i'), resolve: (m) => {
    const v = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
    return v.m >= 1 && v.m <= 12 && v.d >= 1 && v.d <= lastDayOfMonth(v.y, v.m).d ? { day: v, precision: 'day' } : null;
  } },
  // Dec 12 / December 12th, 2026
  { re: new RegExp(`\\b${LEAD}${MON}\\s+${ORD}(?:,?\\s+(\\d{4}))?\\b`, 'i'), resolve: (m, today) => {
    const month = monthIndex(m[1] ?? '') + 1;
    const day = Number(m[2]);
    if (m[3]) return { day: { y: Number(m[3]), m: month, d: day }, precision: 'day' };
    const v = resolveDayMonth(today, month, day);
    return v ? { day: v, precision: 'day' } : null;
  } },
  // 12 Dec / 12th of December
  { re: new RegExp(`\\b${LEAD}(?:the\\s+)?${ORD}\\s+(?:of\\s+)?${MON}(?:,?\\s+(\\d{4}))?\\b`, 'i'), resolve: (m, today) => {
    const month = monthIndex(m[2] ?? '') + 1;
    const day = Number(m[1]);
    if (m[3]) return { day: { y: Number(m[3]), m: month, d: day }, precision: 'day' };
    const v = resolveDayMonth(today, month, day);
    return v ? { day: v, precision: 'day' } : null;
  } },
  // 12/24 or 24/12: only when one side is over 12, so the order is unambiguous.
  { re: new RegExp(`\\b${LEAD}(\\d{1,2})/(\\d{1,2})\\b(?!/)`, 'i'), resolve: (m, today) => {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const pair = a > 12 && b <= 12 ? [b, a] : b > 12 && a <= 12 ? [a, b] : null;
    if (!pair) return null;
    const v = resolveDayMonth(today, pair[0] ?? 0, pair[1] ?? 0);
    return v ? { day: v, precision: 'day' } : null;
  } },
  { re: /\b(?:(?:by|before|until)\s+)?(?:the\s+)?(?:end of (?:the |this )?day|eod|cob|close of business|today|tonight|later today|this (?:afternoon|evening|morning))\b/i, resolve: (_m, today) => ({ day: today, precision: 'day' }) },
  { re: /\b(?:(?:by|before|until)\s+)?(?:end of (?:the )?day )?(?:tomorrow|tmrw|tmr)\b/i, resolve: (_m, today) => ({ day: addDays(today, 1), precision: 'day' }) },
  { re: /\b(?:(?:by|before|until)\s+)?(?:the\s+)?day after tomorrow\b/i, resolve: (_m, today) => ({ day: addDays(today, 2), precision: 'day' }) },
  { re: new RegExp(`\\b(?:(?:by|before|until|on)\\s+)?next\\s+${WD}\\b`, 'i'), resolve: (m, today) => {
    const target = wdIndex(m[1] ?? '');
    // "next Friday" is the Friday of next week.
    const nextMonday = nextWeekday(today, 1, false);
    return { day: nextWeekday(addDays(nextMonday, -1), target, false), precision: 'day' };
  } },
  { re: new RegExp(`\\b${LEAD}(?:this\\s+(?:coming\\s+)?)?${WD}\\b`, 'i'), resolve: (m, today) => ({ day: nextWeekday(today, wdIndex(m[1] ?? ''), true), precision: 'day' }) },
  { re: /\b(?:(?:by|before|until)\s+)?(?:the\s+)?(?:end of (?:the |this )?week|eow|this week)\b/i, resolve: (_m, today) => {
    const fri = fridayOf(today);
    return { day: compareYmd(fri, today) < 0 ? today : fri, precision: 'week' };
  } },
  { re: /\b(?:(?:by|before|until)\s+)?(?:the\s+)?(?:this\s+)?weekend\b/i, resolve: (_m, today) => ({ day: nextWeekday(today, 0, true), precision: 'day' }) },
  { re: /\b(?:(?:by|before|until|for)\s+)?(?:the\s+)?(?:end of )?next week\b/i, resolve: (_m, today) => ({ day: fridayOf(addDays(today, 7)), precision: 'week' }) },
  { re: /\b(?:(?:by|before|until)\s+)?(?:the\s+)?(?:end of (?:the |this )?month|eom|this month)\b/i, resolve: (_m, today) => ({ day: lastDayOfMonth(today.y, today.m), precision: 'month' }) },
  { re: /\b(?:(?:by|before|until)\s+)?(?:the\s+)?(?:end of )?next month\b/i, resolve: (_m, today) => {
    const y = today.m === 12 ? today.y + 1 : today.y;
    const mo = today.m === 12 ? 1 : today.m + 1;
    return { day: lastDayOfMonth(y, mo), precision: 'month' };
  } },
  { re: /\b(?:(?:by|before|until)\s+)?(?:the\s+)?end of (?:q([1-4])|the quarter|this quarter)\b/i, resolve: (m, today) => {
    const q = m[1] ? Number(m[1]) : Math.ceil(today.m / 3);
    let y = today.y;
    if (q * 3 < today.m) y++;
    return { day: lastDayOfMonth(y, q * 3), precision: 'month' };
  } },
  { re: /\b(?:in|within)\s+(\d{1,2}|an?|one|two|three|four|five|six|seven|ten|a couple of|a few)\s+(business\s+|working\s+)?(day|week)s?\b/i, resolve: (m, today) => {
    const raw = (m[1] ?? '').toLowerCase();
    const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw] ?? 0;
    if (n <= 0) return null;
    if (m[2]) return { day: addBusinessDays(today, m[3]?.toLowerCase() === 'week' ? n * 5 : n), precision: 'day' };
    return { day: addDays(today, m[3]?.toLowerCase() === 'week' ? n * 7 : n), precision: m[3]?.toLowerCase() === 'week' ? 'week' : 'day' };
  } },
  // "by the 15th"
  { re: /\b(?:by|before|on|until)\s+the\s+(\d{1,2})(?:st|nd|rd|th)\b/i, resolve: (m, today) => {
    const d = Number(m[1]);
    if (d < 1 || d > 31) return null;
    let y = today.y;
    let mo = today.m;
    if (d < today.d) {
      mo++;
      if (mo > 12) { mo = 1; y++; }
    }
    if (d > lastDayOfMonth(y, mo).d) return null;
    return { day: { y, m: mo, d }, precision: 'day' };
  } },
];

/** Finds the earliest due-date phrase in a sentence, relative to the day it was written. */
export function parseDue(sentence: string, writtenOn: Ymd): DueDate | null {
  let best: { index: number; due: DueDate } | null = null;
  for (const rule of RULES) {
    const m = rule.re.exec(sentence);
    if (!m) continue;
    const r = rule.resolve(m, writtenOn);
    if (!r || !validDate(r.day)) continue;
    if (!best || m.index < best.index) best = { index: m.index, due: { day: formatYmd(r.day), phrase: m[0].trim(), precision: r.precision } };
  }
  return best?.due ?? null;
}
