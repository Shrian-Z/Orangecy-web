# 大拆迁清单 · 弹药时代（已执行）

日期：2026-10-24  
状态：**已执行（2026-10-24）。** 本清单保留为拆除对照；执行以本轮提示词 + AGENTS v3 为准。

## 0. 存档

- 当前 HEAD：a293fca（docs: record final de-text snapshot hashes）。
- 已有 tag：checkpoint-nav-redesign-20261024 → a293fca。
- **批准后第一条命令**：打 tag checkpoint-pre-ammo-20261024，报 hash；再动 src/。
- 工作区现状：docs/progress.md 有上一轮未提交改动；docs/design/ 是未跟踪的旧导航稿。
  旧导航稿会被归档，不会带进新实现。

## 1. 先移植（只许迁移，不许重写）

| 源 | 新模块 | 动作 | 验收 |
| --- | --- | --- | --- |
| src/player.ts（283 行） | src/audio/source.ts | git mv；src/player.ts 留 re-export shim | 旧 UI 不改也能跑；typecheck + build + 旧 smoke 通过 |
| src/lib/lrc.ts（157 行） | src/lyrics/parse.ts | 移动；src/lib/lrc.ts 留 shim | parseLyric 输出逐字一致 |
| src/lib/wordTiming.ts（17 行） | src/lyrics/timing.ts | 移动；shim | wordPhase 三态一致 |
| LyricsStage 里的 TextWithWords | src/lyrics/WordHighlight.tsx | 抽出 token 化、目标词匹配、逐词 phase | 旧 LyricsStage 改用它；视觉不变 |
| WordCards 里的 speak() | src/audio/pronunciation.ts | 抽成 provider 的 browserTts 实现 | TTS 行为不变 |
| src/lib/srs.ts + src/studyStore.ts | 原地 | **一行不动** | git diff 为空；新卡只调用 review() |
| src/lib/wordbook.ts 的 lookupWord / splitWordSenses | 原地 | 不动 | 词高亮与词义切分继续用 |
| src/api.ts 的音源/歌词方法 | 原地 | 不动 | source 模块继续调用 |

移植提交必须满足：**不改 DOM、不改样式、不改播放行为**。旧 smoke 在移植后仍然全过，
再进入拆除。这样能证明“只迁移不重写”。

## 2. 后拆除（已建代码）

旧 18 个组件，共 4,442 行：

| 文件 | 行 | 拆的原因 | 替代 |
| --- | --- | --- | --- |
| WordCards.tsx | 619 | 旧词卡页：导语、统计、词表、三档反馈、去播放器入口 | 新 FocusCard；只迁 speak 与 review 调用 |
| SearchDrawer.tsx | 589 | 搜歌页 | 无（音乐不可浏览） |
| RecommendView.tsx | 381 | 推荐页 | 无 |
| LyricsStage.tsx | 362 | 全屏滚动歌词舞台 + 辅助字 + 点词；抽完 WordHighlight 后删除 | 新 LyricFragment |
| CheckDrawer.tsx | 254 | 接入检查 UI | 无；开发自检走脚本 |
| PlatformDrawer.tsx | 249 | 平台账号中心 | 无；下轮“我的”再议 |
| PlayerBar.tsx | 214 | 迷你条 / NOW PLAYING 胶囊 / 进度 / 队列入口 | 无；只留卡内片段进度 |
| Bodian/Kugou/QQ LoginModal | 213×3 | 平台登录 UI | 无；API 层保留 |
| LoginModal.tsx | 208 | 网易云登录 UI | 无；API 层保留 |
| CoverStage.tsx | 198 | 封面 + NOW PLAYING + 沉浸入口 | 无；界面无封面 |
| WordbookModal.tsx | 182 | 词书选择弹层 | 本轮“词书”tab 占位 |
| ImmersivePlayer.tsx | 160 | 全屏播放器 | 无 |
| WordPeek.tsx | 125 | 点词白卡浮层 | 词义在卡内展开 |
| QueueDrawer.tsx | 120 | 播放队列 | 无 |
| TopBar.tsx | 106 | 顶栏 4 槽位 + 搜索 + 账号 | 底部 4 tab |
| Toasts.tsx | 36 | 文字提示条 | 无；错误只进 console / 报告 |

合计：18 个组件，4,442 行。

### 状态与壳

- src/store.ts（191 行）拆成：
  - src/state/app.ts：view（learn / review / books / me）、muted、deck、index、expanded、phase、error。
  - src/audio/store.ts：只留 source 模块需要的 song / lines / playInfo / loading / currentTime / duration / volume / audioReady / playing。
- 删除字段：auth、qqAuth、kugouAuth、bodianAuth、queue、queueIndex、drawer、seekCheck、toasts、
  wordbook、wordbookIndex、wordbookPrompt、wordFocus、booted（启动页一起删）。
- App.tsx（346 行）：删 splash、auth boot、默认曲目 boot、Wordbook 同步、抽屉懒加载、
  舞台 chrome 5 秒计时、空格/方向键 seek、world 切换；换成 4 tab 壳 + 卡。
- src/styles.css（5,884 行）+ src/theme.css（3,403 行）→ 替换为
  src/styles/tokens.css（约 120 行）+ src/styles/app.css（约 450 行）。
  旧选择器全部不保留；新 CSS 从 tokens 起写。
- index.html：data-world blue → white；theme-color #FFFFFF；title/description 去掉“听歌背单词”；
  不保留任何开屏文案。
- public/favicon.svg 检查：只允许蓝/白；如有第三色改成蓝白。

### 脚本

- scripts/smoke.mjs（129 行）：旧流程全废，重写为：
  启动直达卡、收起/展开、两个判断、切卡、歌词重播、单词重听、静音持久化、
  4 tab 占位、无旧 UI 选择器、320/390/1440 无横向溢出、console 0 错误。
- scripts/check-palette.mjs（326 行）：按新语义重写：
  - source 清单只扫新文件；运行时扫 7 个状态 × 3 视口。
  - 新增：boxShadow / textShadow 必须 none；不得出现整屏蓝底；学习页必须有蓝色音乐痕迹
    （目标词、进度、静音钮）。
  - 保留：只允许 #002FA7 / #FFFFFF 及 alpha；gradient 0。
  - 新增 npm run shoot:focus 生成双端四态截图；可选 check:copy 做可见文字审计。
- package.json：保留 check:palette / smoke；新增 shoot:focus；删除不再用的脚本入口（如有）。

### 数据与后台

- public/wordbooks/* 保留：下轮复习/词书要用；本轮不接 UI。
- data/catalog.json 保留：服务端曲库/音源索引；本轮不接推荐 UI。
- server/* 保留：音源代理、歌词、四平台能力都是“弹药”，不拆。
- /api/recommend、catalog 构建等推荐链路：本轮不从 UI 调用；后台保留，不算幽灵路由
  （幽灵路由指前端 view / drawer 状态）。
- 新数据 public/cards/seed-50.json：50 词 + 真实曲目 + 1–2 句真实时间戳。

## 3. 未建的计划项（只删引用，不改代码）

| 计划项 | 存在形态 | 处理 |
| --- | --- | --- |
| 两套标签栏 | docs/design/nav-redesign.md + 01–04 PNG | 归档到 docs/archive/dual-mode/，顶部写 superseded |
| 词门 / 歌门 | 同上 | 同上 |
| 蓝白翻转 | 同上 | 同上 |
| 迷你条 | 同上 | 同上；代码里的 PlayerBar 胶囊一并删 |
| 播放层 | 同上 | 同上；代码里的 player view / ImmersivePlayer 一并删 |
| CoverFlow | 仓库内 grep 0 处（已扫 src/docs/AGENTS） | 无代码可删；新设计稿不得再引入 |

## 4. 文档归档

- docs/design/nav-redesign.md / nav-redesign.html / 01..04-*.png → docs/archive/dual-mode/
- docs/design/current-app-8787.png → docs/archive/dual-mode/
- docs/color-audit.md / color-audit.csv → docs/archive/dual-mode/
- docs/screenshots/ 旧图 → docs/archive/dual-mode/screenshots/（可选；更新 progress 里的旧链接）
- docs/ACCEPTANCE.md：旧双模式验收 → 归档；新写全屏卡验收。
- docs/spec.md：颜色段改写；旧“播放页去字收口”标 superseded；新增“全屏专注卡”。
- docs/progress.md：顶部加本轮记录；旧导航重构段标 superseded 并改归档链接。
- docs/decisions.md：追加 4 行（见下）。
- AGENTS.md：替换为 v3（见 constitution-v3.diff）。

### 账本行（decisions.md 追加）

| 日期 | 决定 | 理由 |
| --- | --- | --- |
| 2026-10-24 | 双模式时代结束，弹药时代开始：产品立意改为“纯背单词机器，音乐是隐形弹药” | 歌单/歌曲/播放器退出界面，音乐只以词卡歌词片段出现；旧双模式全家拆除 |
| 2026-10-24 | 两色语义改写：白=学习骨架（底/面/留白），蓝=墨与音乐痕迹（歌词/目标词/音频控件/进度）；全站单白世界，无整屏蓝底、无阴影 | 音乐不再是一个世界，只是学习卡上的一层痕迹 |
| 2026-10-24 | 导航收为启动直达学习页 + 底部 4 图标 tab（学习/复习/词书/我的）；后三个本轮占位 | 首屏只服务“打开就背”，不做模式门 |
| 2026-10-24 | 音源链路、歌词解析、词高亮只迁移不重写；SM-2 不动 | 保住已打通的能力，本轮只换壳与卡 |

## 5. 拆完自检（无死链 / 无孤儿状态 / 无幽灵路由）

命令：

    npm run typecheck
    npm run build
    npm run check:palette
    npm run smoke

grep 归零：

    setView('player' | setView('recommend' | setView('cards'
    openDrawer | drawer | wordFocus | wordbookPrompt | seekCheck | toasts
    playercapsule | topbar | nav-item | lyrics-panel | cover-stage | immersive | word-peek | play-button | splash
    推荐页 | 搜歌 | 歌单 | 播放器 | NOW PLAYING | CoverFlow

结构和数据：

- src/components 只剩：FocusCard、LyricFragment、BottomTabs、PlaceholderView、MuteButton、FragmentProgress。
- AppView 只有 4 个值；每个值都有渲染分支；没有第 5 个死分支。
- 新 store 每个字段都有读者；没有只写不读的字段。
- 旧 CSS 类名在新 CSS 中为 0；没有死选择器。
- 旧组件 import 为 0；tsc 无未使用报错（tsconfig 若开 noUnusedLocals 则必过）。
- 可见文字审计：只允许数据 + 模糊/认识；没有曲名/歌手/时间戳/说明字。
- 空态只有图标；没有“暂无/去登录/去搜歌”等文案。
- 双端：1440×900、390×844、320×568；无横向滚动；收起态一屏；展开态不遮按钮。

## 6. 风险与护栏

- **音源**：50 词只用现有可播曲目；构建脚本逐首请求 /api/song/:id/play，
  available=false 的曲目直接剔除；不足 50 词则构建失败，不拿假音补。
- **歌词**：只用真实 lyric + 时间戳；1–2 句；构建时校验目标词确实在句子里。
- **自动播放**：首次被浏览器拦截时静默走时间轴，首次交互后从当前位置补播；不弹提示。
- **TTS**：浏览器 TTS 无法增益斜坡，按设计稿的 0.2s 静默缓冲处理并在报告注明。
- **SRS**：srs.ts / studyStore.ts 零 diff；只调用 review({rating:'hard'|'good'})。
- **范围**：本轮只做学习页 + 4 tab 占位；复习卡、词书页、我的页不精修。
- **旧存档**：tag checkpoint-pre-ammo-20261024 保留拆除前全貌；旧设计稿归档不删历史。
