## Why

Buildr 当前把 Project/Service 的稳定来源身份与 `projects/<code>`、`services/<code>` 固定物化路径绑定，并把 Doctor 的聚合 `health.ready` 容易解释为整个 Workspace 的工作许可。这既阻止已有外部仓库以真实 topology 加入治理，也会让无关 Runtime、Component、Command 或可选资产问题扩大为不必要的全局阻塞。

现在需要在不削弱路径、Git、ownership、完整性和事务硬边界的前提下，建立可兼容的 Workspace 来源模型与动作局部诊断，使默认 managed layout 继续可用，同时允许用户明确附接既有仓库。

## What Changes

- 为 Project 与 Service source 增加显式 `managed` / `attached` topology 和稳定 source identity；默认创建仍落在 Workspace managed root，既有 v2 registry 保持兼容读取与显式收敛。
- 允许 registry 指向用户明确选择的外部 Attached Root；只读 inspect 不要求 Buildr ownership，任何 reconcile、sync、move、copy 或 delete 必须按 action 与 owner 单独授权并验证真实 filesystem/Git identity。
- Doctor 输出 Workspace、Project、Service、Git、Runtime、Component、Command、Capability 等分域 health，并为 finding 标注 domain、affected actions 与 ownership unit；总体 health 只用于摘要，不再是通用工作许可。
- Workspace sync、Capability consumer 与 Component 操作只消费与当前 action 相关的 findings；optional 或 foreign-owner 局部冲突保留原对象并报告，不阻塞无关 ownership unit。required Core、共享 manifest/transaction、identity 歧义、路径逃逸、完整性和安全删除仍 fail closed。
- 不自动复制、移动、接管或删除 Attached Root，不根据目录形状猜测 repository boundary，不新增第二套 registry authority。

## Capabilities

### New Capabilities

- `workspace-source-and-local-diagnostics`: 定义 Managed Root、Attached Root、稳定来源身份、动作局部 health 与 ownership-unit 收敛的跨域契约。

### Modified Capabilities

- `project-registry`: Project source 从固定物化路径扩展为兼容的 managed/attached topology，并保持创建、修复与 mutation 的 ownership 边界。
- `service-asset-indexing`: Service registry 支持 managed/attached source，manifest location 与 Service materialization root 分离。
- `agent-readable-doctor`: Doctor 增加分域、affected action 与 ownership-unit 诊断，取消聚合 `health.ready` 的通用许可语义。

## Impact

- 影响 `projects/manifest.yml` 与 Project `services/manifest.yml` 的 Domain、parser/renderer、兼容 migration 和 Application read/write model。
- 影响 Project/Service create、inspect、sync、Doctor scope discovery、Git observation、Environment/worktree source resolution及相关 HTTP/CLI JSON projection。
- 影响 Doctor finding/result model，以及 Capability、Component、Workspace sync 对诊断结果的消费方式。
- 不新增外部依赖；不改变 Workspace SQLite authority；不授权自动迁移、移动、复制、接管或删除外部仓库。
