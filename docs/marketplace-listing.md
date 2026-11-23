# Marketplace listing draft (free app)

- **Name:** Said & Done
- **Tagline (≤ 80):** Promises in comments and pages become follow-ups with an owner and a date.
- **Category:** Project management / Workflow; also Communication.
- **Hosting:** Cloud, Runs on Atlassian (no egress, no external storage).
- **Pricing:** Free.
- **Products:** Jira, Confluence.

## Summary (≤ 250)

Said & Done finds commitments people write in Jira comments and Confluence pages — "I'll send the contract by Friday", "@Ana to review by Dec 12" — and tracks them with an owner, a due date and a reminder in the same thread.

## Highlights

1. **Nothing new to fill in.** Promises are detected in the comments, pages and action items people already write, with the owner and a due date worked out from the text.
2. **Settled by the conversation.** A reply like "Sent, here it is" marks it kept; "running late" marks it slipping; ticking a Confluence action item closes it.
3. **Reminders in context.** One comment the day before the deadline and one after it passes, mentioning the owner, in the original thread.

## More details

Detection is rule-based and runs inside your Atlassian site; no text is sent anywhere. The ledger page shows open, due-this-week, overdue and kept-on-time counts and only lists promises from issues and pages the viewer can see.

## Screenshots (1840×900)

1. Jira ledger with an open promise from a comment.
2. The same promise kept after the owner's reply.
3. Confluence ledger after scanning a planning page's action items.
4. Issue panel on an issue.
5. Reminder comment in the thread.

## Links

- Privacy policy: `<landing>/privacy`
- Support: GitHub issues on himanshu748/said-and-done
- Documentation: README

## Data & security answers

- Personal data stored: Atlassian account IDs and display names of promise owners/authors, the promise sentence, and links to the source issue/page, in Forge storage on Atlassian. Deleted on uninstall per Forge.
- No egress, no third-party processors, no analytics.
- Scopes: storage:app, read/write:jira-work, read:jira-user, read:page/comment/space:confluence, write:comment:confluence, read:confluence-user, read:confluence-content.summary.
