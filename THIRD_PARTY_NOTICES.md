# Third-Party Notices

Orangecy 的网站测试版使用了以下第三方数据/依赖。Folia（AGPL-3.0）仅作为阅读参考，本仓库不包含其代码。

## 1. english-vocabulary（词书数据）

- 项目：https://github.com/KyleBing/english-vocabulary
- 用途：生成 `public/wordbooks/{cet4,cet6,gaozhong}.json` 的词条、音标、释义、例句、近义词与真题句。
- 许可：BSD 3-Clause License
- 版权：Copyright (c) 2022-2026, KyleBing

完整许可文本随数据放在 `public/wordbooks/LICENSE-KyleBing.txt`。

## 2. @neteasecloudmusicapienhanced/api

- 项目：https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced
- 用途：网易云扫码登录、搜索、歌曲详情、歌词、播放地址。
- 许可：MIT
- 备注：非官方民间接口；平台授权需另行评估。
- 推荐池只在本机缓存“词 → 时间 → 一行歌词”的索引，不存完整歌词、不存音频；播放仍走原曲实时代理。

## 3. @yakult-green-tea/qq-music-api

- 项目：https://github.com/yakult-green-tea/qq-music-api
- 用途：本机 QQ 音乐 sidecar（扫码登录、搜索、歌词、播放地址）。
- 许可：MIT
- 备注：非官方社区接口；登录态只存本机，播放权限仍取决于 QQ 账号。

## 4. kugoumusicapi

- 项目：https://github.com/MakcRe/KuGouMusicApi
- 用途：酷狗设备注册、搜索、歌词解码和免费曲播放地址（以 GitHub tag v1.6.0 安装）。
- 许可：MIT
- 备注：社区非官方接口；只注册本机设备，不保存酷狗用户账号。

## 5. 波点音乐协议重写

- 参考：`bodian-music-api` 0.1.2（AGPL-3.0）仅作只读协议参考。
- 本项目的 `server/providers/bodian.mjs` 是按需求独立重写的 Node 客户端；**没有安装、没有复制 AGPL 库代码**，也没有把它放进产物。
- 播放仅限中国大陆网络；真实账号播放需人工验证。
- `qrcode`（MIT）只用于生成本地二维码图片。

## 6. ts-fsrs

- 项目：https://github.com/open-spaced-repetition/ts-fsrs
- 用途：复习调度（M5 接入）。
- 许可：MIT

## 7. 前端依赖

React、Vite、Motion、zustand、lucide-react、express 等均为 MIT / ISC / Apache-2.0 许可，按 npm 依赖安装，不在此逐条复制许可全文；发布二进制或部署时应随构建产物保留相应许可声明。

## 8. Folia

Folia 与 `Orangecy-Folia-migrate` 为 AGPL-3.0。本项目只阅读其思路后重写，不包含、不复制、不安装其代码；`bodian-music-api` 与 `@applemusic-like-lyrics/ttml` 也没有进入依赖。
