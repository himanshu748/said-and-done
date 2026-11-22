# Said & Done

A Forge app for Jira and Confluence that turns promises people write — *"I'll send the revised contract by Friday"*, *"@Ana to review the deck by Dec 12"*, an open action item with a date — into tracked follow-ups with an owner and a due date, and posts a reminder in the same thread the day before.

- **Detects** commitments in Jira comments, Confluence pages, page comments and action items. Owner: the writer, or the person @mentioned. Due date: 25+ phrasings (Friday, next week, EOD, Dec 12, the 15th, in 3 business days, end of Q1…), resolved in the writer's time zone.
- **Settles** them from replies: the owner writing "sent, here it is" marks it kept; "running late" marks it slipping; ticking the action item on the page marks it kept.
- **Reminds** once a day before the deadline and once after it passes, as a comment mentioning the owner.
- **Ledger** page in Jira and Confluence with open/overdue/kept counts, plus an issue panel and a page byline item.

Detection is deterministic and runs on Atlassian (Runs on Atlassian eligible): no LLM, no egress, nothing leaves the site.

## Develop

```bash
npm ci
npm run typecheck && npm run lint && npm test   # unit tests (Vitest)
npm run build:ui && npm run test:e2e             # UI tests (Playwright, mocked bridge)
forge deploy -e development && forge install -e development --site <site> --product jira   # and --product confluence
```

`src/core` is pure (no Forge imports): ADF reading, promise detection, date parsing, follow-up rules. `src/` holds the Forge triggers, resolver and KVS store. `static/ui` is the Custom UI (React + Vite).
