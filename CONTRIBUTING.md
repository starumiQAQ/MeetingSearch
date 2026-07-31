# 贡献指南

感谢参与 MeetingSearch。本文说明如何在本地开发、提交改动，以及如何与本仓库的议题流程对齐。

## 开始之前

1. 阅读根目录 [`README.md`](./README.md)（运行方式与 API）。
2. 阅读 [`CONTEXT.md`](./CONTEXT.md) —— 领域用语以该文件为准（Participant、Brand、Branch、Ranking、Proximity objective 等）。写 issue、PR、测试名和注释时请使用这些术语，不要随意换同义词。
3. 若改动触及地图提供方、本地 UI、浏览器地图或服务设置，请先扫一眼 [`docs/adr/`](./docs/adr/) 中相关 ADR；若方案与已有 ADR 冲突，请在 PR 里明确写出并说明理由。

## 开发环境

需要 Node.js（建议与当前 LTS 接近的版本）与 npm。

```bash
npm install
npm start
```

浏览器打开 http://localhost:3000。

- 未配置高德凭证时，应用使用 demo MapProvider（无外网、内置示例 Branch）。
- 需要真实 geocode / POI / 驾车 Distance 时，用页面顶部的「服务设置」填写 `AMAP_KEY` 等，或复制 `.env.example` 为 `.env` 后填写。`.env` 已被 gitignore，**不要提交密钥**。
- 修改 JS 地图相关凭证后需刷新页面。

**安全提示**：服务设置接口无鉴权。不要把该进程暴露到公网（见 ADR-0004）。

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm start` / `npm run dev` | 启动本地服务 |
| `npm test` | 跑单元 / 接口测试（Vitest） |
| `npm run test:watch` | 监视模式 |
| `npm run typecheck` | TypeScript 检查（`tsc --noEmit`） |

可选的高德联调冒烟（会打真实网络）：

```bash
AMAP_LIVE=1 npx vitest run tests/amap-live.smoke.test.ts
```

默认 CI / 本地提交前只需保证 `npm test` 与 `npm run typecheck` 通过；联调测试不作为常规门槛。

## 代码与测试约定

- 语言：TypeScript（`strict`），入口在 `src/`，测试在 `tests/`。
- 地图能力走 `MapProvider` 抽象；单元测试应 mock HTTP / provider 缝，避免依赖真实网络。
- 领域行为（Candidate set 并集与去重、两种 Proximity objective、Empty candidate set、默认半径、geocode 唯一/歧义/空结果等）优先用 seam / 集成向测试覆盖。
- 前端目前是 `src/public/` 下的静态页；改动 UI 时保持现有交互路径（Participant 地址 → geocode → Ranking），不要引入未约定的新依赖，除非 PR 里说明必要性。
- 提交信息写清「为什么」；若对应 GitHub issue，在描述或提交中引用 `#编号`。

## 议题与标签

议题在 GitHub Issues 上跟踪。常用分流标签：

| 标签 | 含义 |
|------|------|
| `needs-triage` | 待维护者评估 |
| `needs-info` | 缺少信息，等待补充 |
| `ready-for-agent` | 规格已够清楚，可由 agent 接手 |
| `ready-for-human` | 需要人工实现或判断 |
| `wontfix` | 不处理 |

提 bug 时请尽量写清：复现步骤、期望行为、实际行为、是否使用 demo 还是真实高德、相关配置（勿贴密钥）。提功能时请用 `CONTEXT.md` 中的词汇描述目标与边界（例如 Empty candidate set 不应静默扩大半径）。

## Pull Request

1. 从最新的默认分支拉出主题分支。
2. 保持改动聚焦；无关重构请另开 PR。
3. 本地跑通：

   ```bash
   npm test
   npm run typecheck
   ```

4. PR 描述建议包含：
   - **动机**：解决什么问题 / 对应哪个 issue
   - **做法**：关键改动点（涉及领域概念时用 glossary 用语）
   - **验证**：你跑过的命令与手动检查步骤
   - **ADR**：若违背或补充已有决策，写明编号与原因

5. 不要在 PR 中包含 `.env`、真实 API Key、或其他本地密钥文件。可更新 `.env.example` 的占位说明。

## 文档

- 用户向说明：更新 `README.md`。
- 领域术语变更：更新 `CONTEXT.md`（必要时配合新 ADR）。
- 架构 / 产品级取舍：在 `docs/adr/` 新增 ADR，而不是只写在 PR 评论里。

## 问题？

不确定术语或行为边界时，以 `CONTEXT.md` 与相关 ADR 为准；仍不清楚可开 issue（标 `needs-triage`）讨论后再动手。
