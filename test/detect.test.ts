import { describe, expect, it } from 'vitest';
import { adfToBlocks, textToBlocks } from '../src/core/adf';
import { parseYmd } from '../src/core/dates';
import { detectPromises } from '../src/core/detect';

const tue = parseYmd('2026-11-24');
const find = (text: string) => detectPromises(textToBlocks(text), tue);

describe('first-person promises', () => {
  it.each([
    ["I'll send the revised contract by Friday.", 'send the revised contract', '2026-11-27'],
    ['I will share the pricing deck tomorrow', 'share the pricing deck', '2026-11-25'],
    ["I'm going to update the onboarding checklist by Dec 3", 'update the onboarding checklist', '2026-12-03'],
    ['Thanks! I’ll get back to you on the vendor terms next week.', 'get back to you on the vendor terms', '2026-12-04'],
    ["We'll publish the launch post by end of week", 'publish the launch post', '2026-11-27'],
    ['Will do by EOD', 'Will do', '2026-11-24'],
  ])('%s', (text, action, day) => {
    const [p] = find(text);
    expect(p?.action).toBe(action);
    expect(p?.due?.day).toBe(day);
    expect(p?.owner).toEqual({ kind: 'author' });
  });

  it('keeps a dated-less promise with a clear action', () => {
    const [p] = find("I'll send over the signed NDA.");
    expect(p).toMatchObject({ action: 'send over the signed NDA', due: null, confidence: 'high' });
  });

  it('marks hedged and collective promises as medium', () => {
    expect(find("I'll try to review the brief by Thursday")[0]?.confidence).toBe('medium');
    expect(find("We'll ship the newsletter tomorrow")[0]?.confidence).toBe('medium');
  });

  it.each([
    "I'll be out of office until Monday.",
    'Will you send the contract by Friday?',
    'Let me know if you need anything.',
    "I'll think about it.",
    'We will see.',
    "You said I'll send it by Friday",
    "I'll never sign that.",
    'The contract was sent on Friday.',
    "We'll need legal to look at this.",
    'Will do.',
  ])('ignores "%s"', (text) => {
    expect(find(text)).toEqual([]);
  });

  it('finds several promises in one comment, once each', () => {
    const ps = find("I'll draft the press release by Monday. Then I'll book the venue next week. I'll draft the press release by Monday.");
    expect(ps.map((p) => p.action)).toEqual(['draft the press release', 'book the venue']);
  });
});

const mention = (id: string, text: string) => ({ type: 'mention', attrs: { id, text } });
const t = (text: string) => ({ type: 'text', text });

describe('ADF', () => {
  it('assigns promises to mentioned people', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [t('Agreed. '), mention('acc-1', '@Ana Diaz'), t(' to review the vendor MSA by Dec 12.')] }] };
    const [p] = detectPromises(adfToBlocks(doc), tue);
    expect(p).toMatchObject({ owner: { kind: 'mention', accountId: 'acc-1', name: 'Ana Diaz' }, action: 'review the vendor MSA', due: { day: '2026-12-12' } });
  });

  it('does not treat a question to a person as their promise', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [mention('acc-1', '@Ana'), t(' will you send it by Friday?')] }] };
    expect(detectPromises(adfToBlocks(doc), tue)).toEqual([]);
  });

  it('reads open action items with assignee and date', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { localId: 't1', state: 'TODO' }, content: [mention('acc-2', '@Lee'), t(' send survey results '), { type: 'date', attrs: { timestamp: String(Date.UTC(2026, 11, 2)) } }] },
          { type: 'taskItem', attrs: { localId: 't2', state: 'DONE' }, content: [mention('acc-2', '@Lee'), t(' book the room')] },
        ] },
      ],
    };
    const ps = detectPromises(adfToBlocks(doc), tue);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ owner: { accountId: 'acc-2' }, action: 'send survey results', due: { day: '2026-12-02' } });
  });

  it('skips code blocks and inline code', () => {
    const doc = { type: 'doc', content: [{ type: 'codeBlock', content: [t("I'll send it tomorrow")] }, { type: 'paragraph', content: [{ type: 'text', text: "I'll send it tomorrow", marks: [{ type: 'code' }] }] }] };
    expect(detectPromises(adfToBlocks(doc), tue)).toEqual([]);
  });

  it('keeps hard breaks as separate lines', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [t('Notes'), { type: 'hardBreak' }, t("I'll email the vendor by Monday")] }] };
    expect(detectPromises(adfToBlocks(doc), tue)[0]?.action).toBe('email the vendor');
  });
});
