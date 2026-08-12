## Why

Task Record、Parent/Child、Task Development、Review、Verification 与 Local App 动态投影已经以 Workspace SQLite 和各专业 Application 为当前 authority；现有静态 `task-board` 生成链没有不可替代 consumer，却继续要求 Agent 在 HTML 中维护 `batches`、`dependencyPool`、进度、决策和证据摘要，形成易陈旧的第二份协调事实。现在需要在 authority 收敛完成后清退这套未形成真实消费价值的能力，并消除 canonical specs、Roadmap 与当前产品说明之间的冲突。

## What Changes

- **BREAKING**：停止发布和路由 optional builtin `task-board`，删除 `buildr.task-board-maintenance/v1` contract、provider、binding、Task Triage Board 分支、静态 HTML template 及专属 static/contract/upgrade verification。
- 删除 `task-cockpit → task-board` 的未发布 replacement 声明、专属 upgrade tests 及其当前 canonical requirements；通用 builtin replacement 机制继续服务 `git-operations ← git-ops` 等真实 consumer。不再创建新的 `task-boards/*.html` 或 `task-cockpits/*.html`。
- 保留 `projects/product/openspec/knowledge/task-boards/*.html` 与 `projects/product/openspec/knowledge/task-cockpits/*.html` 的原路径和原内容，把它们仅视为历史知识，不迁移、不重写、不删除。
- 以普通 Task + Parent/Child + Local App 动态投影作为当前协调入口；不新增 Board Domain、Board ID、writer、状态机、数据库表、依赖图、排序、分组或 Local App Board 页面。
- 更新产品说明、文档索引与任务生命周期架构讨论稿：Parent Task 标记为已交付，P1.1 Structured Task Board 继续保持“真实缺口出现后才触发的有限探索”。
- retained runtime sync 后移除 workspace/runtime 中的 `task-board` 投射与 receipt，并用 Doctor 证明 capability graph 和 runtime 已收敛。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-task-workflows`：移除 Task Triage 的 Board tracking 决策与 provider 路由，任务跟踪回到普通 Task/Parent/Child 和对话汇报。
- `buildr-package-assets`：从 package、workspace baseline、bootstrap、runtime 与 static validation 中移除 Task Board Skill、contract 和 binding。
- `buildr-product-capability-sync`：删除 `task-cockpit → task-board` replacement/restore/upgrade 行为，不再为未发布旧版本维护专用兼容路径；保留有真实 consumer 的通用 builtin replacement 行为。
- `buildr-development-openspec`：停止把 `task-boards/` 作为可新建 task-scoped working knowledge；只保留现有历史 HTML 不受产品升级改写的边界。
- `current-knowledge-maintenance`：把现有 `task-boards/`、`task-cockpits/` 统一视为历史旁证，不作为 current knowledge 或可继续维护的任务事实。
- `task-board`：删除当前静态 Task Board 产品能力的全部 requirements。
- `task-board-maintenance`：删除 Board consumer/provider contract requirements。
- `task-cockpit`：删除旧名称路由与 replacement 兼容 requirements，仅由历史文件本身保留原文。

## Impact

- Product Project：canonical specs、current knowledge、产品说明、Roadmap 与文档索引。
- Buildr Service：package manifest、workspace Skill baseline、bootstrap contract、Product runtime Skill、static validation、verification registry 与专属 contract/integration/unit/runtime tests。
- Workspace/runtime：`skills/buildr/task-board`、`skills/contracts/buildr/task-board-maintenance/v1.md`、相关 manifest/binding、`.agents/skills/task-board` 与 projection receipt 在 retained sync 后删除。
- 不修改 Workspace SQLite schema、Task Record shape、Parent/Child 关系、专业 Application/read model、Local App 四视图或历史 HTML 内容。
