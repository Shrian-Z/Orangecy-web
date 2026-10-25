# Orangecy 进度账本

> 开工先读本文件 + `AGENTS.md`。只记现状，终态见 `OrangecyPRD.md`（含附录 H）。

## 最新（2026-10-25）三槽导航 + 歌单世界

- **开工存档**：tag `checkpoint-pre-nav-playlist-20261025` → `4b95042`。裁定写进 `AGENTS.md`
  「2026-10-25 裁定」小节；决策见 `docs/decisions.md` 2026-10-25 各行。
- **第 1 步 · 学习首页**：`LearnHome`（词书条 + 学习 N / 复习 M）、`BookPicker`（四级 / 六级 / 高中）、
  `src/today.ts`（N/M 口径）。LearnScreen 改为接收冻结队列 + 返回钮；走完回首页。
  - N = min(配额 − 今天首次学过的词数, 本书未学可放卡数)；M = 今天 23:59:59 前到期、今天未判、有卡可放。
  - smoke 用 fixture 证明：昨天到期 + 今晚到期算 M，明天到期 / 今天已判不算（M=2）。
- **第 2 步 · 会话**：已落盘网易会话 `03de4e` 仍登录；Counting Stars play 可用、歌词 99 行。
- **第 3 步 · 歌单 API**：`/api/playlists` 20 个真实歌单；「Shrian_喜欢的音乐」1178 首按 100 分页，
  末页 78、越界 0；未登录 `loggedIn:false` / 401。见 `docs/evidence/playlist-api.json`。
- **第 4 步 · 歌单世界**：`PlaylistWorld`（漂浮横滑书架 → 列表分页 → 迷你播控 → 歌词视图）；
  空态 / 加载 / 错误齐全。`npm run shoot:nav` 15/15，见 `docs/evidence/nav-e2e.json`。
  截图：`docs/screenshots/nav-learn-home.png`、`nav-shelf.png`、`nav-list-playing.png`、
  `nav-lyrics.png`、`nav-shelf-empty.png`。
- **第 5 步 · 回归**：`build`（check:cards 484/484 + tsc + vite）绿；`smoke` 80/80；`trace:audio` 13/13；
  `check:palette` 33 状态 0 违规（含登录后书架 / 列表播放 / 歌词）；`shoot:focus` 重跑。
  离开歌单 → 整曲暂停、播控收起；回卡 → 重新装载卡内曲目，200ms 淡入 + seek 通过。
- **收尾（2026-10-25）**：`LearnHome` 无词书态补 BookOpen 图标；`src/data/seed-50.json`
  补进 git（否则干净 checkout 缺 seed）；干净 worktree 复跑 build/check:cards 484/484、
  smoke 80/80、palette 33 状态 0 违规、trace 13/13、shoot:focus 3×4、shoot:nav 15/15。
  收尾 tag `checkpoint-post-nav-playlist-polish-20261025`（hash 见 git log）。
- **已知限制**：只接网易歌单；QQ / 酷狗 / 波点已连接也不拉歌单。曲目队列只含已加载页。
  歌单世界离开即停播（不做后台续播）。歌词视图无逐字高亮。整曲播放不受卡内静音键影响。
  可学卡仍只有 seed-50，六级只有 9 张可放。
- **下一刀**：其它平台歌单；真机音频解锁实测；扩卡（更多带片段的词）。

## 上一轮（2026-10-24 深夜）音源接回 · 我的·添加

- **开工存档**：`checkpoint-pre-auth-reconnect-20261024` → tag `2a3ff2d` / commit `add0be2`。
- **第 1 步 · 无 UI 证明旧链路**：复用本机已落盘网易会话 `03de4e`（`Shrian_`），
  `authStatus` 返回 `loggedIn: true`；seed 的 3 个不同 trackId 均 `available: true`，
  歌词 45 / 58 / 96 行带真实时间戳；未登录对照也写入证据。
  见 `docs/evidence/auth-step1.json`。服务：`node server/index.mjs` @ 8787。
- **第 2 步 · 「我的」连平台**：把 me 的 Placeholder 换成 `MyScreen` +
  `PlatformConnectSheet`。右上 `Plus` → 四平台图标（网易 / QQ / 酷狗 / 波点）→
  `api.*.qrKey` 生成二维码 → 每 1.5s 轮询 `api.*.qrCheck` → 803 后
  `authStatus` 确认 → 已连接平台图标 + 断开图标。页面与 sheet 无可见文案；
  二维码是唯一功能性图片豁免。四平台二维码实测均可生成
  （`docs/evidence/platform-entry.json`）。
- **第 3 步 · 词卡可播**：用已落盘网易会话实测 seed 前 5 张：
  **5/5 `seek-check.passed`**，`playing: true`；5/5 第二行歌词均正常点亮；
  1–4 同为 Counting Stars，第 5 张切到 Viva La Vida 仍可播。
  见 `docs/evidence/auth-ui-e2e.json`。
- **门槛**：`typecheck` / `build` / `check:cards` 484/484；`check:palette`
  24 状态 0 违规 / 0 渐变 / 0 阴影；`smoke` 63/63；`trace:audio` 13/13；
  `shoot:focus` 三视口四态重跑。截图：`docs/screenshots/my-empty.png`、
  `my-chooser.png`、`my-qr-live.png`、`my-connected.png`。
- **未完成（唯一）**：两次实时二维码在 240s 内没收到手机确认，已过期；
  「经新 UI 真实扫码」仍需你手机确认。连接态与 5 卡可播已用本机已落盘会话验证。
- **下一刀**：补一次真实扫码 E2E；复习 / 词书真内容；真机音频解锁实测。

## 上一轮（2026-10-24 晚）弹药时代 · 全屏学习卡已落地

- **保尸**：`checkpoint-pre-ammo-20261024` → tag `87375de` / commit `a293fca`（旧壳可回滚点）。
- **第 2 步 · 器官迁移** `46a7750`：
  - `src/player.ts` → `src/audio/source.ts`（283 行，仅 2 行 import 变）；
  - `src/store.ts` → `src/audio/store.ts`（191 行，先原样搬，旧壳走 shim）；
  - `src/lib/lrc.ts` → `src/lyrics/parse.ts`（157 行）；`src/lib/wordTiming.ts` → `src/lyrics/timing.ts`（10 行）；
  - `WordHighlight.tsx` 从旧歌词舞台抽出（84 行）；`browserTts` 从旧词卡抽出（21 行）。
  - 旧壳未改；`typecheck` / `build` / **旧 smoke 12/12**；`srs` / `studyStore` / `wordbook` / `api` / `server` 零 diff。
- **第 3 步 · 删旧壳** `1ef7ece`：18 个旧组件 / 旧 CSS / 旧导航稿 / 旧截图全部下线并归档，
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
- **Git**：`46a7750`（迁移）→ `1ef7ece`（删壳）→ `f77659b`（FocusCard 收工档）。
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
