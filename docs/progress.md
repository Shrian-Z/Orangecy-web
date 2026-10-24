# Orangecy 进度账本

> 开工先读本文件 + `AGENTS.md`。只记现状，终态见 `OrangecyPRD.md`（含附录 H）。

## 最新（2026-10-24 晚）弹药时代 · 全屏学习卡已落地

- **保尸**：`checkpoint-pre-ammo-20261024` → tag `87375de` / commit `a293fca`（旧壳可回滚点）。
- **第 2 步 · 器官迁移** `46a7750`：
  - `src/player.ts` → `src/audio/source.ts`（283 行，仅 2 行 import 变）；
  - `src/store.ts` → `src/audio/store.ts`（191 行，先原样搬，旧壳走 shim）；
  - `src/lib/lrc.ts` → `src/lyrics/parse.ts`（157 行）；`src/lib/wordTiming.ts` → `src/lyrics/timing.ts`（10 行）；
  - `WordHighlight.tsx` 从旧歌词舞台抽出（84 行）；`browserTts` 从旧词卡抽出（21 行）。
  - 旧壳未改；`typecheck` / `build` / **旧 smoke 12/12**；`srs` / `studyStore` / `wordbook` / `api` / `server` 零 diff。
- **第 3 步 · 删旧壳** `1ef7ece`：19 个旧组件 / 旧 CSS / 旧导航稿 / 旧截图全部下线并归档，
  `src/` 只剩音频器官、歌词器官、SRS 与 4 tab 空壳；后台零 diff。
- **第 4 步 · 新卡**：
  - FocusCard + `src/audio/sequence.ts` 新序列器 + `browserTts` provider + 4 tab + 空态。
  - `public/cards/seed-50.json`：50 卡 / 17 首真实网易云曲目 / 1–2 句真实歌词 / 真实时间戳；
    `npm run check:cards` **484/484**（可播 + 歌词逐行命中）。
  - `npm run trace:audio` **13/13**：片段 200ms 淡入 / 200ms 淡出 / 500ms 安静 / 发音 fadeIn=0 fadeOut=0。
  - `npm run check:palette`：15 状态（3 视口 × 5 状态）**0 违规 / 0 渐变 / 0 阴影**；
    明度阶梯 8/18/28/34/40/48/55/70/80/100 全命中；写 `docs/palette-check.json`。
  - `npm run smoke` **58/58**：启动即卡、两判断、SRS review、歌词重播、发音、静音持久化、
    4 tab、50/50 完成、320/390/1440 无溢出、console 0 错误。
  - 截图：`docs/screenshots/focus-{desktop,mobile,small}-{collapsed,expanded,playing,muted}.png`；
    第一帧 `focus-first-frame.png`；音频轨迹 `docs/audio-trace.json`。
- **Git**：`46a7750`（迁移）→ `1ef7ece`（删壳）→ 本轮收工档（见 `git log`）。
- **下一刀**：复习 / 词书 / 我的三页真内容；真人发音音频包 provider；真机首次音频解锁实测。

> 上一轮导航重构（两世界 / 迷你条 / 播放层）已作废，设计稿在 `docs/archive/dual-mode/`。

## 历史（2026-10-22 深夜）

- **宪法层已定**：PRD 附录 H（克莱因蓝 × 白）+ `AGENTS.md` v2
- **本轮完成（播放舞台去字收口 ①②③）**：
  - ① 顶栏四段文字 Tab → 四个固定图标槽位（播放 / 推荐 / 词卡 / 复习）；顶栏说明字收起，平台入口并为账号图标，接入检查仍在平台抽屉。
  - ② 歌词辅助字默认隐藏：行时间戳、「命中 N 词」、右上提示、底部小字；点歌词区临时唤出，5 秒后随 chrome 隐去；辅助字做覆盖层，不推动歌词位置。
  - ③ 底栏 → 闲置自动隐去的浮动胶囊；主层只留播放/暂停、切歌、进度，「…」展开二级（时间 / 音量 / 队列）；暂停自动浮现，点歌词区切换显示。
- **验证**：`typecheck` / `build` 通过；palette 12 个状态 0 违规 0 渐变；smoke 12/12；截图 `docs/screenshots/klein-stage-*.png`。
- **未做（下一轮 ④）**：歌词整屏主角，封面不再与歌词长期分栏。
- **Git**：开工存档 `fa652e3`；本轮收工存档 `d21c9f9`（①②③主体 + 截图）、`6c433c1`（暂停只唤胶囊的收尾）。

## 怎么更新

每完成一块，在本文件顶部追加一小段：日期、做了什么、验收结果、下一刀是什么。不要把长清单贴进对话。
