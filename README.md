# Zetamac++

A [Zetamac](https://arithmetic.zetamac.com/) arithmetic speed-drill clone with **keystroke-level error and timing telemetry**. Vanilla JS + Vite, no backend — every session persists to `localStorage`.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle -> dist/
```

## Core game (matches real Zetamac)

- Two-minute default speed drill; no submit button — the question **auto-advances the instant the input equals the answer**.
- Config screen with the four operations:
  - **Addition** — range `(a..b) + (c..d)` (default `2..100 + 2..100`)
  - **Subtraction** — "addition problems in reverse" (sum − operand, so results stay non-negative integers)
  - **Multiplication** — range `(a..b) × (c..d)` (default `2..12 × 2..100`)
  - **Division** — "multiplication problems in reverse" (always exact integer quotients)
- Duration selector: 30 / 60 / 120 / 300 / 600 s (default 120).
- Big countdown timer + running score, minimal UI.

## Telemetry

Every question records: operands, operator, correct answer, the full keystroke trace
(`{key, t, fieldAfter}` per event, timestamped with `performance.now()`), `thinkTime`
(time to first keystroke) and `totalTime` (shown → auto-advance).

### Error detection via backspace

Because the game only advances when the field equals the answer, every keystroke
stream ends on the correct value — so **any backspace is an unambiguous retraction of a
wrong entry** (prefixes of the answer never need a backspace → no false positives).

- A **correction event** = a maximal run of one or more consecutive backspaces.
- The **committed wrong value** = the field content immediately *before* that run,
  read from field-value snapshots (`fieldAfter`), so partial-delete-and-retype works.
- A question can have multiple correction events.

Each event is classified on two axes (see [`src/classifier.js`](src/classifier.js)):

1. **Timing** — `latencyBeforeBackspace < 350 ms` ⇒ fat-finger **typo**; slower ⇒ a
   believed, real error.
2. **Arithmetic relationship** to the answer:
   - small diff (borrow/carry slip, incl. off-by-10/20) ⇒ **computation error**
   - digits reversed (63 → 36) ⇒ **transposition**
   - equals a *different* operator's result on the same operands ⇒ **operator confusion**
   - otherwise ⇒ **unclassified**

The classifier is a **single pure function** (`classifyCorrection(evt, ctx)`), and raw
keystroke traces + operands are stored, so new rules can be added and applied
retroactively (`reclassifySession`) without re-collecting data.

## End-of-session screen

- **Per-question timeline** (x = question #, y = time spent); red dots mark questions
  with corrections. Click any point to open a panel with that question's full data:
  operands, operator, answer, think/total time, keystroke trace, and every correction
  event with its classification.
- Summary stats: per-operation breakdown (count / mean time / error rate), slowest fact
  patterns, think-vs-type split, p90 / p95 / max (worst-freeze) latency, fatigue curve
  (first / middle / last third), and error-type distribution.

## History & trend

Every completed session is saved; the history view shows a session-over-session trend
line for **score** and **median question time**, plus a table of all sessions.

## Layout

| File | Responsibility |
|------|----------------|
| `src/config.js` | Default config + enabled-operator helpers |
| `src/configScreen.js` | Pre-game config UI |
| `src/questions.js` | Question generation (incl. reverse subtraction/division) |
| `src/game.js` | Game loop, keystroke capture, auto-advance |
| `src/telemetry.js` | Correction-event reconstruction from field snapshots |
| `src/classifier.js` | Pure correction classifier (easy to extend) |
| `src/stats.js` | Session summary statistics |
| `src/charts.js` | Hand-rolled SVG charts (no chart lib) |
| `src/results.js` | End-of-session screen |
| `src/history.js` | History + trend view |
| `src/storage.js` | `localStorage` persistence |
