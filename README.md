# Exam Rescue 🚨

An AI browser agent for students with an exam coming up and no idea where to start.
Give it your subject, syllabus, days remaining, and weak topics — it sends a real
**[WebCMD](https://webcmd.dev/docs)** browser-research agent onto the open web, evaluates
what it finds, and comes back with a prioritized, hour-by-hour rescue plan.

---

## Problem Statement

Students facing an exam in a few days rarely know **what to study first**. They either
freeze, or they study the wrong things because ChatGPT-style tools generate a generic
timetable from memorized knowledge with no connection to what's actually available to
study *right now* on the web.

## Solution

Exam Rescue turns "I have 3 days and I'm weak in SQL" into a concrete plan:

```
STUDENT INPUT → AI DECISION MAKING → WEBCMD BROWSER RESEARCH → REAL WEB RESOURCES
→ RESOURCE ANALYSIS → TOPIC PRIORITIZATION → PERSONALIZED RESCUE PLAN
```

It is **not** a chatbot generating a timetable from its own knowledge — every resource
shown to the student was retrieved by a real WebCMD fetch during that request, and the
plan is built from what was actually found (or honestly reports when nothing was found).

## Why It Needs a Browser Agent

The value of Exam Rescue depends entirely on *current, real* study material — tutorials,
practice questions, previous-year papers — which no LLM has memorized for an arbitrary
syllabus line a student typed five seconds ago. That requires live web research, which is
exactly what WebCMD's `web fetch` command performs: it fetches a real URL over HTTP
(with browser-impersonating TLS as a fallback), locally, without fabricating anything.

## Features

- Polished exam-input form with **Load Demo** (DBMS / 3 days / 5h/day / SQL & Normalization)
- Live agent progress reflecting the *actual* pipeline stages, including real WebCMD calls
- **Exam Rescue Level** (CRITICAL / HIGH / MODERATE / SAFE) — explicitly labeled as an
  application-generated indicator, not a scientific prediction
- Topic prioritization (HIGH/MEDIUM/LOW) with reasons, estimated hours, and recommended
  resources per topic
- Day-by-day study plan that **never exceeds** the student's stated available hours
- **"I ONLY HAVE 2 HOURS"** emergency mode, computed live from the student's actual plan
- Resource cards linking to the real pages WebCMD fetched
- Graceful failure at every layer — no fake success states

## Architecture

```
exam-rescue/
├── frontend/   Vite + React + TypeScript + Tailwind CSS
│   └── streams NDJSON progress from the backend, renders the dashboard
├── backend/    Node.js + Express + TypeScript
│   ├── src/routes/rescue.ts         → POST /api/rescue/stream (NDJSON), /api/rescue/emergency
│   ├── src/services/webcmdResearch.ts → THE WebCMD integration layer
│   ├── src/services/studyPlanner.ts  → deterministic prioritization + scheduling
│   └── src/utils/webcmdClient.ts     → spawns the real `webcmd` CLI, nothing else does
```

## WebCMD Integration

**File that invokes WebCMD:** `backend/src/utils/webcmdClient.ts` (the *only* file that
spawns the `webcmd` binary). `backend/src/services/webcmdResearch.ts` calls it.

### Why this shape, specifically

WebCMD's own docs (["Custom SDK Integration"](https://webcmd.dev/docs/agents/custom-sdk))
state plainly:

> "Webcmd's programmatic SDK is not available yet. Integration through a custom SDK is
> coming soon; this page will document it when it ships."

WebCMD is designed to be driven by an **AI agent harness** (Claude Code, Codex, etc.)
reading natural-language prompts and choosing CLI commands — not called like a REST API
from arbitrary backend code. For a plain Express server, the honest, real integration is
to shell out to the actual installed `webcmd` CLI and use the one command that is
documented as built-in, requires no plugins, and is safe for unattended read-only use:

```bash
webcmd web fetch --url <url> -f json
```

Per the [CLI Reference](https://webcmd.dev/docs/cli-reference):
> "`web fetch` tries plain HTTP first, then browser-impersonating TLS clients. It remains
> local in both modes and never opens a browser."

### The actual research flow

1. **Decide queries** (`webcmdResearch.ts`) — for each syllabus topic, build 2–3 targeted
   search queries (extra one for weak topics). This is the "AI decision making" step.
2. **Invoke WebCMD** (`webcmdClient.ts`) — `webcmd web fetch --url ... -f json` against, in
   order until one succeeds: DuckDuckGo HTML results → Wikipedia's public search API →
   Bing HTML results. Each is a real subprocess call to the real CLI.
3. **Parse real output** — the fetched HTML/JSON is parsed with regex/JSON parsing to pull
   out actual titles, URLs, and snippets. Nothing is invented; if parsing finds nothing,
   that source is recorded as a warning and the pipeline moves on.
4. **Deduplicate** by normalized URL.
5. **Classify** each resource's type (tutorial/video/article/etc.) from its URL/title.
6. Return `{ resources, warnings }` to `studyPlanner.ts`.

### Deliberate architectural boundary

If `web fetch` hits a page that needs real browser rendering, WebCMD returns
`FETCH_REQUIRES_BROWSER` or `FETCH_BLOCKED`. The fully agentic fallback for that (open a
Webcmd browser Session, `browser run`, `browser snapshot`, `session close`) requires a
running local daemon + browser bridge (Cloak) and an agent making step-by-step navigation
decisions — not a good fit for a deterministic Express handler. **This project does not
fake that fallback.** When `web fetch` fails, the source is skipped, the reason is
recorded, and research continues with whatever sources succeeded — matching the brief's
"if one website fails, continue with other sources" requirement. Extending this to a full
browser-session fallback is listed under Future Improvements.

### One thing you must verify locally

WebCMD's public docs describe the `-f json` / `-f plain` output-format convention in
general (a single human-facing field named one of `response`, `content`, `markdown`,
`text`, or `value`) but do not pin down the exact field name `web fetch` uses on your
installed version. **Before your demo**, run:

```bash
webcmd web fetch --url https://example.com -f json
```

and confirm the field holding the fetched body. `webcmdClient.ts` already tries all of
`content, markdown, text, response, value, html, body` automatically — if your version
uses something else, set `WEBCMD_FETCH_CONTENT_FIELD` in `backend/.env` instead of editing
code. This is called out explicitly rather than guessed, per the hackathon's "mark it as a
setup step instead of inventing it" requirement.

## Prerequisites

- Node.js 20.6+ (required by WebCMD itself)
- npm
- WebCMD CLI installed and set up (see below)

## Installation

```bash
git clone <this-repo>
cd exam-rescue

cd backend && npm install && cp .env.example .env
cd ../frontend && npm install
```

## WebCMD Setup

Official docs: https://webcmd.dev/docs

```bash
# Install the CLI globally
npm install -g @agentrhq/webcmd

# Interactive setup — choose "local" mode for this hackathon build
webcmd setup

# Sanity check
webcmd doctor
webcmd --help
```

If you're also giving an AI coding agent access to WebCMD skills (optional, only needed if
you want an agent to *extend* this project, not required to run it):

```bash
# Claude Code
claude plugin marketplace add agentrhq/webcmd
claude plugin install webcmd@webcmd

# Any other harness / plugin-free
webcmd skills add
```

Then verify the fetch command this project actually depends on:

```bash
webcmd web fetch --url https://example.com -f json
```

## Environment Variables

`backend/.env` (copy from `backend/.env.example`):

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no (default 4000) | Express server port |
| `WEBCMD_BIN` | no (default `webcmd`) | Path/name of the WebCMD binary |
| `WEBCMD_FETCH_TIMEOUT_MS` | no (default 20000) | Timeout per `web fetch` call |
| `WEBCMD_FETCH_CONTENT_FIELD` | no | Only set if your `web fetch -f json` output uses a field name not already tried automatically (see above) |

No API keys or secrets are required for the core app. Nothing is hardcoded; `.env.example`
contains no real values.

## Running the Backend

```bash
cd backend
npm run dev      # http://localhost:4000
```

`GET /api/health` reports whether the `webcmd` CLI was detected.

## Running the Frontend

```bash
cd frontend
npm run dev       # http://localhost:5173, proxies /api to :4000
```

## Running the WebCMD Agent

There is no separate "agent process" to start — `webcmd` is invoked as a subprocess by the
backend on each research request, exactly like any other CLI tool your backend shells out
to. Just make sure `webcmd doctor` succeeds in the same shell/user environment the backend
runs in before starting `npm run dev` in `backend/`.

## Demo Instructions (≈2–3 minutes)

1. Open the app → **🚨 Start My Rescue**.
2. Click **⚡ Load Demo** (DBMS, 3 days, 5h/day, weak: SQL & Normalization).
3. Click **🚨 RESCUE ME** — narrate the live stage list as it updates, especially
   "Researching web resources with WebCMD" and the live query log underneath it.
4. Point out the **Rescue Dashboard** (level + stats) once it lands.
5. Scroll through **Prioritized Topics** — show the reasons and the resource links.
6. Flip through **Day 1 / Day 2 / Day 3** tabs.
7. Scroll to **Resources** — click "Open Resource" on one card to prove it's a real,
   live URL WebCMD fetched, not a placeholder.
8. Drag the **"I ONLY HAVE ___"** slider to ~30–60 minutes and click the button to show it
   recomputing live from the same plan.

## Testing WebCMD Independently

```bash
webcmd web fetch --url "https://html.duckduckgo.com/html/?q=SQL+tutorial" -f json
webcmd web fetch --url "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=SQL&format=json" -f json
```

If either returns fetched HTML/JSON, the backend's research pipeline will too. If you get
`FETCH_BLOCKED`, try the Bing fallback URL the backend also uses:

```bash
webcmd web fetch --url "https://www.bing.com/search?q=SQL+tutorial" -f json
```

## Running the Full Project

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

Visit http://localhost:5173.

## Limitations

- `web fetch`-only research: pages that hard-require JS rendering and return
  `FETCH_REQUIRES_BROWSER`/`FETCH_BLOCKED` are skipped rather than escalated to a full
  WebCMD browser Session (see "Deliberate architectural boundary" above).
- Search-engine HTML scraping (DuckDuckGo/Bing) is inherently fragile to markup changes;
  Wikipedia's JSON search API is included specifically as a stable fallback.
- Topic prioritization and hour allocation are rule-based and transparent by design, not
  ML-based — the brief explicitly warns against inventing exam weightage that isn't known.
- Research is capped at 8 syllabus topics per request to keep the live demo fast and
  reliable; larger syllabi still get a full plan, just without dedicated web research for
  every single topic (this is reported back, not hidden).
- No authentication, no logins, no writes to any external site — matches the "public,
  read-only" requirement.

## Future Improvements

- Full WebCMD browser-Session fallback for `FETCH_REQUIRES_BROWSER` pages
- Turn a proven query pattern (e.g. "DuckDuckGo search → parse") into a real, reusable
  WebCMD adapter/CLI via `webcmd-adapter-author`, so future runs reuse a verified command
  instead of re-deriving the parse each time
- Optional LLM-based resource ranking/summarization layer on top of the deterministic
  planner
- Previous-year-paper detection tuned per institution
- Persist plans so students can return to a rescue plan later

## Team Contribution

| Name | Contribution |
|---|---|
| _add your team here_ | _e.g. backend/WebCMD integration_ |
| _add your team here_ | _e.g. frontend/UI_ |
| _add your team here_ | _e.g. prioritization logic, demo prep_ |
