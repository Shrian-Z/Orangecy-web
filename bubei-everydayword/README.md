# 每日单词量 · 不背单词行为重建

这是一个不依赖原 App 代码的独立实现：把「不背单词」的**每日新学配额、今日剩余、完成判定、进度、预计完成、分组、超额学习、复习量**拆成纯逻辑，并附一个可交互的网页演示。

- 行为规格：[`SPEC.everydayword.md`](./SPEC.everydayword.md)
- 核心实现：[`src/everyday.ts`](./src/everyday.ts)
- 逻辑测试：[`test/everyday.test.ts`](./test/everyday.test.ts)（25 个用例）
- 浏览器冒烟：[`test/demo-smoke.mjs`](./test/demo-smoke.mjs)（19 项检查）
- 网页演示：[`demo/index.html`](./demo/index.html) + [`demo/app.ts`](./demo/app.ts)
- 30 天模拟：[`demo/everyday-demo.ts`](./demo/everyday-demo.ts)
- 截图：[`demo/screenshot.png`](./demo/screenshot.png)

## 运行

需要 Node 22.18+（本机 Node 26，使用内置 TypeScript 类型剥离）和本机 Chrome。

```bash
cd bubei-everydayword

npm test          # 25 个逻辑用例
npm run typecheck # tsc --noEmit
npm run build     # Vite 构建到 dist/
npm run smoke:demo# 起临时静态服务 + 无头 Chrome，跑 19 项检查
npm run demo      # 30 天模拟，打印每日额度/ETA/漏学/超额
npm run check     # typecheck + test + build + smoke
```

`npm run smoke:demo` 默认使用
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，可用 `CHROME_PATH` 覆盖。

## 核心结论（与 SPEC 一致）

1. **每日新学是用户选的固定配额**，不是按截止日期反推的。
   候选值：`5,10,…,100,120,140,160,180,200`，默认 10。
2. **学习日从本地 04:00 开始**；03:59 仍算前一天，04:00 起归零。
3. 今日剩余新词：

   ```
   min( max(每日配额 − 今天已首次学会, 0), 当前词书剩余未学 )
   ```

   主词书与配套词书各算一份，再相加。

4. **漏学不补额度**：第二天仍是同一个配额，只是 `剩余` 没减少，预计完成日期后移。
5. **剩余是硬上限**：配额 100、剩余 3，今天最多学 3。
6. 今日进度分母 = `min(max(配额, 已学), 已学 + 剩余)`：
   已超额时分母跟着已学走；剩余不足时分母缩到“今天实际能学到的总数”。
7. 预计完成 `ceil(剩余 ÷ 每日配额)` 天，配套取较大天数；没有保存截止日期。
8. 一组 = `min(今日额度, 学习节奏)`；默认节奏 10；一天可以有多组。
9. 配额完成后可「再学一组」超额学习：不改变配额，只增加后续复习压力。
10. 复习量由 SRS 到期决定，不占新学额度，也没有观察到用户可设的每日复习上限。

## 实现结构

```
bubei-everydayword/
├── SPEC.everydayword.md     行为规格（输入/输出/边界/验收）
├── src/everyday.ts          纯逻辑 + EverydayStudy 状态机
├── test/everyday.test.ts    24 个 node:test 用例
├── test/demo-smoke.mjs      Playwright + 静态服务
├── demo/
│   ├── index.html           交互演示
│   ├── style.css
│   ├── app.ts               DOM 绑定
│   ├── everyday-demo.ts     30 天 CLI 模拟
│   └── screenshot.png
├── vite.config.ts
└── package.json
```

`src/everyday.ts` 不依赖 React、DOM、数据库或 SRS 库；`EverydayStudy`
只负责“跨天归零 / 今日已学 / 今日额度 / 快照”，可以直接嵌到别的应用里。

### 主要 API

| 函数 / 类 | 作用 |
|---|---|
| `studyDayOf(now)` | 04:00 学习日 |
| `nextStudyDayStart(now)` | 下一个学习日边界 |
| `normalizeDailyNew(n)` | 归一到合法档位，非法落 10 |
| `computeQuota(plan, learned, remaining)` | 主/配套/合计今日额度 |
| `isPlanDone(plan, learned, remaining)` | 今日计划完成 |
| `isAllLearned(plan, remaining)` | 全书学完 |
| `planProgress(plan, learned, remaining)` | 今日进度与分母 |
| `estimateFinish(plan, remaining, now)` | 预计完成天数/日期 |
| `splitSessions(total, groupSize)` | 按节奏切组 |
| `nextNewSession` / `nextReviewSession` | 下一个新学/复习会话 |
| `extraSessionSize` | 超额一组大小 |
| `EverydayStudy` | 有状态的小机器（跨天、去重、快照） |

## 演示里可以手动验证

- 改「每日新学」：今日额度立刻重算，已学不清零。
- 改「学习节奏」：下一组按新节奏，当前组不变。
- 点「学习一组」：额度按组减少；到 0 出现「再学一组」。
- 点「再学一组」：已学超过配额，进度分母变成已学数。
- 点「复习一组」：到期数减少，新学额度不变。
- 切「自由学」：额度等于全部剩余，没有 ETA。
- 切「学习日 03:59 / 04:00」：看到跨天归零；配额不累加。

## 证据与限制

完整证据锚点见 SPEC §0。结论来自 Objective-C 元数据、arm64 反汇编、字符串和常量；**没有**做真机点击或抓包，因此：

- 服务端是否二次修正配额、跨设备如何同步今日已学：未知。
- 计划创建当天早些时候学过的词是否抵扣新计划额度：**推断为是**，未运行验证。
- 标熟/太简单是否计入 `今日已学`：未完全确认。
- 每日复习是否存在隐藏上限：未发现设置项，服务端未知。
- 学习节奏的完整候选值：只确认默认 10 与存储字段。

这些限制不影响核心公式与边界用例；实现中对不确定处只采用规格里标注为“观察”的行为。

## 与不背单词的关系

本项目是**行为重建**，不包含、不翻译原 App 的代码或资源，也不修改原 App。所有公式和边界均来自公开可观察的二进制行为，用于学习和独立实现。
