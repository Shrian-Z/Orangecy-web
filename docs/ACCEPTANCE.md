# Orangecy 验收清单（弹药时代 · 2026-10-24）

更新日期：2026-10-24  
验收入口：`http://127.0.0.1:8790`（静态生产预览）或 `http://localhost:5173`（Vite）  
API：`http://127.0.0.1:8787`（`check:cards` 用）  
设计对照：`docs/design/focus-card-v3.md` + 四态 PNG

## 一键回归

```bash
npm run typecheck
npm run check:cards
npm run build
npm run check:palette
npm run smoke
npm run trace:audio
npm run shoot:focus
```

最近结果：

| 项 | 结果 | 证据 |
| --- | --- | --- |
| typecheck | PASS | 无输出 |
| check:cards | 484/484 | `docs/cards-check.json` |
| build | PASS | `dist/` |
| check:palette | 15 状态 0 违规 / 0 渐变 / 0 阴影 | `docs/palette-check.json` |
| smoke | 58/58 | 终端输出 |
| trace:audio | 13/13 | `docs/audio-trace.json` |
| shoot:focus | 3 视口 × 4 态 | `docs/screenshots/focus-*.png` |

## 产品验收

1. **启动**：打开即一张卡，无 splash、无品牌语、无说明字。
2. **唯一业务屏**：只有学习卡；底部 4 个无字图标 tab；后三个只有居中图标。
3. **卡面**：`01 / 50` + 静音钮；1–2 句歌词；目标词蓝 + 下划线；进度细线；
   单词 + 音标；词义初始收起。
4. **展开**：点卡片空白，380ms 展开释义 / 知识 / 例句；模糊 / 认识浮现；
   再点收起。歌词区 / 单词区点击不展开。
5. **判断**：模糊 → hard，认识 → good，写入 `orangecy.study.v1`；
   切下一张，序列自动开始。50 张后停在 50/50 + 重播图标，无文字。
6. **音频**：片段 200ms 淡入 / 结束前 200ms 淡出 / 暂停后 500ms 安静 /
   发音 fadeIn=0 fadeOut=0；静音时时间轴照走；静音持久化。
7. **颜色**：仅 `#002FA7` / `#FFFFFF` 及 alpha；源码与运行时 0 违规；
   无渐变、无阴影、无第三色；白底无黑字。
8. **范围**：`server/`、`data/catalog.json`、`public/wordbooks/`、`src/lib/srs.ts`、
   `src/studyStore.ts`、`src/lib/wordbook.ts`、`src/api.ts` 对
   `checkpoint-pre-ammo-20261024` 零 diff。

## 双端布局

| 视口 | 收起 | 展开 | 播放中 | 静音 |
| --- | --- | --- | --- | --- |
| 1440×900 | `focus-desktop-collapsed.png` | `focus-desktop-expanded.png` | `focus-desktop-playing.png` | `focus-desktop-muted.png` |
| 390×844 | `focus-mobile-collapsed.png` | `focus-mobile-expanded.png` | `focus-mobile-playing.png` | `focus-mobile-muted.png` |
| 320×568 | `focus-small-collapsed.png` | `focus-small-expanded.png` | `focus-small-playing.png` | `focus-small-muted.png` |

- 320 / 390 / 1440 均无横向滚动；展开后判断按钮在 tab 上方。
- 手机 `100dvh` + safe-area；桌面内容 720px 居中，背景满屏白。

## 人工复核

- 在真实浏览器（非 headless）打开，确认首次交互后片段有声、发音有声；
  headless 用 `--autoplay-policy=no-user-gesture-required`，不能替代真机解锁。
- 点歌词只重播片段；点单词只发音；两者都不展开词义。
- 静音后刷新，静音状态仍在；取消静音后刷新，仍有声。
- 50 张走完，最后一张判断后停住；点重播图标回到 01/50。

## 旧壳证据

- 保尸 tag：`checkpoint-pre-ammo-20261024`（tag `87375de` / commit `a293fca`）。
- 器官迁移：`46a7750`；旧壳 smoke 12/12，见 `docs/evidence/step2-smoke.txt`。
- 删旧壳：`1ef7ece`；旧组件、旧 CSS、旧导航稿均在 `docs/archive/`。
