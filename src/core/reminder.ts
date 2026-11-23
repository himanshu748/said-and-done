/** The Jira comment / Confluence page comment Said & Done posts as a reminder. */
import type { FollowUp, Nudge } from './ledger';

export const MARKER = 'Said & Done reminder';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function reminderDoc(f: FollowUp, kind: Nudge): unknown {
  const t = (text: string, marks?: { type: string }[]) => (marks ? { type: 'text', text, marks } : { type: 'text', text });
  const when = f.due ? formatDay(f.due.day) : 'soon';
  const lead = kind === 'overdue' ? `That was due ${when}. ` : `That's due ${when}. `;
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [
          t(`${MARKER}: `, [{ type: 'strong' }]),
          { type: 'mention', attrs: { id: f.owner.accountId, text: `@${f.owner.name}` } },
          t(` said they'd ${f.action}. ${lead}`),
          t('Reply "done" when it is, or say if it needs more time.'),
        ],
      },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [t(f.quote, [{ type: 'em' }])] }] },
    ],
  };
}
