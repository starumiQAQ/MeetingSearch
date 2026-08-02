# 贡献指南

感谢你愿意参与 MeetingSearch。无论你是想报告问题、建议新功能、改进文档，还是提交代码，都可以从这里开始。动手之前，建议先读一遍根目录的 [README.md](./README.md)，了解这个项目是做什么的、怎么运行。

## 如何参与

- **报告 Bug**：发现功能不对或报错，按下面的说明开 issue。
- **建议功能**：有新的使用场景，先讨论清楚再实现。
- **改进文档**：README、API 文档、注释都欢迎修正。
- **提交代码**：修 Bug、补测试、实现讨论过的新功能。

## 提问与讨论

- 使用问题、行为疑问、设计讨论，请到 [GitHub Issues](https://github.com/starumiQAQ/MeetingSearch/issues) 发起或搜索是否已有相同话题。
- 新开的 issue 会先打上 `needs-triage` 标签，由维护者评估后再进入后续流程。
- 描述问题时请使用 [CONTEXT.md](./CONTEXT.md) 中的领域词汇（Participant、Brand、Branch、Ranking、Proximity objective 等），不要随意换同义词。

## 报告 Bug

请尽量提供以下信息，越完整越容易复现和定位：

- **复现步骤**：从启动服务开始，一步步写清楚；
- **期望行为与实际行为**：分别说明应该怎样、实际怎样；
- **数据来源**：使用的是演示模式还是真实高德数据；
- **环境**：Node 版本、操作系统、浏览器；
- **相关配置**：说明用到了哪些配置项即可，**不要粘贴密钥或 `.env` 内容**。

如果方便，附上截图、终端输出或错误信息。注意服务设置里保存的是真实凭证，属于敏感信息，不要在 issue 中泄露。

## 提出功能建议

- 先说明**使用场景和动机**：你想解决什么问题，现在的做法为什么不够好。
- 用 [CONTEXT.md](./CONTEXT.md) 的词汇描述期望行为与边界（例如“Empty candidate set 不应静默扩大半径”）。
- 较大的改动建议先开 issue 讨论再动手，避免实现方向与项目不一致。
- 如果建议涉及架构或产品级取舍，请说明它与 [docs/adr/](./docs/adr/) 中既有决策的关系。

## 开发环境

需要 Node.js（18 或更高版本，建议使用 LTS）与 npm。

```bash
npm install
npm start
```

浏览器打开 http://localhost:3000。

- 未配置高德凭证时，应用使用演示 MapProvider（无外网、内置示例 Branch），可以完整体验流程。
- 需要真实 geocode / POI / 驾车 Distance 时，在页面顶部的「服务设置」填写 `AMAP_KEY` 等，或复制 `.env.example` 为 `.env` 后填写。
- `.env` 已被 gitignore，**不要提交密钥**；修改 JS 地图凭证后需要刷新页面。
- 服务设置接口没有鉴权，不要把服务进程暴露到公网（见 [ADR-0004](./docs/adr/0004-service-settings-env.md)）。

### 常用命令

| 命令 | 用途 |
|------|------|
| `npm start` / `npm run dev` | 启动本地服务 |
| `npm test` | 运行单元 / 接口测试（Vitest） |
| `npm run test:watch` | 监视模式 |
| `npm run typecheck` | TypeScript 检查（`tsc --noEmit`） |

可选的高德联调冒烟测试（需要有效密钥，会发起真实网络请求）：

```bash
AMAP_LIVE=1 npx vitest run tests/amap-live.smoke.test.ts
```

本地提交前只需要保证 `npm test` 与 `npm run typecheck` 通过；联调测试不作为常规门槛。

## 提交代码

第一次贡献不知道从哪里入手？可以从补测试、改文档或处理讨论中已有共识的小问题开始。

1. 从最新的默认分支拉出主题分支，例如 `fix/empty-candidate-hint`。
2. 保持改动聚焦；无关的重构请另开 PR。
3. 本地跑通：

   ```bash
   npm test
   npm run typecheck
   ```

4. 提交信息写清「为什么」；如果对应某个 issue，在提交信息或 PR 描述中引用 `#编号`。
5. PR 描述建议包含：
   - **动机**：解决什么问题 / 对应哪个 issue；
   - **做法**：关键改动点（涉及领域概念时使用 [CONTEXT.md](./CONTEXT.md) 词汇）；
   - **验证**：你跑过的命令与手动检查步骤；
   - **ADR**：若与既有决策冲突或需要新增决策，写明编号与理由。
6. 不要在 PR 中包含 `.env`、真实 API Key 或其他本地密钥；如有必要，更新 `.env.example` 的占位说明。

## 代码与测试约定

- 使用 TypeScript（`strict`），源码在 `src/`，测试在 `tests/`。
- 地图能力走 `MapProvider` 抽象；单元测试应 mock HTTP / provider 缝，避免依赖真实网络。
- 领域行为（Candidate set 并集与去重、两种 Proximity objective、Empty candidate set、默认半径、geocode 唯一/歧义/空结果等）优先用 seam / 集成测试覆盖。
- 前端是 `src/public/` 下的静态页；改动 UI 时保持现有交互路径（成员地址 → geocode → Ranking），不要引入未约定的新依赖，除非在 PR 中说明必要性。

## 审查流程

- 维护者会 review 每个 PR，并可能要求修改；请把讨论留在 PR 评论中，便于追溯。
- 有分歧时，以 [CONTEXT.md](./CONTEXT.md) 与相关 ADR 为准。
- 如果 PR 长时间没有动静，可以在评论里礼貌提醒。项目由维护者业余维护，响应速度可能不快。

## 文档

- 面向用户的内容：更新 `README.md`。
- 接口说明：更新 `docs/api.md`。
- 领域术语变更：更新 `CONTEXT.md`（必要时配合新 ADR）。
- 架构 / 产品级取舍：在 `docs/adr/` 新增 ADR，而不是只写在 PR 评论里。

## 议题标签

维护者用以下标签分流 issue 与 PR：

| 标签 | 含义 |
|------|------|
| `needs-triage` | 待维护者评估 |
| `needs-info` | 缺少信息，等待补充 |
| `ready-for-agent` | 规格已够清楚，可由 agent 接手 |
| `ready-for-human` | 需要人工实现或判断 |
| `wontfix` | 不处理 |

如果被要求补充信息，请及时更新 issue，否则它可能一直停留在 `needs-info`。

## 行为准则

请友善、专业地参与讨论，尊重不同的经验和意见。本仓库暂时没有单独的 `CODE_OF_CONDUCT` 文件，所有互动都应遵守 [GitHub 社区准则](https://docs.github.com/site-policy/github-community-guidelines)。

## 许可证

本项目以 [MIT 许可证](./LICENSE) 开源。通过提交 PR，你同意你的贡献以与项目相同的 MIT 许可证发布（详见 [LICENSE](./LICENSE)）。
