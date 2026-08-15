## Why

Buildr 当前只把 npm Registry 的单一版本解释为“可用更新”，用户无法同时知道 GA 正式版与 RC 候选版是否更新，也无法明确选择本机 Buildr 要跟随哪个发布轨道。需要形成一份统一、简单的版本发布感知结果，并通过 CLI、Doctor、Buildr Web 与 Agent 完整通知用户。

## What Changes

- 新增统一的版本发布感知（Release Awareness），同时读取 npm `latest` 与 `next`，分别投影为 GA 正式版与 RC 候选版。
- `buildr update check` 同时展示当前版本、GA、RC 与可选动作；`buildr update --track stable|candidate` 只更新用户明确选择的轨道，不自动切换、不自动降级。
- Doctor 增加非阻断的版本通知；Registry 查询失败不进入 Workspace findings、repair plan 或 readiness。
- Buildr Web 在全局顶部显示 GA/RC 更新提示，首版只提供“交给 Agent”与复制更新命令，不直接执行 npm 更新。
- Buildr Product Skill 在完整检查 Buildr 时读取结构化版本结果，主动告知用户并请求其选择 GA 或 RC。
- 在用户级 Buildr Data Root 保存最小检查与通知状态，避免 CLI、Doctor、Web 与 Agent 反复提醒；不写入 Workspace。
- 发布工作流同时回读 `latest` 与 `next`，保证 RC 发布只推进 `next`、GA 发布只推进 `latest`，并拒绝版本类型与 tag 语义不匹配。
- **BREAKING**：`buildr update check --json` 从单一 `available.version` 升级为 `buildr.update-check/v2` 的双轨道结构；`buildr update --json` 同步升级为 `buildr.update/v2`。

## Capabilities

### New Capabilities

- `release-awareness`: 定义 Buildr 对 GA 正式版与 RC 候选版的双轨道观测、显式用户选择、非阻断多入口通知、用户级提醒状态，以及 CLI、Doctor、Web 和 Agent 之间的一致语义。

### Modified Capabilities

- `buildr-cli-self-update`: 增加双轨道检查和显式 `--track` 更新行为，同时保持 npm/development 来源与 Workspace 更新边界。
- `npm-cli-package`: 让 npm 自更新和发布自动化遵守 `latest → stable`、`next → candidate` 的双轨道契约。
- `agent-readable-doctor`: 增加不影响 findings、repair plan 与 readiness 的 release awareness 投影。
- `local-workspace-application`: 为 Buildr Web 提供全局只读版本发布感知 API，不引入 npm 更新写入口。
- `local-app-web-client`: 在 Buildr Web 全局壳层展示 GA/RC 通知和 Agent/复制命令动作。
- `product-agent-skills`: 让产品入口 Buildr Skill 在完整检查时主动解释两个发布轨道并请求用户决策。
- `public-json-contracts`: 定义 `buildr.update-check/v2`、`buildr.update/v2` 与 Doctor additive release awareness 字段。
- `open-source-release-governance`: 发布前后同时核验两个 npm dist-tag 及其 GA/RC 类型和非目标 tag 不变性。

## Impact

- Product OpenSpec、glossary、Buildr Service current knowledge 与发布流程说明。
- `product/buildr` 的 Release Awareness Application、CLI update、Doctor、Buildr Web HTTP API、用户级 Data Root 状态和发布脚本。
- `product/buildr-web` 的全局应用壳、API 类型、提示交互与正式 `web-dist` 构建产物。
- 产品入口 Buildr Skill 的检查与用户决策说明。
- CLI/JSON、Doctor、HTTP、前端、Skill 与 release workflow 的单元、系统、契约和浏览器验证。
- 不增加外部运行依赖，不修改 Workspace、Workspace Node、Agent runtime 或 npm/GitHub 发布状态。
