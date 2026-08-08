## Why

Task Environment 当前只准备候选 Buildr CLI 根的 npm 依赖，并把同一依赖探针复制到全部工作范围；当 `buildr-web/node_modules` 缺失或 lockfile 漂移时，Environment 仍可能错误返回 `ready`，导致正式前端构建和浏览器验证失败。

## What Changes

- 增加 Project 级 Task Environment Service 依赖声明，以显式 Service 图和 dependency roots 决定准备闭包，不扫描仓库猜测 package roots。
- 按 dependency root 独立使用 Workspace Foundation 的受管 Node/npm 执行 lockfile-specific `npm ci`，支持首次准备、部分恢复、幂等复用、漂移重装和逐根失败诊断。
- 将 Environment Receipt 升级为可审计的多 dependency-root current facts，并保留 scope-level 依赖聚合摘要；任一 required root 未就绪时整体返回 `blocked`。
- 让 CLI `inspect` 只读观察依赖缺失与漂移，让 Local App GET 继续只读取已保存 current，并展示多 dependency-root 状态。
- 更新 public JSON、SQLite current 兼容读取、CLI/Local App consumers、知识与测试，并加入真实 fresh worktree 中 `buildr` 与 `buildr-web` 双根准备及 `npm run build:web` 证明。
- **BREAKING**：Environment Receipt 与 Task Environment public result 的 schemaVersion 升级；旧 active Receipt 在下一次 `prepare` 前不得继续作为多依赖根 `ready` 证据。

## Capabilities

### New Capabilities

- `task-environment-dependency-declarations`: 定义 Project 如何为明确 Service 声明 Task Environment dependency roots 与跨 Service source-build 依赖。

### Modified Capabilities

- `task-environments`: 将单一候选 CLI 依赖探针扩展为逐根准备、观察、恢复与聚合语义。
- `cli-product-surface`: 更新 Task Environment inspect/read-current 与公开结果行为。
- `public-json-contracts`: 升级并覆盖多 dependency-root 的公开 JSON schema。
- `workspace-structured-data-store`: 让 SQLite Environment current 兼容读取旧 Receipt，并由显式 prepare 收敛到新 schema。
- `buildr-package-assets`: 同步交付新的 Task Environment schema、声明 reader、Local App projection 与使用说明。
- `product-source-layout`: 将Project级`task-environment.yml`登记为治理声明，而不是Package root。

## Impact

- 主要实现：`services/buildr/src/application/task-environment/`、Task Environment domain/repository、Project declaration reader、public JSON 与 CLI/Local App HTTP reader。
- 产品前端：`services/buildr-web/src/pages/task-detail/EnvironmentTab.tsx`。
- 产品声明：Product Project 的 Task Environment Service dependency declaration，明确 `buildr` source build 依赖 `buildr-web`。
- 测试与 fixtures：Task Environment unit/integration/system、Local App/browser smoke、package/static contract 与 fresh-environment journey。
- 不改变 Task Record authority、Git provider ownership、installed Buildr runtime dependencies，也不在 Product 根创建 package root。
