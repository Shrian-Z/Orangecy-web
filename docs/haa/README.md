# HAA application kit — Orangecy

Status: 2026-10-28. This folder is for the Horowitz Andreessen Academy application.
It is not product documentation; the repo README remains the source of truth.

## The one-line pitch

**Orangecy turns the music you already love into spaced-repetition word cards: the word appears inside a real lyric, with the song's audio, and comes back at the edge of forgetting.**

## What is live now

- **Public 200-word demo:** <https://shrian-z.github.io/Orangecy-web/>
- Static GitHub Pages build; no login, no API server, no cookies.
- 200-word CET4 slice with phonetic, Chinese core meaning, one English example + translation, browser TTS.
- Three card modes: **context → recall → cloze**.
- Three ratings: **忘记 / 模糊 / 认识** (the first is an icon; the other two are the product's existing action words).
- FSRS via `ts-fsrs`; progress persists in `localStorage`.
- Demo data: `src/data/demo-200.json`; source/license: KyleBing/english-vocabulary, BSD-3-Clause.
- Tests: normal app `npm run smoke` 111/111; demo build is static.
- Reproduce deploy: `npm run deploy:pages` (builds with `VITE_DEMO=1`, pushes `dist` to `gh-pages`).

## What is in the repo but not public

- Full FocusCard with real song lyric fragments and original audio via the local NetEase session.
- Playlist world, QR platform connection, imported wordbooks (JSON/CSV/TXT), adult settings.
- The public demo deliberately hides the playlist/account tabs because those need the API server and a logged-in session.

## Why this is proof of work

- **Shipped**: a public URL, a reproducible static build, a 200-card deck, a Pages workflow, a commit history.
- **Built**: React/TypeScript card surface, FSRS state, local persistence, TTS, three card modes, demo data pipeline.
- **Thought through**: the card is a chain, not a template; the scheduler and the distribution layer are separate; the reward is delayed recall, not watch time.
- **Honest about the gap**: no public music playback, no native audio, no multi-user backend, no retention data yet.

## What to say in the application

Use the user's own story for the "why me" part. Do not invent users, revenue, or retention numbers.

Draft structure:

1. **What I built** — one sentence + live link + repo link.
2. **What I noticed** — vocabulary apps optimize for "seen", not "remembered"; people cannot reliably rate their own memory; the best content is context, but context is usually sterile example sentences.
3. **What I shipped** — 200-word demo, three card modes, three ratings, FSRS, TTS, static deploy. Full music mode runs locally.
4. **What I learned** — the card is the product; content is the bottleneck; the music context is an encoding hook, not a replacement for retrieval.
5. **What I'd build next** — 3,000-word A-tier content, native audio, context graph, delayed-recall metric. Not "77万 words in one weekend".
6. **Why HAA** — proof-of-work culture, operator teachers, building with AI-native tools, distribution/learning-network access.
7. **What I want to be true in a year** — a public learning product with real retention data.

## Honest limitations (say them before they are found)

- 200 words, not a full wordbook.
- Browser TTS, not native audio.
- No public music playback because the current full app depends on a local NetEase session and content rights are unresolved.
- No users/retention data yet; the demo is a product probe, not a traction claim.
- The 200-word deck uses a BSD-licensed wordbook source; music/lyrics are not redistributed in the public demo.

## Links

- Demo: <https://shrian-z.github.io/Orangecy-web/>
- Repo: <https://github.com/Shrian-Z/Orangecy-web>
- Demo script: [demo-script.md](demo-script.md)
- 7-day sprint: [sprint-7-days.md](sprint-7-days.md)
- Content/scheduling plan: [../plan/wordcard-content-and-scheduling-20261028.md](../plan/wordcard-content-and-scheduling-20261028.md)
