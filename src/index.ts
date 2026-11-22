import { nudgeDue, withEvent } from './core/ledger';
import { reminderDoc } from './core/reminder';
import { addJiraComment, addPageComment, getIssue, getJiraComment, getPage, getPageComment } from './site';
import { ingestJiraComment, ingestPage, ingestPageComment } from './sources';
import { listFollowUps, saveFollowUp } from './store';

export { handler } from './resolver';

interface JiraCommentEvent {
  issue: { id: string; key: string; fields?: { summary?: string } };
  comment: { id: string };
}

export async function onJiraComment(event: JiraCommentEvent): Promise<void> {
  const [comment, issue] = await Promise.all([getJiraComment(event.issue.id, event.comment.id), event.issue.fields?.summary ? { id: event.issue.id, key: event.issue.key, summary: event.issue.fields.summary } : getIssue(event.issue.id)]);
  await ingestJiraComment(issue, comment, Date.now());
}

interface ConfluenceEvent {
  content?: { id?: string; type?: string };
}

export async function onConfluencePage(event: ConfluenceEvent): Promise<void> {
  if (!event.content?.id || (event.content.type && event.content.type !== 'page')) return;
  await ingestPage(await getPage(event.content.id), Date.now());
}

export async function onConfluenceComment(event: ConfluenceEvent): Promise<void> {
  if (!event.content?.id) return;
  const c = await getPageComment(event.content.id).catch(() => null);
  if (c) await ingestPageComment(c, Date.now());
}

/** Hourly: post the reminders that are owed. */
export async function sendReminders(): Promise<void> {
  const now = Date.now();
  const all = await listFollowUps();
  let sent = 0;
  for (const f of all) {
    const kind = nudgeDue(f, now);
    if (!kind) continue;
    try {
      if (f.source.product === 'jira') await addJiraComment(f.source.containerId, reminderDoc(f, kind));
      else await addPageComment(f.source.containerId, reminderDoc(f, kind));
      await saveFollowUp(withEvent(f, { nudges: [...f.nudges, kind] }, kind === 'overdue' ? 'Overdue reminder posted' : 'Reminder posted', now));
      sent++;
    } catch (e) {
      console.error(`reminder ${f.id} failed`, e);
    }
  }
  console.log(`reminders: ${all.length} follow-ups checked, ${sent} posted`);
}
