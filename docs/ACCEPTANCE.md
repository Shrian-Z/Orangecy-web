# Orangecy 验收清单（弹药时代 · 2026-10-24）

更新日期：2026-10-24  
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
```

最近结果：

| 项 | 结果 | 证据 |
| --- | --- | --- |
| typecheck | PASS | 无输出 |
| check:cards | 484/484 | `docs/cards-check.json` |
| build | PASS | `dist/` |
| check:palette | 24 状态 0 违规 / 0 渐变 / 0 阴影 | `docs/palette-check.json` |
| smoke | 63/63 | 终端输出 |
| trace:audio | 13/13 | `docs/audio-trace.json` |
| shoot:focus | 3 视口 × 4 态 | `docs/screenshots/focus-*.png` |

## 产品验收

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
