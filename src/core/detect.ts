/** Finds commitments in text: "I'll send the revised contract by Friday", "@Ana to review the deck by Dec 12". */
import type { Block } from './adf';
import { parseDue, type DueDate, type Ymd } from './dates';

export type Owner = { kind: 'author' } | { kind: 'mention'; accountId: string; name: string };

export interface PromiseCandidate {
  quote: string;
  action: string;
  owner: Owner;
  due: DueDate | null;
  confidence: 'high' | 'medium';
  /** Stable id of the promise inside its source: owner + action. */
  fingerprint: string;
}

const APOS = "['’]";
const FIRST_PERSON = new RegExp(
  `\\b(i\\s*${APOS}?ll|i will|i\\s*(?:am|${APOS}m) going to|i\\s*${APOS}m gonna|i promise to|i commit to|i can (?=have|get|send|share|do|finish|deliver)|let me|we\\s*${APOS}ll|we will|we\\s*(?:are|${APOS}re) going to|will do|on it)\\b\\s*(.*)$`,
  'i',
);
const HEDGE = /\b(try to|try and|maybe|might|probably|hopefully|if (?:i|we) (?:can|get|have))\b/i;
const NOT_AN_ACTION = /^(?:be\s+(?!\w+ing\b)|not\b|never\b|know\b|see if\b|think\b|need\b|assume\b|let you know if\b)/i;
const REPORTED = /\b(?:said|says|thought|think|told \w+|if|when|whether|unless)\s*(?:that\s*)?$/i;
const MENTION_COMMIT = /^\s*(?:will|to|is going to|['’]ll|has agreed to|agreed to|promised to|owns|is on)\b\s*(.*)$/i;
const STRONG_VERB = /^(?:also\s+|definitely\s+|personally\s+)?(send|share|review|update|draft|write|finish|deliver|submit|sign|prepare|follow up|get back|circle back|book|schedule|set up|create|fix|publish|upload|confirm|check|reach out|call|email|post|add|ship|finalize|finalise|file|approve|send over|put together|have|get)\b/i;

const pad = (n: number): string => String(n).padStart(2, '0');

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function normalizeAction(action: string): string {
  return action.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=["'(@A-Z0-9])|\s+[-–•]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function cleanAction(rest: string, due: DueDate | null): string {
  let a = rest;
  if (due) a = a.replace(due.phrase, ' ');
  a = a
    .replace(/\s+/g, ' ')
    .replace(/\s*[,;:–-]\s*$/, '')
    .replace(/[.!?…]+\s*$/, '')
    .replace(/\s+(?:at the latest|latest|at the very latest|for sure|asap)$/i, '')
    .trim();
  return a.length > 140 ? `${a.slice(0, 137).trimEnd()}…` : a;
}

function ownerKey(o: Owner): string {
  return o.kind === 'author' ? 'author' : o.accountId;
}

function candidate(quote: string, rest: string, owner: Owner, writtenOn: Ymd, confidence: PromiseCandidate['confidence'], fixedDue?: string): PromiseCandidate | null {
  const parsed = parseDue(rest, writtenOn) ?? parseDue(quote, writtenOn);
  const due: DueDate | null = fixedDue ? { day: fixedDue, phrase: fixedDue, precision: 'day' } : parsed;
  const action = cleanAction(rest, fixedDue ? parsed : due);
  if (normalizeAction(action).split(' ').length < 2) return null;
  return {
    quote: quote.length > 280 ? `${quote.slice(0, 277).trimEnd()}…` : quote,
    action,
    owner,
    due,
    confidence,
    fingerprint: fnv1a(`${ownerKey(owner)}|${normalizeAction(action)}`),
  };
}

function fromSentence(sentence: string, block: Block, blockOffset: number, writtenOn: Ymd): PromiseCandidate[] {
  const out: PromiseCandidate[] = [];
  const isQuestion = /\?\s*$/.test(sentence);

  // Mentioned owner: "@Ana will send…", "@Ana to review…"
  for (const m of block.mentions) {
    const start = m.start - blockOffset;
    const end = m.end - blockOffset;
    if (start < 0 || end > sentence.length || !m.accountId) continue;
    const after = MENTION_COMMIT.exec(sentence.slice(end));
    if (!after || isQuestion) continue;
    const c = candidate(sentence, after[1] ?? '', { kind: 'mention', accountId: m.accountId, name: m.name }, writtenOn, 'high');
    if (c) out.push(c);
  }
  if (out.length) return out;

  const fp = FIRST_PERSON.exec(sentence);
  if (!fp || isQuestion) return out;
  const lead = (fp[1] ?? '').toLowerCase().replace(/\s+/g, ' ');
  const rest = fp[2] ?? '';
  if (REPORTED.test(sentence.slice(0, fp.index))) return out;
  if (NOT_AN_ACTION.test(rest)) return out;
  const due = parseDue(sentence, writtenOn);
  const collective = lead.startsWith('we');
  const ack = lead === 'will do' || lead === 'on it';
  // Weak leads only count with a date: "we'll ship by Friday", "will do by EOD", "let me check by Monday".
  if ((collective || ack || lead === 'let me') && !due) return out;
  if (!due && !STRONG_VERB.test(rest)) return out;
  const hedged = HEDGE.test(sentence);
  const c = candidate(sentence, ack ? sentence : rest, { kind: 'author' }, writtenOn, hedged || collective || ack ? 'medium' : 'high');
  if (c) out.push(c);
  return out;
}

/** All promises in a document. `writtenOn` is the day it was written, in the writer's time zone. */
export function detectPromises(blocks: Block[], writtenOn: Ymd): PromiseCandidate[] {
  const found = new Map<string, PromiseCandidate>();
  for (const block of blocks) {
    if (block.task) {
      if (block.task.state === 'DONE') continue;
      const assignee = block.mentions[0];
      let rest = block.text;
      for (const m of [...block.mentions].reverse()) rest = rest.slice(0, m.start) + rest.slice(m.end);
      for (const d of block.dates) rest = rest.replace(d, ' ');
      rest = rest.replace(/^\s*(?:to|will)\s+/i, '').replace(/\s+(?:by|on|due)\s*$/i, '');
      const owner: Owner = assignee?.accountId ? { kind: 'mention', accountId: assignee.accountId, name: assignee.name } : { kind: 'author' };
      if (owner.kind === 'author' && !block.dates.length && !parseDue(block.text, writtenOn)) continue;
      const c = candidate(block.text.trim(), rest, owner, writtenOn, 'high', block.dates[0]);
      if (c && !found.has(c.fingerprint)) found.set(c.fingerprint, c);
      continue;
    }
    let offset = 0;
    for (const sentence of splitSentences(block.text)) {
      const at = block.text.indexOf(sentence, offset);
      if (at >= 0) offset = at;
      for (const c of fromSentence(sentence, block, offset, writtenOn)) if (!found.has(c.fingerprint)) found.set(c.fingerprint, c);
      offset += sentence.length;
    }
  }
  return [...found.values()];
}

export const ymdKey = (v: Ymd): string => `${v.y}-${pad(v.m)}-${pad(v.d)}`;
