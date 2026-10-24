# Orangecy 定案规格（弹药时代 · 2026-10-24）

> 产品立意 / 红线以 `AGENTS.md` v3 为准；本文件只记已经实现、验收时要对齐的
> 短规格。旧双模式规格已归档到 `docs/archive/legacy-shell/spec.md`。

## 一个业务屏

- 启动直达学习页第一张卡；无 splash、无品牌语。
- 底部 4 个纯图标 tab：学习 / 复习 / 词书 / 我的；后三个为空态图标。
- 学习页 = 全屏单词卡；音乐只以歌词片段、目标词、进度、静音钮出现。

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

## 数据

`public/cards/seed-50.json`（`src/data/seed-50.json` 为同内容打包副本）：

    type FocusCardData = {
      w: string; p: string; m: string;
      s?: string; syn?: string[]; exam?: [string, string]; k?: string;
      track: Song;                 // 真实可播曲目元数据
      fragment: {
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

## 代码地图

    src/audio/source.ts        音源单例（旧 player.ts 迁入，内核行为不变）
    src/audio/store.ts         音频状态（song/lines/playInfo/time/duration/volume/playing）
    src/audio/pronunciation.ts browserTts provider
    src/audio/sequence.ts      新序列器（只调 volume/seek/play）
    src/lyrics/parse.ts        LRC 解析（旧 lib/lrc 迁入）
    src/lyrics/timing.ts       逐词三态（旧 lib/wordTiming 迁入）
    src/lyrics/WordHighlight.tsx 词高亮 token 化 / 目标词 / phase
    src/cards.ts               卡数据、SRS 输入适配
    src/state/app.ts           view / muted
    src/screens/LearnScreen.tsx 卡索引、序列、判断
    src/components/            FocusCard / LyricFragment / FragmentProgress /
                               MuteButton / BottomTabs / PlaceholderView
    src/styles/tokens.css      两色 + 明度阶梯
    src/styles/app.css         卡面 / tabs / 动效

## 验收

```bash
npm run typecheck
npm run check:cards
npm run build
npm run check:palette
npm run smoke
npm run trace:audio
npm run shoot:focus
```

旧壳拆除前（tag `checkpoint-pre-ammo-20261024` → commit `a293fca`）的
旧 smoke 12/12 证据见 `docs/evidence/step2-smoke.txt`。
