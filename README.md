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

## Try the native judge build

Use the signed **Said & Done (judge build)** install link in the
[Codegeist entry](https://devpost.com/software/said-done-fmg1ez). An admin
installs it on an Atlassian Cloud test site with Jira and Confluence.

- [Judge setup and repeatable checks](docs/development.md#try-it-on-an-atlassian-site)
- [Recorded native Jira and Confluence checks](docs/evidence/native-forge-2026-11-28.md)

## Try the local fixture

From a fresh clone with Node 22 or newer:

~~~sh
npm ci && npm run demo
~~~

Open [localhost:4173](http://localhost:4173) to try the ledger with sample data.
This path uses a mocked Forge bridge. It resets on reload and does not connect
to Jira or Confluence.

[Video](https://youtu.be/_fGu7I4yyG0) · [Devpost](https://devpost.com/software/said-done-fmg1ez) ·
[Privacy](PRIVACY.md)

[MIT License](LICENSE).
