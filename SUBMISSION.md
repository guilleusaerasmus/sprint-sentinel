# Sprint Sentinel — Devpost submission

Copy-paste ready text for the Codegeist 2026 submission form.

---

## Project name
Sprint Sentinel

## Tagline (elevator pitch, ~200 chars)
An evidence-backed sprint-health assistant for Jira. Ask how your sprint is going and it answers from live board data — what's at risk, who's overloaded, what's blocked — citing the exact issue behind every claim, as both a Rovo agent and an MCP server.

---

## Inspiration
Every sprint check-in runs on gut feel: a standup, a glance at the board, a guess at what will slip. The signals that actually predict a missed sprint — work sitting untouched, one person buried, a quietly blocked ticket, a due date already in the past — are all on the board, but nobody has time to comb for them.

The obvious move is to ask an AI "how's the sprint going?". The problem: a general-purpose assistant will happily invent a confident answer — a percentage, a risk, a name — that isn't backed by anything. In a delivery meeting that's worse than no answer. We wanted an assistant that is *physically unable* to make up a number, because the numbers don't come from the language model at all.

## What it does
Sprint Sentinel reports the health of a Jira sprint, grounded strictly in live board data. It exposes four tools:

- **Sprint health report** — "How is the sprint going?" → progress, counts of at-risk issues by severity, who's overloaded, what's blocked, top findings.
- **At-risk issues** — every at-risk issue with its concrete reason and severity.
- **Assignee workload** — work-in-progress per person, flagging anyone over the WIP limit.
- **Blocked issues** — flagged impediments and "is blocked by" links, naming each blocker.

Every single finding is reported with the issue key and the concrete reason behind it. The risk rules:

- **Blocked** — flagged as an impediment, or linked "is blocked by" an open issue.
- **Overdue** — due date in the past and not done.
- **Stale** — in progress but untouched for N days (default 3).
- **Unassigned** — in progress with nobody assigned.
- **Due soon** — due within N days (default 2) but not started.
- **Churn** — many comments (default 8+) yet still unfinished.

A real answer from the live demo board: *"The sprint is at risk. 24% done (8/34 pts). Red flags: the biggest item, SHOP-2 Add Apple Pay, is flagged as an impediment and blocked by SHOP-6; SHOP-1 Checkout crashes on Safari was due 1 Nov and is still in progress; SHOP-6 is due tomorrow and not started; one person holds 4 in-progress items at once."* — each item linked to its issue.

## How we built it
One Forge app, targeting the main track plus two bonus categories at once:

- A **`rovo:agent`** — a natural-language sprint assistant whose prompt restricts it to relaying only what the tools returned, always citing the issue key.
- A **`rovo:mcp`** server — the same four tools exposed to any MCP-capable agent. The agent actions and the MCP tools share one implementation.
- Four **`action`** modules backed by Forge functions on the `nodejs24.x` runtime, reading Jira through the Agile and Platform REST APIs with only `read:jira-work` plus the minimal granular scopes.

The design that keeps the AI honest: the language model never computes or guesses anything. The Forge tools fetch the board; a **pure, unit-tested analysis engine** (`src/lib/analysis.js`, no I/O) derives every finding; the agent only relays them. That hard logic is covered by a test suite that runs with no Jira and no network (`npm test`) — 21 tests, including the normalisation layer validated against the real Jira REST shape.

## Challenges we ran into
Testing against a real Jira site immediately surfaced two bugs that unit tests with hand-written mocks had missed:
1. **Blocked-by direction.** On the blocked issue, Jira returns the blocker as the link's `outwardIssue` (the "blocks" end), not `inwardIssue` as we'd assumed. Fixed, and locked down with a test built from the real API response.
2. **Story-point field.** Team-managed and company-managed projects store points in different custom fields ("Story point estimate" vs "Story Points"). We now discover every candidate field and use whichever one holds a value.

Both fixes came straight from running the deployed agent on a live board — exactly the kind of thing you only catch end-to-end.

## Accomplishments that we're proud of
- A genuinely trustworthy AI feature: it is architecturally incapable of inventing a metric, and every claim is clickable back to its evidence.
- One clean app that earns the main track plus the Rovo-agent and MCP bonus categories from a single shared implementation.
- Deployed and verified live on a real Jira site, not just a slide.

## What we learned
End-to-end testing is non-negotiable for an integration: the two bugs we shipped fixes for were invisible until the agent read a real board. And "grounding" an LLM is less about prompting and more about architecture — if the model can't compute the number, it can't fake it.

## What's next
- A Teamwork Graph integration to pull in cross-project dependencies (a third bonus category).
- A scheduled daily digest that posts the sprint-health report to a team channel.
- Marketplace publication.

## Built with
Atlassian Forge · Rovo (agent + MCP) · Jira Cloud (Agile + Platform REST) · Node.js 24 · node:test

## Links
- **Try it / install:** (Forge app — distribution link to add before submitting)
- **Source code:** (public GitHub repo URL to add)
- **Demo video:** (YouTube URL, <5 min, to add)

## Bonus categories we're entering
- **Rovo / Assignable agents** — ships a `rovo:agent`.
- **App that uses Atlassian's MCP** — ships a `rovo:mcp` server exposing the same four tools.
