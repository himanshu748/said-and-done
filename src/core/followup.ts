/** Reads later replies: did the owner say it is done, or that it is slipping? */
import { normalizeAction } from './detect';

export type Signal = 'done' | 'slipping';

const DONE = /\b(done|sent|shared|attached|uploaded|published|merged|shipped|submitted|delivered|completed|finished|signed|booked|scheduled|posted|fixed|resolved|here(?:'s| is| you go| it is)|just (?:sent|shared|added|updated))\b/i;
const NEGATED = /(?:\b(?:not|yet to|still|almost|nearly|once|when|after|will be|will|going to)|n['’]t|['’]ll)\b[\w\s,'’]{0,24}$/i;
const SLIPPING = /\b(running (?:a bit )?late|need (?:a bit |a little |some )?more time|push(?:ing)? (?:this|it) (?:back|out)|delayed|won['’]t make|can['’]t make|will be late|slipping|behind on|another (?:day|week) or two)\b/i;

export function readSignal(text: string): Signal | null {
  if (/\?\s*$/.test(text.trim())) return null;
  const s = SLIPPING.exec(text);
  if (s && !/(?:\bnot|n['’]t)\b[\w\s,'’]{0,12}$/i.test(text.slice(0, s.index))) return 'slipping';
  const m = DONE.exec(text);
  if (!m) return null;
  if (NEGATED.test(text.slice(0, m.index))) return null;
  return 'done';
}

const STOP = new Set('the a an to and or of for on in by with it this that you your i we our will be is me my get have send share up over back out'.split(' '));

function words(s: string): Set<string> {
  return new Set(normalizeAction(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
}

/** How much two texts are about the same thing, 0..1 (share of the promise's words found in the reply). */
export function overlap(promiseAction: string, reply: string): number {
  const a = words(promiseAction);
  if (!a.size) return 0;
  const b = words(reply);
  let hit = 0;
  for (const w of a) if (b.has(w) || [...b].some((x) => x.length > 4 && w.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))) hit++;
  return hit / a.size;
}

/** Which open promise a reply refers to: the best word match, else the only one, else the oldest. */
export function pickPromise<T extends { action: string; createdAt: number }>(open: T[], reply: string): T | null {
  if (!open.length) return null;
  const scored = open.map((p) => ({ p, s: overlap(p.action, reply) })).sort((x, y) => y.s - x.s || x.p.createdAt - y.p.createdAt);
  const top = scored[0];
  if (top && top.s > 0) return top.p;
  return [...open].sort((x, y) => x.createdAt - y.createdAt)[0] ?? null;
}
