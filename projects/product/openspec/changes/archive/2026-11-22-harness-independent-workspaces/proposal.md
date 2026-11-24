## Why

当前仅本机目录来源（`harness-local`）由 Buildr Harness 内置解析；所有登记在 `workspace-registry.json` 中的本机 Buildr 工作空间以及默认工作空间（`@default`）都强依赖 Buildr Development 进程保持在线并经实时宿主回调才能返回名称与目录位置。一旦 Development 未启动、处于自举重启过程，或因启动期宿主连接未重连/回调超时而断连，独立 Harness 中的已有工作空间会全部退化为“来源离线”，无法新建对话、续发对话、自动恢复中断执行或打开右侧对话工作区。

工作空间的名称、标识与本机目录位置属于共享数据域内的基础执行范围事实，而非只能在 Development 进程内持有的私有状态；将其收敛为 Harness 可独立读取与核验的内置本地工作空间能力，同时修复 Development 启动路径的宿主保活重连与 Harness 启动恢复阻塞，才能彻底消除两产品之间的非必要耦合。本次变更不涉及破坏性数据迁移或公开 HTTP 路径删除。

## What Changes

- **Harness 内置本机工作空间解析**：在 `buildr-harness` 新增独立的本机工作空间权威读取器，直接从同一数据域的 `workspace-registry.json`（含受限预览的共享只读列表）与工作空间元数据（`.buildr/workspace.yml` 及旧版 `skills/manifest.yml`）以及 `@default` 目录发现工作空间名称、路径，并按同一文件系统身份摘要算法核验目录与符号链接；不在 `buildr-harness` 中导入 Development 模块。
- **离线可用与目录去重**：当 `buildr` 宿主回调不在线时，已登记在本机配置域中的工作空间与 `@default` 在 `/scope-catalog` 中仍可解析为内置可用状态（`builtin`），支持在独立 Harness 中新建对话、继续对话、自动恢复中断执行以及使用右侧对话工作区；通过独立 Harness 添加本机目录时若命中同一已登记工作空间目录，则直接复用已有工作空间身份而非创建重复的 `harness-local` 登记。未在本机登记且无实时宿主回调的外部范围及需要核验的业务工作对象（`verifyWorkObject`）仍按宿主不可达或能力受限拒绝。
- **独立网页作用域键对齐与双侧重连/恢复韧性**：在 `buildr-harness-web` 统一对 `buildr` 历史裸标识与 `scope:...` 标识的规范键转换及默认选择逻辑；在 `buildr` 的 `AGENT_SERVICE_APPLICATION.start()` 接通宿主保活重连定时维护，在 `buildr-harness` 轻量化 `recoverInterrupted()` 扫描并放宽 `/host/attach` 握手超时，避免大库恢复阻断宿主登记。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `harness-host-integration`: 允许 Harness 在不依赖 Development 进程在线的情况下内置解析同一数据域的本机已登记工作空间与 `@default`，保留真实外部离线来源和业务工作对象核验的宿主不可达降级边界，并在目录登记命中同一工作空间时复用原身份。
- `harness-directory-workbench`: 明确 Development 未运行时，绑定本机已登记工作空间或 `@default` 的对话与新对话草稿仍可在右侧工作区直接解析目录并打开资源管理器或源代码管理，无需重复登记。

## Impact

- 影响服务与模块：`projects/product/services/buildr-harness`（`local-workspaces`、`directory-host`、`host-channel`、`server`、`client`、`conversation-repository`、`conversation-application`）、`projects/product/services/buildr-harness-web`（`workspace-scopes`、`HarnessApp`）、`projects/product/services/buildr`（`agent-service/module`）。
- 影响架构文档与代码地图：`projects/product/knowledge/docs/architecture/harness-products.md`、`projects/product/knowledge/code-map/harness-products.md`、`projects/product/knowledge/index.yml`、`projects/product/.buildr/knowledge-impact.yml`。
- 兼容与安全边界：保持 `buildr` 历史裸 scope ID、`@default` 与 `scope:` 编码格式兼容，保持 `verifyWorkObject`、任务状态和工程参与观察继续由 Development 拥有，不向程序凭据放开未授权目录路径。
