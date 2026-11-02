# Sprint Sentinel

**An evidence-backed sprint-health assistant for Jira — built on Atlassian Forge, as a Rovo agent and an MCP server.**

Ask it how your sprint is going and it answers from live board data: what is at
risk, who is overloaded, and what is blocked. Every statement cites the exact
Jira issue it came from, so the AI can't invent a number or a risk.

Built for **Codegeist 2026**.

## The problem

Sprint check-ins run on gut feel. A standup, a glance at the board, and a
guess at what will slip. The signals that actually predict a missed sprint —
work sitting untouched, one person buried, a quietly blocked ticket, a due date
already in the past — are on the board, but nobody has time to comb for them,
and a general-purpose AI asked "how's the sprint?" will happily make up a
confident answer.

## What it does

Four tools, each returning exact, cited facts:

| Tool | Answers | Example evidence it returns |
|---|---|---|
| **Sprint health report** | "How is the sprint going?" | `25% done; 4 at risk (3 high); Alice over WIP limit; SHOP-15 blocked` |
| **At-risk issues** | "What's at risk?" | `[HIGH] SHOP-12 — Due date 2026-11-08 has passed (2 days ago)` |
| **Assignee workload** | "Who's overloaded?" | `Alice: 4 in progress (OVER LIMIT)` |
| **Blocked issues** | "What's blocked?" | `SHOP-15 (flagged) blocked by SHOP-20` |

A risk is only ever reported with the issue key and the concrete reason behind
it. The risk rules:

- **Blocked** — flagged as an impediment, or linked "is blocked by" an open issue.
- **Overdue** — due date in the past and not done.
- **Stale** — in progress but untouched for N days (default 3).
- **Unassigned** — in progress with nobody assigned.
- **Due soon** — due within N days (default 2) but not started.
- **Churn** — many comments (default 8+) yet still unfinished.

Plus per-person work-in-progress load with a configurable WIP limit.

## Why the AI stays honest

The language model never computes or guesses the numbers. The Forge tools fetch
the board, a **pure, unit-tested analysis engine** (`src/lib/analysis.js`)
derives every finding, and the agent's prompt restricts it to relaying only what
the tools returned, always citing the issue key. The hard logic is covered by
14 tests that run with no Jira and no network (`npm test`).

See it without a Jira instance at all:

```bash
npm install
npm test            # 14/14 — the analysis engine
node examples/demo.js   # a full report on sample issues
```

## How it uses Atlassian / Forge (Codegeist categories)

One Forge app, three prizes targeted:

- **Rovo agent** (`rovo:agent`) — a natural-language sprint assistant.
- **MCP server** (`rovo:mcp`) — the same four tools exposed to any MCP-capable
  agent. The agent actions and the MCP tools share one implementation.
- **Main track** — a complete, non-trivial product on Forge + the Jira
  platform (Agile and Platform REST APIs), running entirely on Forge's hosted
  runtime with only `read:jira-work`.

## Architecture

- `src/lib/analysis.js` — pure sprint-health logic (risk rules, load, summary). No I/O.
- `src/lib/jira.js` — fetches the active sprint and its issues, normalises them, discovers the Story Points and Flagged custom fields by name.
- `src/index.js` — the four Forge action handlers; each returns a ready-to-read `text` block plus raw `data`.
- `manifest.yml` — the `rovo:agent`, `rovo:mcp`, `action` and `function` modules.
- `test/` — unit tests for the analysis engine (`node --test`).
- `examples/demo.js` — offline report on sample data.

## Run it on your own Jira

Prerequisites: Node 22.x or 24.x, and a free [Atlassian cloud developer site](https://go.atlassian.com/cloud-dev).

```bash
npm install -g @forge/cli
forge login          # email + API token from id.atlassian.com (app: Forge)
forge register       # claims an app id and writes it into manifest.yml
forge deploy
forge install        # choose Jira, pick your developer site
```

Then open Rovo on your site, find **Sprint Sentinel**, and ask
"How healthy is the sprint on board 1?" (use your board's id).

## License

MIT
