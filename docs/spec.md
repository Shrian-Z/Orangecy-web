# Orangecy 定案规格（弹药时代 · 2026-10-24）

> 产品立意 / 红线以 `AGENTS.md` v3 为准；本文件只记已经实现、验收时要对齐的
> 短规格。旧双模式规格已归档到 `docs/archive/legacy-shell/spec.md`。

## 一个业务屏

- 启动直达学习页第一张卡；无 splash、无品牌语。
- 底部 4 个纯图标 tab：学习 / 复习 / 词书 / 我的；复习 / 词书为空态，
  「我的」是音源连接页。
- 学习页 = 全屏单词卡；音乐只以歌词片段、目标词、进度、静音钮出现。

## 我的 · 平台连接（2026-10-24 接回）

- 入口：底部「我的」右上角 `Plus`（aria-label 添加音源）。
- 添加 → 四个平台图标（网易云 / QQ / 酷狗 / 波点）→ 选中后
  `api.*.qrKey` 生成二维码 → 每 1.5s 轮询 `api.*.qrCheck` →
  803 成功后 `api.*.authStatus` 确认 → 本机 session（oc_sid）。
- 已连接：只显示平台图标 + 断开图标；断开走 `api.*.logout`。
- 不展示曲库、歌曲、账号资料；平台名只进 aria / title；页面无可见文案。
- 二维码是唯一功能性图片豁免；`check:palette` 跳过 `<img>`。
- 本轮 seed 仍全部 `platform: "netease"`；QQ / 酷狗 / 波点入口可连，
  不改 seed 平台；四平台入口都必须真实调用已有 API，失败显示刷新图标。
- 复用本仓 `api.ts` / `audio/source.ts`；MIT 库直接用；不复制 Folia
  AGPL 登录 UI / Omni / 曲库代码。

## 卡面状态

| 状态 | 触发 | 视觉 |
| --- | --- | --- |
| 收起 | 启动 / 切卡 | 1–2 句歌词（55% 蓝，目标词 100% + 下划线）、进度 0、单词 + 音标、无释义无按钮 |
| 展开 | 点卡片空白 | 释义 / 知识 / 例句 380ms 展开；模糊 / 认识 240ms 浮现；再点收起 |
| 播放中 | 片段开始 | 当前句 100%、下一句 34%、目标词始终 100%；进度按时间走并 1.8s 呼吸 |
| 静音 | 点静音钮 | VolumeX 100% 蓝；时间轴照走；声音跳过；`orangecy.muted` 持久化 |
| 完成 | 评完第 50 张 | 停在 50/50；居中 RotateCcw 图标，无文字；点一下从第 1 张重开 |

## 音频序列（`src/audio/sequence.ts`）

每张卡：

    翻入 320ms → 200ms → 片段 seek + 200ms 淡入 →
    逐行点亮 → 结束前 200ms 淡出 → 暂停 → 500ms 安静 →
    单词发音直出（fadeIn=0 / fadeOut=0）→ 静场

- 片段只播一遍；手动点歌词只重播片段，不触发发音 / 切卡。
- 点单词先把片段 200ms 淡出并暂停，再发音；不展开、不切卡。
- 判断：片段 200ms 淡出、暂停、取消发音，再切卡；新卡序列自动开始。
- 静音：不调用音频；同样的时间轴照走；发音阶段跳过。
- 切 tab：200ms 淡出并暂停；回来重开当前卡序列。
- 首启自动播放被拦：时间轴照走；第一次 pointerdown/keydown 后从当前位置
  200ms 淡入补播，不弹提示。
- 发音 provider：`src/audio/pronunciation.ts` 的 `browserTts`，
  `supportsGainRamp = false`；后期换真人音频 provider 只换实现。
- 验收：`npm run trace:audio`（13 项断言，写 `docs/audio-trace.json`）。

## 学习计划 / 设置（2026-10-25 晚）

- 入口：我的 → 设置 → 学习设置；首页不放设置入口。
- 每日新词 `newPerDay`：5–100，默认 10，步长 5；快捷 10 / 20 / 30 / 50 / 100。
- 每日复习上限 `reviewPerDay`：0（不限）/ 100 / 200 / 300 / 500，默认 200。
- N = min(`newPerDay + daily.extraNew − 今天首次学过的词数`, 当前词书未学可放卡数)；
  `daily.extraNew` 只由「再学 10 个」增加，次日清零，不改进设置。
- M = min(今天 23:59:59.999 前到期的可放卡数, `reviewPerDay − daily.reviewCount`)；
  `daily.reviewCount` 只统计 kind='review' 的判断，新词卡不计；0 = 不限。
- 学习 N 走完 → 自动接当天到期复习；两钮「学习 N / 复习 M」保留（今日完成态收起，只留完成卡）。
- N=0 且 M=0 → 首页「今日完成」卡片（今日新学/复习数字）+「再学 10 个」；
  完成卡左上角返回键收起它，回到标准首页（两钮恢复）；切走再回「学习」完成卡恢复。
  被复习上限拦下的到期卡显示「X 个到期，明天继续」，次日重新进队。
- 数据：`StudyState.settings = { newPerDay, reviewPerDay }`；
  `DailyStudy` 增加 `extraNew`、`reviewCount`；旧 localStorage 由 normalize 补默认。
- 调度：FSRS 内核与 `review()` 入口不变；只扩展设置与每日计数。

## 数据

`public/cards/seed-50.json`（`src/data/seed-50.json` 为同内容打包副本）：

    type FocusCardData = {
      w: string; p: string; m: string;
      s?: string; syn?: string[]; exam?: [string, string]; k?: string;
      track?: Song;                // 导入纯词卡没有音源
      fragment?: {                 // 导入纯词卡没有片段
        trackId: string;
        target: string;            // 歌词里的 surface
        start: number; end: number;
        lines: { text: string; time: number }[]; // 1–2 句真实时间戳
      };
    }

- 50 张卡 / 17 首网易云真实曲目；按曲目分组，减少换源。
- `scripts/build-cards.mjs` 从 catalog + 实时歌词生成。
- `scripts/check-cards.mjs` 在 `npm run build` 前逐首校验可播、歌词存在、
  时间戳逐行命中、目标词在句内；失败即构建失败。

## 词书导入（2026-10-25 起，2026-10-27 扩展）

- 入口：学习首页词书条「换」→ 词书选择页右上 `FileUp`（aria「导入词书」）。
- 预设：`public/wordbooks/gaozhong.json` 全量 3738 词（3500 核心 + 238 个扩展），
  书名片「高考 3500」，计数 3738；点预设固定走「配歌」。
- 自定义粘贴 / 文件：
  - 支持 `.json` / `.csv` / `.tsv` / `.txt`；CSV 支持表头与双引号字段。
  - JSON 可带 `name` / `tagline` / `source` / `license`；缺省用文件名，粘贴用
    「导入词表 N」。文本每行 `word` 或 `word,音标,释义`；最多 6000 词，大小写去重。
  - 输入后在 sheet 预览书名 / 词数 / 前四个词；书 id 为 `import-<base36 时间>`。
- 两种落库方式（sheet 内切换）：
  - `仅词书`（自定义默认）：跳过歌单 / 歌词 / 可播检查，立即生成纯词卡；
    无 track / fragment，flip 后只 TTS，不画歌词 / 进度 / seek。
  - `配歌`：`/api/playlists` 20 个歌单 → 自建 / 喜欢全量 + 收藏各前 300 首
    （总上限 4000）→ `/api/playlist/:id/tracks` 200 一页 → `/api/song/:id/lyric`
    并发 6 → `/api/song/:id/play` 并发 5 校验可播 → 每曲最多 10 卡、每 3 张一轮
    跨曲分散；同一曲内相邻卡不重叠同一段音频。未登录时不会丢词，全部落为纯词卡。
- 有词：真实 1–2 句歌词 + 真实时间戳 + 目标 surface；无词：纯词卡。
- 存储：IndexedDB `orangecy.imports`（`meta` / `data` 两 store）；meta 记
  `mode: 'words' | 'music'`、书名 / 词数 / 来源 / 导入时间，`data` 存 words + cards。
- 验收：`npm run smoke` 覆盖自定义 JSON 预览 / 纯词书导入 / IndexedDB / 刷新恢复；
  `npm run accept:import` 覆盖预设配歌，需要 `npm run build` + 本地 server +
  已登录网易会话，写 `docs/evidence/gaokao-import.json`。

## 代码地图

    src/audio/source.ts        音源单例（旧 player.ts 迁入，内核行为不变）
    src/audio/store.ts         音频状态（song/lines/playInfo/time/duration/volume/playing）
    src/audio/pronunciation.ts browserTts provider
    src/audio/sequence.ts      新序列器（只调 volume/seek/play）
    src/lyrics/parse.ts        LRC 解析（旧 lib/lrc 迁入）
    src/lyrics/timing.ts       逐词三态（旧 lib/wordTiming 迁入）
    src/lyrics/WordHighlight.tsx 词高亮 token 化 / 目标词 / phase
    src/cards.ts               卡数据、SRS 输入适配
    src/lib/importDeck.ts      词书解析（JSON/CSV/文本）/ 歌词配卡 / 纯词卡
    src/lib/importStore.ts     IndexedDB 导入书 + 列表 / 读取 hooks
    src/lib/wordImport.ts      纯词书直出 + 歌单→歌词→可播→成卡流水线
    src/state/app.ts           view / muted / bookId
    src/today.ts               N/M 口径、预设书 + 导入书合并
    src/platforms.ts           四平台连接配置（复用 api.ts）
    src/screens/LearnScreen.tsx 卡索引、序列、判断
    src/screens/LearnHome.tsx  词书条 + 学习 / 复习两钮 + 今日完成
    src/screens/SettingsScreen.tsx 设置 → 学习设置（每日新词 / 复习上限）
    src/screens/BookPicker.tsx 词书列表 + 导入入口
    src/screens/MyScreen.tsx   我的：连接态 + 添加入口
    src/components/            FocusCard / LyricFragment / FragmentProgress /
                               MuteButton / BottomTabs / PlatformConnectSheet /
                               ImportSheet
    src/styles/tokens.css      两色 + 明度阶梯
    src/styles/app.css         卡面 / tabs / 导入 sheet / 动效

## 验收

```bash
npm run typecheck
npm run check:cards
npm run build
npm run check:palette
npm run smoke
npm run trace:audio
npm run shoot:focus
npm run accept:import   # 需要 server + 已登录网易；约 2.5 分钟
```

导入配歌证据：`docs/evidence/gaokao-import.json`（3738 词 / 3059 歌卡 /
679 纯词卡 / 1005 曲全可播 / 5 卡 seek-check）。

登录 / 音源接回证据：`docs/evidence/auth-step1.json`（3 首 play/lyric +
未登录对照）、`docs/evidence/platform-entry.json`（四平台二维码入口）、
`docs/evidence/auth-ui-e2e.json`（已连接态 + 5 张卡 seek-check）。

旧壳拆除前（tag `checkpoint-pre-ammo-20261024` → commit `a293fca`）的
旧 smoke 12/12 证据见 `docs/evidence/step2-smoke.txt`。
