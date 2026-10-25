# Orangecy 验收清单（v3 三槽导航 + 词汇导入 · 2026-10-25）

更新日期：2026-10-25
验收入口：`http://127.0.0.1:8787`（API + dist 同源）；`http://localhost:5173`（Vite）  
API：`http://127.0.0.1:8787`  
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
npm run accept:import   # 需要 server + 已登录网易；约 2.5 分钟
```

最近结果（2026-10-25 下午）：

| 项 | 结果 | 证据 |
| --- | --- | --- |
| typecheck | PASS | 无输出 |
| check:cards | 484/484 | `docs/cards-check.json` |
| build | PASS | `dist/` |
| check:palette | 36 状态 0 违规 / 0 渐变 / 0 阴影 | `docs/palette-check.json` |
| smoke | 80/80 | 终端输出 |
| trace:audio | 13/13 | `docs/audio-trace.json` |
| shoot:focus | 3 视口 × 4 态 | `docs/screenshots/focus-*.png` |
| accept:import | 66/66 | `docs/evidence/gaokao-import.json` |

## 词汇导入验收（2026-10-25）

一键命令：`npm run accept:import`。它用真实已登录网易会话跑完整 UI，不接受假数据。

- **入口**：词书选择页右上 `FileUp`（aria「导入词汇」）→ 导入 sheet；
  内置「高考 3500」预设 + 粘贴 / 文件入口。
- **词表**：`public/wordbooks/gaozhong.json` 全量 **3738** 词（3500 核心 + 238 扩展），
  全部导入且唯一；其中 **3059** 词从用户 20 个歌单的歌词里找到歌，
  **679** 词保留为纯词卡（TTS 发音，无歌词片段）。`3059 + 679 = 3738`，一个不丢。
- **歌单 / 歌词 / 可播**：扫描 **2613** 首（自建 / 喜欢全量 + 收藏每本前 300 首），
  **2521** 首有歌词，**1006** 首进入可播检查，**1005** 首可播并成卡；
  每张歌卡都有真实 1–2 句歌词、真实时间戳、目标 surface 在句内。
- **实听**：前 5 张卡逐一 `fragment-start` + `seek-check.passed` + `playing: true`，
  目标词高亮、歌词行点亮；5 次 review 写入 SRS，学习进度 `5 / 3738`，N 从 10 降到 5；
  刷新后书 / 进度 / N 均保留。
- **纯词卡**：无登录上下文粘贴 1 词 → 无歌词 / 无进度 / 无 seek，
  `data-plain="true"`，flip 后 `pronounce` 直出。
- **全量可播复核**：1005 首去重曲目逐一 `/api/song/:id/play`，**1005/1005 available**。
- **耗时**：约 148 秒（2613 首歌词 + 1006 首试听）。
- 截图：`docs/screenshots/import-entry.png`、`import-sheet.png`、`import-progress.png`、
  `import-done.png`、`import-home.png`、`import-card.png`、`import-reload.png`、
  `import-picker.png`、`import-plain.png`、`import-sheet-desktop.png`。

## 产品验收（历史 · 2026-10-24 弹药时代）

> 本节描述的是 v2 四 tab 时代；底栏与完成态已被 2026-10-25「三槽导航」取代
> （学习 / 歌单 / 我的；队列走完回学习首页）。保留作历史对照，现行以 `AGENTS.md` v3 为准。

1. **启动**：打开即一张卡，无 splash、无品牌语、无说明字。
2. **唯一业务屏**：只有学习卡；底部 4 个无字图标 tab；复习 / 词书空态，
   「我的」是音源连接页（也不展示曲库 / 账号资料）。
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


## 音源接回验收（2026-10-24）

### 第 1 步 · 无 UI 证明

- 复用本机已落盘网易会话 `03de4e`（`Shrian_`）：`/api/auth/status` 200，
  `loggedIn: true`。
- seed 3 个不同 trackId：

| trackId | 曲目 | play | lyric 行 | 首/末时间戳 |
| --- | --- | --- | --- | --- |
| 1850175684 | Counting Stars | `available:true` / 128k | 96 | 0.59 / 252.4 |
| 33187386 | Viva La Vida (Live) | `available:true` / 128k | 45 | 18.72 / 223.33 |
| 2619953693 | Yesterday Once More | `available:true` / 128k | 58 | 1.746 / 229.439 |

- 未登录对照也写了 `available/reason`；这三首免费曲未登录同样可播。
- 证据：`docs/evidence/auth-step1.json`。

### 第 2 步 · 我的 · 添加

- 空态：右上 Plus + 居中 User 图标；无可见文案。
- 选平台：四个图标（网易 / QQ / 酷狗 / 波点），无可见文案；四平台
  `qrKey` 实测都能生成二维码（`docs/evidence/platform-entry.json`）。
- 扫码：1.5s 轮询 `qrCheck`；803 后 `authStatus` 确认；已连接列表只显示
  平台图标 + 断开图标；断开走 `api.*.logout`。
- 截图：`docs/screenshots/my-empty.png`、`my-chooser.png`、`my-qr-live.png`、
  `my-connected.png`。
- 口径：二维码是唯一功能性图片豁免；不展示曲库 / 曲名 / 账号资料。

### 第 3 步 · 词卡可播

- 用本机已落盘网易会话实测 seed 前 5 张：
  **5/5 `seek-check.passed`，`playing:true`**；5/5 第二行歌词均正常点亮；
  1–4 同一曲目，第 5 张切到 Viva La Vida 仍可播。
- 证据：`docs/evidence/auth-ui-e2e.json`。

### 未完成 / 待人工

- 两次实时二维码在 240s 内没有收到手机确认，已过期；「经新 UI 真实扫码」
  仍需要手机确认。已连接态与 5 卡可播用本机已落盘会话验证。
- 断开按钮已接 `api.*.logout`；为保住已落盘会话，验收时未真正退出。

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
