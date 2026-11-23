/** Turns Atlassian Document Format into plain text blocks that keep mentions and date nodes. */

export interface Mention {
  accountId: string;
  name: string;
  /** Offsets of "@Name" in the block text. */
  start: number;
  end: number;
}

export interface Block {
  text: string;
  mentions: Mention[];
  /** Set for Confluence/Jira action items (taskItem). */
  task?: { state: 'TODO' | 'DONE'; localId: string };
  /** Calendar days from date nodes ("YYYY-MM-DD", UTC). */
  dates: string[];
}

export interface AdfNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'decisionItem', 'panel', 'tableCell', 'tableHeader']);

export function adfToBlocks(doc: unknown): Block[] {
  const blocks: Block[] = [];
  let cur: Block | null = null;

  const open = (): Block => {
    cur ??= { text: '', mentions: [], dates: [] };
    return cur;
  };
  const close = (): void => {
    if (cur && cur.text.trim()) blocks.push({ ...cur, text: cur.text.replace(/[ \t]+/g, ' ') });
    cur = null;
  };

  const walk = (node: AdfNode, inCode: boolean): void => {
    if (!node || typeof node !== 'object') return;
    const type = node.type ?? '';
    if (type === 'codeBlock' || type === 'inlineCard' || type === 'mediaSingle' || type === 'media') return;
    if (type === 'taskItem') {
      close();
      const b = open();
      b.task = { state: node.attrs?.['state'] === 'DONE' ? 'DONE' : 'TODO', localId: String(node.attrs?.['localId'] ?? '') };
      node.content?.forEach((c) => walk(c, inCode));
      close();
      return;
    }
    if (type === 'text') {
      const marks = (node as { marks?: { type: string }[] }).marks ?? [];
      if (!marks.some((m) => m.type === 'code')) open().text += node.text ?? '';
      return;
    }
    if (type === 'hardBreak') {
      close();
      return;
    }
    if (type === 'mention') {
      const b = open();
      const raw = String(node.attrs?.['text'] ?? '@someone');
      const label = raw.startsWith('@') ? raw : `@${raw}`;
      const start = b.text.length;
      b.text += label;
      b.mentions.push({ accountId: String(node.attrs?.['id'] ?? ''), name: label.slice(1), start, end: b.text.length });
      return;
    }
    if (type === 'date') {
      const ts = Number(node.attrs?.['timestamp']);
      if (Number.isFinite(ts)) {
        const day = new Date(ts).toISOString().slice(0, 10);
        const b = open();
        b.dates.push(day);
        b.text += day;
      }
      return;
    }
    if (type === 'emoji') {
      open().text += String(node.attrs?.['text'] ?? '');
      return;
    }
    const isBlock = BLOCK_TYPES.has(type) || type === 'listItem';
    if (isBlock) close();
    node.content?.forEach((c) => walk(c, inCode));
    if (isBlock) close();
  };

  walk(doc as AdfNode, false);
  close();
  return blocks;
}

/** Plain-text blocks from a string (used for tests and plain comments). */
export function textToBlocks(text: string): Block[] {
  return text
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ text: t, mentions: [], dates: [] }));
}
