# Devpost write-up draft: Said & Done

Codegeist 2026 · category **Apps for Business Teams** · bonus **Best Marketplace Published App** (review ticket link). Recheck every link before submitting.

## Elevator pitch

Every "I'll send it by Friday" written in Jira or Confluence becomes a tracked follow-up with an owner, a due date and a reminder in the same thread.

## Inspiration

Most work promises are made in passing: a comment on an issue, a line in meeting notes. Nobody turns them into tickets, so they live only in the writer's memory. The reminder that should come on Thursday never comes, and on Monday someone asks "did that contract ever go out?". Said & Done keeps those promises without asking anyone to file anything.

## What it does

- **Finds promises where they are written.** Jira comments, Confluence pages, page comments and action items. "I'll", "I will", "let me", "we'll", "@Ana will…", "@Ana to…", and Confluence action items with a date. Questions, reported speech ("you said you'd…"), conditionals and code blocks are ignored.
- **Works out the owner and date.** The owner is the writer or the person @mentioned. Dates cover 25+ phrasings — "Friday", "next Tuesday", "EOD", "end of next week", "Dec 12", "the 15th", "in 3 business days", "end of Q1", Confluence date chips — resolved in the writer's own time zone.
- **Settles them from what people already do.** The owner replying "Sent, here it is" marks it **kept**; "running a day late" marks it **slipping**; ticking the action item marks it kept. Buttons cover the rest.
- **Lets people correct it.** A heads-up like "I'll miss standup tomorrow" reads like a promise. **Not a promise** hides it in one click, it never counts as broken, and the same text is never picked up again. Undo is right there.
- **Shows each person their own list.** **Mine** filters to the promises you owe, across every issue and page.
- **Reminds in the same thread.** One comment mentioning the owner the day before the deadline, one after it passes, then it stops.
- **Shows the ledger.** A Jira and a Confluence page with open, due-this-week, overdue and kept-on-time counts, grouped by deadline, searchable; an issue panel and a page byline item show the promises made right there. "Scan last 30 days" picks up what was written before install, only from content the viewer can see.

## How we built it

- **Forge, Runs on Atlassian.** Triggers on Jira comments and Confluence pages/comments, an hourly scheduled trigger for reminders, a Custom UI resolver, Forge KVS for follow-ups. No egress, no LLM, nothing leaves the site.
- **Deterministic core** (`src/core`, no Forge imports): an ADF reader that keeps mentions, dates and task state; a promise detector (owner patterns, action-verb list, question/reported-speech/hedge guards, confidence levels); a date parser; reply classification with negation handling ("I haven't sent it" is not done); and follow-up rules (status, nudges, stats).
- **Permissions.** Lists and edits check the viewer can see the issue or page (user-context REST calls) before showing or changing anything. The app only reads content and writes reminder comments.
- **UI.** React + Vite, warm paper look with a serif headline, animated counters and kept-on-time ring, responsive down to phone width, dark theme, reduced-motion support, keyboard focus styles.
- **Tests.** Vitest unit tests for dates, detection, replies and ledger rules; Playwright tests of the UI against a mocked bridge; CI on every PR.

## Challenges

- Telling a promise from a sentence that only contains "will": "it will be fixed" or "if I'll have time" are not commitments. The detector requires a first-person or mentioned owner plus a concrete action verb, and rejects questions, conditionals and reported speech.
- Dates are relative to when and where they were written: "Friday" in a comment from last month is not this Friday. Dates resolve from the comment's creation time in the author's Atlassian time zone.
- A reply like "I haven't sent it yet" contains "sent". Negation and future markers are checked before a reply settles anything.

## Accomplishments

- It runs on a real Atlassian site: a Jira comment became a follow-up within seconds, the owner's "Sent" reply marked it kept, and a Confluence scan picked up the dated action items on an existing planning page.
- No AI service, no data leaving Atlassian, free to run.

## What we learned

Most of the value is in what the app *doesn't* do: no new forms, no new fields. People keep writing the way they already do.

## What's next

- Per-project settings (quiet hours, reminder lead time).
- A weekly digest per person.
- More languages for detection.

## Demo (silent, captioned, real site data)

1. A Jira comment, "I'll share the updated vendor shortlist with the team by Thursday", becomes a follow-up with owner, due date and a link back.
2. **Mine** narrows the ledger to what the viewer owes.
3. "I'll miss the planning sync tomorrow" is caught too; one click on **Not a promise** hides it, with Undo.
4. The owner replies "Shared the updated vendor shortlist with the team", and the promise moves to **Kept**.
5. In Confluence, dated action items on an existing planning page are tracked the same way.

## Try it

- Install link: the **Said & Done (judge build)** link on this entry, built from the same code as the Marketplace listing. The listing is still in review and can't be installed by link yet.
- Write a Jira comment such as "I'll send the updated budget by Friday", then open **Apps → Said & Done** in Jira.
- Press **Not a promise** on a false match, or open **Mine** to see only your own.
- In Confluence, open **Apps → Said & Done** and press **Scan last 30 days**.

## Built with

forge, custom-ui, react, typescript, vite, vitest, playwright, jira, confluence
