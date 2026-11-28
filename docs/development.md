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

1. Install the shared judge build on both products of the same test site. Use
   a test issue and a test Confluence page where the test user can comment.
2. On the Jira issue, post “I'll send the updated budget by Friday.” Choose a
   future calendar date instead if Friday would be ambiguous. Open **Apps →
   Said & Done** and check the owner, due date and source link. If the
   comment is not yet in the ledger, run **Scan last 30 days**.
3. Reply as the same owner with “Sent the updated budget.” Check that the
   Jira promise moves to **Kept**.
4. On the Confluence page, post a dated promise as a footer comment. Reply to
   that same thread as the comment author that the work is done. Check the
   page byline for **Kept**. Use **Scan last 30 days** in the Confluence app
   if the initial comment has not appeared.
5. Record whether the install was fresh or reused, the installed version if
   visible, the source links, and the Jira and Confluence outcomes. The
   [dated native receipt](evidence/native-forge-2026-11-28.md) documents a
   prior test-site run. The local browser suite uses a mocked bridge.

See the [Jira and Confluence captures](screenshots) and the
[recorded demo](https://youtu.be/_fGu7I4yyG0). Data handling is documented in the
[privacy policy](../PRIVACY.md).

For development, sign in to Forge, run `forge deploy -e development`, and
`forge install -e development --site <site> --product jira` (or
`--product confluence`). Maintainers can deploy the separately registered
judge build with [the judge-build script](../scripts/judge-build.sh).
Before any deployment, export the real `JUDGE_APP_ID` from the existing
unlisted app and print the candidate manifest for review:

```sh
bash scripts/judge-build.sh --check
```

This check requires a distinct UUID and changes only the manifest's app ID.
It needs Bash and standard shell utilities, and neither builds the app nor
invokes Forge. Keep the [installation link](#try-it-on-an-atlassian-site)
pointed at that same unlisted app. An owner must separately approve any deployment.
