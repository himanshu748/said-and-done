# Said & Done development

Use Node 22 or newer. To install dependencies, verify the code, and build the UI:

~~~sh
npm ci
npm run typecheck && npm run lint && npm test
npm run build:ui
npx playwright install chromium
npm run test:e2e
~~~

The browser tests use a mocked Forge bridge. [Core logic](../src/core) parses
Atlassian Document Format, detects commitments, and interprets dates and replies.
[Forge handlers](../src) connect that logic to Jira, Confluence and Forge KVS.

## Try the ledger locally

Run `npm ci` and `npm run demo`, then open [localhost:4173](http://localhost:4173).
Choose **Overdue** and **Prepare handoff**, mark a sample promise **Kept**, or use
**Not a promise** and **Undo**. The demo uses the same sample data as the browser
tests and resets on reload. The next section covers testing real comments, scans,
and reminders in Atlassian.

## Try it on an Atlassian site

For the contest, use the **Said & Done (judge build)** install link on
[Devpost](https://devpost.com/software/said-done-fmg1ez), an unlisted copy built
from the same source as the Marketplace app. The installer requires an Atlassian
account with admin access to a site running both Jira and Confluence.

1. On a Jira issue, comment “I'll send the updated budget by Friday.”
2. Open **Apps → Said & Done** and check the owner, due date and source link.
3. Reply as the owner with “Sent the updated budget.” The item moves to **Kept**.
4. Open the app in Confluence and choose **Scan last 30 days** to find dated
   action items and promises on pages.

See the [Jira and Confluence captures](screenshots) and the
[recorded demo](https://youtu.be/_fGu7I4yyG0). Data handling is documented in the
[privacy policy](../PRIVACY.md).

For development, sign in to Forge, run `forge deploy -e development`, and
`forge install -e development --site <site> --product jira` (or
`--product confluence`). Maintainers can deploy the separately registered
judge build with [the judge-build script](../scripts/judge-build.sh).
