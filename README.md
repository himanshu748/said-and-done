# Said & Done

**Promises in Jira and Confluence get buried before anyone follows up.**

<img src="docs/screenshots/jira-ledger-real.png" width="640" alt="Said & Done ledger with open, overdue, and kept follow-ups">

Said & Done gives a promise an owner and a due date, tracks replies, and sends
reminders in the original conversation. Use **Mine** to see your own follow-ups
and **Not a promise** to dismiss a false match. Use **Prepare handoff** to turn
the open promises matching your filters into a copyable update with source links.

## How it uses Atlassian

Forge listens for Jira and Confluence changes, stores follow-ups in Forge KVS,
and runs scheduled reminders. The Jira issue panel, Confluence byline, and
ledger show the same state. Detection uses the text and dates on the site.

## Quickstart

From a fresh clone with Node 22 or newer:

~~~sh
npm ci && npm run demo
~~~

Open [localhost:4173](http://localhost:4173) to try the ledger with sample data.
For a live test, sign in as an admin of a site with Jira and Confluence and use
the judge build linked from Devpost. See [setup and examples](docs/development.md).
The [native Forge check](docs/evidence/native-forge-2026-11-28.md) shows how
real Jira and Confluence replies change the ledger.

[Video](https://youtu.be/_fGu7I4yyG0) · [Devpost](https://devpost.com/software/said-done-fmg1ez) ·
[Privacy](PRIVACY.md)

[MIT License](LICENSE).
