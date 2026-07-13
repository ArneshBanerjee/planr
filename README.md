# 🗓️ Planr

Tell it what's on your plate in plain language — it plans your calendar.

Type things like:

> "I want 7-8 hrs sleep, dropping to 6 on heavy days. GATE exam is the first week of Feb 2027 — add daily subject blocks from now till then, learning first then tons of questions. I also do DSA, research work, and my final-year project."

…and Planr fills your calendar with concrete time blocks. Then adjust anytime:

> "It's my gf's birthday — I'm out from 5:30pm for ~4 hrs"
> "Exams on the 15th, 17th and 20th from 1-3pm"

and the plan re-flows around them without churning days that didn't change.

## How it works

- An **LLM parses each chat message** into structured operations (goals, constraints, fixed events) — one call per message. Two free providers, auto-detected:
  - **Claude Code** (if the `claude` CLI is installed): runs `claude -p` headless under your existing subscription — zero setup, no API key.
  - **Gemini free tier** (if `GEMINI_API_KEY` is set): free key from [AI Studio](https://aistudio.google.com/apikey).
- A **deterministic scheduler** (pure TypeScript, no LLM) places 45–120 min blocks around sleep and fixed events, weighted by priority and deadline pressure, with phase-aware labels (learn → questions) and subject rotation. Re-plans only touch future, unlocked blocks.
- Blocks live in **SQLite** (`data/planr.db`, auto-created) and render in **FullCalendar**. Click a block to mark done/skip/lock; dragging a block pins it.
- Optional **Google Calendar sync**: your real events are planned around, and the next 14 days of blocks mirror to a dedicated "Planr" calendar for phone notifications.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000 and start typing in the chat panel. If you have Claude Code installed, that's it — the app uses it automatically. Otherwise `cp .env.local.example .env.local` and set `GEMINI_API_KEY` (free). Set `LLM_PROVIDER` in `.env.local` to force one when both are available (Gemini wins by default).

### Optional: Google Calendar sync

1. Create a project at https://console.cloud.google.com, enable the **Google Calendar API**
2. Create an OAuth client (Web application) with redirect URI `http://localhost:3000/api/google/callback`
3. Put the client ID/secret in `.env.local`, restart, and click **Connect Google Calendar**

## Tests

```bash
npx vitest run
```

Covers the scheduler (placement, phases, sleep borrowing, minimal re-plan diffs) and the full ops → DB → scheduler pipeline for the three scenarios above.
