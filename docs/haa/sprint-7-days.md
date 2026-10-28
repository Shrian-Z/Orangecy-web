# 7-day sprint to 2026-11-05

No 90-day plan. The only goal is: **a public, polished, honest proof of work by Nov 5.**

## Day 0 — done (Oct 28)

- [x] 200-word demo deck generated from the CET4 wordbook (phonetic + core meaning + example + translation).
- [x] Static demo mode: one book, no API, no login, no playlist/account tabs.
- [x] Three card modes: context / recall / cloze.
- [x] Three ratings: 忘记 / 模糊 / 认识; 忘记 retries the same card in-session.
- [x] GitHub Pages workflow; `VITE_DEMO=1`.
- [x] Screenshots: `docs/screenshots/haa-*.png`.
- [ ] Confirm Pages is enabled and the URL is live.
- [ ] Record the first 60-second phone screen capture.

## Day 1 — deploy and QA (Oct 29)

- [x] Push to `main`; confirm GitHub Pages URL.
- [x] Test the public URL on a phone emulator; real-device check still open.
- [ ] Check: first card, TTS, three modes, 忘记 retry, refresh persistence, 10-card completion.
- [ ] Fix only blockers: overflow, unreadable text, broken TTS, broken route.
- [ ] Add a short "what this is" README block at the top of the repo.

## Day 2 — content QA (Oct 30)

- [ ] Read all 200 cards; remove weird/too-sensitive/ambiguous entries.
- [ ] Check every example contains the target word and translation is readable.
- [ ] Replace 10–20 weak examples manually if needed.
- [ ] Keep one source/license note in the repo.
- [ ] Do **not** expand to 3,000 words yet.

## Day 3 — demo video + real music (Oct 31)

- [ ] Record 60–90 seconds on the public demo: context → reveal → forgetting retry → recall → cloze.
- [ ] Record 30–45 seconds of the local full app with real song lyric fragments and audio.
- [ ] Record voiceover: problem, what shipped, why it matters.
- [ ] Export 1080p; upload unlisted YouTube or Loom.
- [ ] Add the video link to the HAA kit and README.

## Day 4 — user probe (Nov 1)

- [ ] Put the demo in front of 5–10 people (friends, classmates, online).
- [ ] Ask: what do you think this is? did the lyric/example help? would you use it for 10 words a day?
- [ ] Record 3 quotes and 3 concrete complaints.
- [ ] Do not add features before this; just fix the top 3 friction points.

## Day 5 — application writing (Nov 2)

- [ ] Fill in the "why me" story in your own voice.
- [ ] Use the draft structure in [README.md](README.md).
- [ ] Include the live URL, repo, video, and screenshots.
- [ ] Say explicitly: 200-word demo, no users yet, full music runs locally.
- [ ] Ask one builder/mentor to read it for 10 minutes.

## Day 6 — final polish + submission (Nov 3)

- [ ] Re-test public URL after final deploy.
- [ ] Check mobile screenshots and video.
- [ ] Submit early; do not wait for Nov 5.
- [ ] Keep a copy of every answer as a markdown file.

## Day 7 — buffer (Nov 4–5)

- [ ] Only fix deployment/login issues.
- [ ] No new features.
- [ ] If Pages fails, fall back to a Vercel static deploy and keep GitHub as source.

## Non-goals for this week

- Full 3,000–5,000 wordbooks.
- TikTok-style ranking/bandit.
- Native audio licensing.
- Multi-user accounts.
- A 90-day content plan.
