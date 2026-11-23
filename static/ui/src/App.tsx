import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { timing, type FollowUp, type Stats, type Status, type Timing } from '@core/ledger';
import { formatDay } from '@core/reminder';
import { dismiss, getContext, loadLedger, open, scan, setDue, setStatus, type Ledger } from './bridge';

type Filter = 'live' | 'mine' | 'overdue' | 'kept' | 'dropped' | 'all';

const GROUPS: { key: Timing; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due in the next day' },
  { key: 'soon', label: 'Next three days' },
  { key: 'later', label: 'Later' },
  { key: 'undated', label: 'No date given' },
];

const live = (f: FollowUp) => f.status === 'open' || f.status === 'slipping';
const counted = (items: FollowUp[]) => items.filter((f) => !f.dismissed);

export function App() {
  const [mode, setMode] = useState<'ledger' | 'panel' | null>(null);
  const [data, setData] = useState<Ledger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  // Hidden here keep their Undo row until the page is left; the rest stay out of sight.
  const [undoable, setUndoable] = useState<ReadonlySet<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      setData(await loadLedger());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void getContext().then((c) => {
      setMode(c.moduleKey.endsWith('ledger') ? 'ledger' : 'panel');
      void refresh();
    });
  }, [refresh]);

  const onScan = async () => {
    setScanning('Reading the last 30 days…');
    try {
      const r = await scan();
      setScanning(r.found ? `Read ${r.scanned} ${r.scanned === 1 ? 'item' : 'items'}, found ${r.found} new ${r.found === 1 ? 'promise' : 'promises'}.` : `Read ${r.scanned} ${r.scanned === 1 ? 'item' : 'items'}. No new promises.`);
      await refresh();
    } catch (e) {
      setScanning(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const replace = (f: FollowUp) => {
    if (f.dismissed) setUndoable((u) => new Set(u).add(f.id));
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === f.id ? f : x)) } : d));
  };
  const shownData = useMemo(() => (data ? { ...data, items: data.items.filter((f) => !f.dismissed || undoable.has(f.id)) } : null), [data, undoable]);

  if (error && !data) return <div className="shell"><p className="notice notice--error" role="alert">{error}</p></div>;
  if (!shownData || !mode) return <Loading />;
  return mode === 'ledger' ? (
    <LedgerView data={shownData} onChange={replace} onScan={onScan} scanning={scanning} error={error} />
  ) : (
    <PanelView data={shownData} onChange={replace} />
  );
}

function Loading() {
  return (
    <div className="shell" aria-busy="true">
      <div className="skeleton skeleton--title" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

function LedgerView({ data, onChange, onScan, scanning, error }: { data: Ledger; onChange: (f: FollowUp) => void; onScan: () => void; scanning: string | null; error: string | null }) {
  const [filter, setFilter] = useState<Filter>('live');
  const [query, setQuery] = useState('');
  const now = data.now;
  const s = useMemo(() => recount(data.items, now, data.stats), [data, now]);
  const where = data.product === 'jira' ? 'Jira comments' : 'Confluence pages and comments';

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.items.filter((f) => {
      if (filter === 'live' && !live(f)) return false;
      if (filter === 'mine' && !(live(f) && f.owner.accountId === data.viewer)) return false;
      if (filter === 'overdue' && !(live(f) && timing(f, now) === 'overdue')) return false;
      if (filter === 'kept' && f.status !== 'kept') return false;
      if (filter === 'dropped' && f.status !== 'dropped') return false;
      if (!q) return true;
      return [f.action, f.quote, f.owner.name, f.source.containerKey, f.source.title].some((x) => x.toLowerCase().includes(q));
    });
  }, [data.items, data.viewer, filter, query, now]);

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: 'live', label: 'Open', n: s.open },
    ...(data.viewer ? [{ key: 'mine' as const, label: 'Mine', n: counted(data.items).filter((f) => live(f) && f.owner.accountId === data.viewer).length }] : []),
    { key: 'overdue', label: 'Overdue', n: s.overdue },
    { key: 'kept', label: 'Kept', n: s.kept },
    { key: 'dropped', label: 'Dropped', n: s.dropped },
    { key: 'all', label: 'All', n: counted(data.items).length },
  ];

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero__text">
          <p className="eyebrow">Said <Amp /> Done</p>
          <h1 className="hero__title">
            Every “I’ll do it by Friday”
            <br />
            <span className="hero__title-em">kept track of.</span>
          </h1>
          <p className="hero__lede">Promises written in {where} become follow-ups with an owner and a date. Reminders land in the same thread a day before.</p>
        </div>
        <div className="hero__actions">
          <button className="btn btn--primary" type="button" onClick={onScan} disabled={scanning === 'Reading the last 30 days…'}>
            <span className="btn__dot" aria-hidden="true" />
            Scan last 30 days
          </button>
          <p className="hero__status" role="status" aria-live="polite">{scanning ?? '\u00a0'}</p>
        </div>
      </header>

      {error && <p className="notice notice--error" role="alert">{error}</p>}

      <section className="stats" aria-label="Summary">
        <StatTile label="Open" value={s.open} tone="ink" i={0} />
        <StatTile label="Due this week" value={s.dueThisWeek} tone="amber" i={1} />
        <StatTile label="Overdue" value={s.overdue} tone="red" i={2} />
        <KeptRing pct={s.keptOnTime} kept={s.kept} i={3} />
      </section>

      {data.items.length === 0 ? (
        <Empty product={data.product} onScan={onScan} />
      ) : (
        <>
          <div className="toolbar">
            <div className="tabs" role="tablist" aria-label="Filter promises">
              {tabs.map((t) => (
                <button key={t.key} role="tab" type="button" aria-selected={filter === t.key} className="tab" onClick={() => setFilter(t.key)}>
                  {t.label}
                  <span className="tab__n">{t.n}</span>
                </button>
              ))}
            </div>
            <label className="search">
              <span className="sr-only">Search promises</span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
              <input type="search" placeholder="Search people, issues, words" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          <Timeline items={shown} now={now} onChange={onChange} grouped={filter === 'live' || filter === 'mine' || filter === 'overdue'} />
        </>
      )}
      <footer className="foot">Detection runs inside your Atlassian site. No text leaves it.</footer>
    </div>
  );
}

function recount(all: FollowUp[], now: number, server: Stats): Stats {
  const items = counted(all);
  const l = items.filter(live);
  return { ...server, open: l.length, overdue: l.filter((f) => timing(f, now) === 'overdue').length, kept: items.filter((f) => f.status === 'kept').length, dropped: items.filter((f) => f.status === 'dropped').length };
}

function PanelView({ data, onChange }: { data: Ledger; onChange: (f: FollowUp) => void }) {
  const items = counted(data.items);
  const open = items.filter(live).length;
  const where = data.product === 'jira' ? 'issue' : 'page';
  return (
    <div className="shell shell--panel">
      <p className="panel__head">
        <strong>{open}</strong> open {open === 1 ? 'promise' : 'promises'} on this {where}
        {items.length > open && <span className="panel__sub"> · {items.length - open} settled</span>}
      </p>
      {data.items.length === 0 ? (
        <p className="panel__empty">
          Nothing promised here yet. Write something like <q>I’ll send the summary by Friday</q> or <q>@name to review by Dec 12</q> in a {data.product === 'jira' ? 'comment' : 'page or comment'}.
        </p>
      ) : (
        <Timeline items={data.items} now={data.now} onChange={onChange} grouped={false} compact />
      )}
    </div>
  );
}

function Timeline({ items, now, onChange, grouped, compact = false }: { items: FollowUp[]; now: number; onChange: (f: FollowUp) => void; grouped: boolean; compact?: boolean }) {
  if (!items.length) return <p className="none">Nothing here.</p>;
  if (!grouped) return <ol className="list">{items.map((f, i) => <Card key={f.id} f={f} now={now} i={i} onChange={onChange} compact={compact} />)}</ol>;
  let i = 0;
  return (
    <div className="groups">
      {GROUPS.map((g) => {
        const part = items.filter((f) => live(f) && timing(f, now) === g.key);
        if (!part.length) return null;
        return (
          <section key={g.key} className={`group group--${g.key}`} aria-label={g.label}>
            <h2 className="group__title">
              <span className="group__mark" aria-hidden="true" />
              {g.label}
              <span className="group__n">{part.length}</span>
            </h2>
            <ol className="list">{part.map((f) => <Card key={f.id} f={f} now={now} i={i++} onChange={onChange} compact={compact} />)}</ol>
          </section>
        );
      })}
    </div>
  );
}

const STATUS_TEXT: Record<Status, string> = { open: 'Open', slipping: 'Slipping', kept: 'Kept', dropped: 'Dropped' };

function relative(due: number, now: number): string {
  const d = Math.round((due - now) / 86_400_000);
  if (due < now) return `${Math.max(1, Math.ceil((now - due) / 86_400_000))}d late`;
  if (d === 0) return 'due today';
  if (d === 1) return 'tomorrow';
  return `in ${d} days`;
}

function Card({ f, now, i, onChange, compact }: { f: FollowUp; now: number; i: number; onChange: (f: FollowUp) => void; compact: boolean }) {
  const [busy, setBusy] = useState(false);
  const [openDetails, setOpenDetails] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = live(f) ? timing(f, now) : 'closed';
  const day = f.due ? new Date(`${f.due.day}T00:00:00Z`) : null;

  const act = async (fn: () => Promise<FollowUp>) => {
    setBusy(true);
    setErr(null);
    try {
      onChange(await fn());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (f.dismissed)
    return (
      <li className="card card--dismissed" style={{ '--i': Math.min(i, 12) } as CSSProperties}>
        <p className="card__gone">
          Hidden as not a promise: <q>{f.quote}</q>
        </p>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act(() => dismiss(f.id, false))}>
          Undo
        </button>
        {err && <p className="notice notice--error" role="alert">{err}</p>}
      </li>
    );

  return (
    <li className={`card card--${t} card--${f.status}${compact ? ' card--compact' : ''}`} style={{ '--i': Math.min(i, 12) } as CSSProperties}>
      <div className="card__date" aria-hidden={!day}>
        {day ? (
          <>
            <span className="card__dow">{formatDay(f.due?.day ?? '').split(' ')[0]}</span>
            <span className="card__dd">{day.getUTCDate()}</span>
            <span className="card__mon">{formatDay(f.due?.day ?? '').split(' ')[2]}</span>
          </>
        ) : (
          <span className="card__nodate">—</span>
        )}
      </div>
      <div className="card__body">
        <div className="card__top">
          <h3 className="card__action">{f.action}</h3>
          <span className={`pill pill--${f.status}`}>
            {f.status === 'kept' && <Check />}
            {STATUS_TEXT[f.status]}
          </span>
        </div>
        <blockquote className="card__quote">{f.quote}</blockquote>
        <div className="card__meta">
          <span className="who">
            <Initials name={f.owner.name} />
            {f.owner.name}
          </span>
          {f.due && live(f) && <span className={`due due--${t}`}>{relative(f.due.at, now)} · “{f.due.phrase}”</span>}
          {!compact && (
            <button type="button" className="src" onClick={() => open(f.source.url)}>
              {f.source.containerKey && <b>{f.source.containerKey}</b>} {f.source.title}
            </button>
          )}
          {compact && f.source.kind !== 'page' && (
            <button type="button" className="src" onClick={() => open(f.source.url)}>
              View comment
            </button>
          )}
          {f.confidence === 'medium' && <span className="soft" title="Hedged or shared wording, like “we’ll” or “I’ll try to”">soft promise</span>}
        </div>
        <div className="card__actions">
          {live(f) ? (
            <>
              <button type="button" className="btn btn--kept" disabled={busy} onClick={() => act(() => setStatus(f.id, 'kept'))}>
                <Check /> Mark kept
              </button>
              {f.status !== 'slipping' && (
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act(() => setStatus(f.id, 'slipping'))}>
                  Slipping
                </button>
              )}
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act(() => setStatus(f.id, 'dropped'))}>
                Drop
              </button>
              <button type="button" className="btn btn--link" disabled={busy} title="Hide it and never pick this text up again" onClick={() => act(() => dismiss(f.id, true))}>
                Not a promise
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act(() => setStatus(f.id, 'open'))}>
              Reopen
            </button>
          )}
          <button type="button" className="btn btn--link" aria-expanded={openDetails} onClick={() => setOpenDetails((v) => !v)}>
            {openDetails ? 'Hide details' : 'Details'}
          </button>
        </div>
        {err && <p className="notice notice--error" role="alert">{err}</p>}
        {openDetails && <Details f={f} busy={busy} onDue={(d) => act(() => setDue(f.id, d))} />}
      </div>
    </li>
  );
}

function Details({ f, busy, onDue }: { f: FollowUp; busy: boolean; onDue: (day: string | null) => void }) {
  const [day, setDay] = useState(f.due?.day ?? '');
  return (
    <div className="details">
      <form
        className="details__due"
        onSubmit={(e) => {
          e.preventDefault();
          onDue(day || null);
        }}
      >
        <label>
          Due date
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <button type="submit" className="btn btn--ghost" disabled={busy || day === (f.due?.day ?? '')}>
          Save date
        </button>
      </form>
      <ol className="history">
        {[...f.history].reverse().map((h, i) => (
          <li key={`${h.at}-${i}`}>
            <time dateTime={new Date(h.at).toISOString()}>{new Date(h.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
            {h.what}
          </li>
        ))}
      </ol>
      <p className="details__by">Written by {f.author.name}{f.owner.accountId !== f.author.accountId ? `, assigned to ${f.owner.name}` : ''}.</p>
    </div>
  );
}

function Empty({ product, onScan }: { product: Ledger['product']; onScan: () => void }) {
  return (
    <section className="empty">
      <div className="empty__art" aria-hidden="true">
        <span className="bubble">I’ll send the deck by Friday.</span>
        <span className="arrow" />
        <span className="ticket">
          <Check /> Fri · send the deck
        </span>
      </div>
      <h2>No promises yet</h2>
      <p>
        From now on, any {product === 'jira' ? 'Jira comment' : 'Confluence page or comment'} with a commitment shows up here. To pick up what was already written, scan the last 30 days.
      </p>
      <button type="button" className="btn btn--primary" onClick={onScan}>
        Scan last 30 days
      </button>
    </section>
  );
}

function StatTile({ label, value, tone, i }: { label: string; value: number; tone: string; i: number }) {
  const n = useCountUp(value);
  return (
    <div className={`stat stat--${tone}`} style={{ '--i': i } as CSSProperties}>
      <span className="stat__n">{n}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

function KeptRing({ pct, kept, i }: { pct: number | null; kept: number; i: number }) {
  const n = useCountUp(pct ?? 0);
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="stat stat--ring" style={{ '--i': i } as CSSProperties}>
      <svg viewBox="0 0 64 64" className="ring" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="ring__track" />
        <circle cx="32" cy="32" r={r} className="ring__fill" strokeDasharray={c} strokeDashoffset={c - (c * n) / 100} />
      </svg>
      <span className="stat__n">{pct === null ? '–' : `${n}%`}</span>
      <span className="stat__label">Kept on time{kept ? ` · ${kept} kept` : ''}</span>
    </div>
  );
}

function useCountUp(target: number): number {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setN(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 700);
      const v = Math.round(a + (target - a) * (1 - (1 - p) ** 3));
      setN(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return n;
}

function Initials({ name }: { name: string }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return <span className="initials" style={{ '--h': h } as CSSProperties} aria-hidden="true">{letters}</span>;
}

function Check() {
  return (
    <svg className="check" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  );
}

function Amp() {
  return <span className="amp">&amp;</span>;
}
