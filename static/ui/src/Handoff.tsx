import { useRef, useState } from 'react';
import { timing, type FollowUp } from '@core/ledger';

function siteSource(path: string, siteUrl?: string): string | undefined {
  if (!siteUrl) return undefined;
  try {
    const site = new URL(siteUrl);
    const source = new URL(path, site);
    if (site.protocol === 'https:' && source.origin === site.origin) return source.href;
  } catch {
    return undefined;
  }
  return undefined;
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function handoffText(items: FollowUp[], now: number, siteUrl?: string): string {
  const ordered = [...items].sort((a, b) => (a.due?.at ?? Number.MAX_SAFE_INTEGER) - (b.due?.at ?? Number.MAX_SAFE_INTEGER));
  const lines = ordered.map((item) => {
    const due = item.due ? `${timing(item, now) === 'overdue' ? 'overdue' : 'due'} ${item.due.day}` : 'no due date';
    const status = item.status === 'slipping' ? 'slipping, ' : '';
    const title = oneLine(item.source.title);
    const reference = [oneLine(item.source.containerKey), title].filter(Boolean).join(' · ');
    const source = siteSource(item.source.url, siteUrl);
    return `- ${oneLine(item.owner.name)}: ${oneLine(item.action)} (${status}${due})\n  ${[reference, source].filter(Boolean).join(' · ')}`;
  });
  return ['Open follow-ups', '', ...lines].join('\n');
}

export function Handoff({ items, now, siteUrl }: { items: FollowUp[]; now: number; siteUrl: string | undefined }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const text = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const stale = draft !== null && (!items.length || draft !== handoffText(items, now, siteUrl));

  let message = notice;
  if (stale) {
    message = items.length ? 'Refresh the draft to copy the current handoff.' : 'No open promises match your filters.';
  }

  const prepare = () => {
    setDraft(handoffText(items, now, siteUrl));
    setNotice('');
  };

  const close = () => {
    setDraft(null);
    trigger.current?.focus();
  };

  const copy = async () => {
    if (!draft || stale) return;
    try {
      await navigator.clipboard.writeText(draft);
      setNotice('Copied to clipboard.');
    } catch {
      text.current?.focus();
      text.current?.select();
      setNotice('Text selected. Use your device’s copy command.');
    }
  };

  return (
    <section className="handoff" aria-label="Promise handoff">
      <button type="button" ref={trigger} className="btn btn--ghost" onClick={prepare} disabled={!items.length} aria-expanded={draft !== null}>
        {draft ? 'Refresh handoff draft' : 'Prepare handoff'}
      </button>
      {draft && (
        <div className="handoff__draft">
          <label htmlFor="handoff-text">Handoff draft</label>
          <p>Snapshot of the open promises matching your filters when you prepared it.</p>
          <textarea id="handoff-text" ref={text} value={draft} readOnly rows={7} />
          <div className="handoff__actions">
            <button type="button" className="btn btn--primary" onClick={() => void copy()} disabled={stale}>Copy draft</button>
            <button type="button" className="btn btn--ghost" onClick={close}>Close draft</button>
          </div>
          <p role="status">{message}</p>
        </div>
      )}
    </section>
  );
}
