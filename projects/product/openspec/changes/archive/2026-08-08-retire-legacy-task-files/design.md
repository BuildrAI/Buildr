## Context

Workspace SQLite 已分别拥有 Task、Development、Review、Verification、Environment、Lifecycle 与 Finish 的 current facts。正常 Application 和 Local App 已不读取 `.buildr/tasks/`，但 `runtime.mjs` 在 sync 时仍调用旧 v1 receipt migration 与 Environment current file importer，相关 specs、capability contract、Skill 和说明仍保留旧 authority 兼容边界。本自举 Workspace 还保留一批已跟踪旧 YAML 与 ignored `environment.json`，造成“单一 SQLite authority”与实际资产边界不一致。

本 Change 是一次兼容入口退出，不是新的数据迁移。当前 retained Workspace 已证明 46 份旧 Environment Receipt 与 SQLite 完全一致，8 份没有 matching Task 且属于 inert legacy，0 份冲突或待导入。

## Goals / Non-Goals

**Goals:**

- 让正常 runtime 与 sync 都不再扫描或解析 `.buildr/tasks/`。
- 删除两条一次性 Task Environment migration 及其专用测试和静态契约。
- 让 Task Environment contract、Skill、CLI 和架构说明只指向 `workspace-sqlite:task-environment/<task-id>`。
- 从本自举 Workspace 的 Git tree 删除已退出的 Task YAML，并在集成后清理已核验的本机旧 Receipt。

**Non-Goals:**

- 不修改 SQLite schema、migration ledger、Task Domain 或 lifecycle Application API。
- 不增加自动递归删除、清理数据库、retention 状态、第二 writer 或通用文件清理框架。
- 不让 sync 修改 Git index、删除未知用户文件或清理其他 `.buildr/` 内容。
- 不移除 `/.buildr/tasks/` ignore 规则；它继续作为旧 Workspace 的升级兼容护栏。

## Decisions

### 1. 删除 importer，而不是保留永久 no-op compatibility branch

`task_environment_current` 已由连续 SQLite migration 建立，所有正常 writer 和 reader 都直接使用 current row。继续保留任一 migration reader 会让 sync 永久依赖已退出的 authority，并让旧文件继续具备潜在输入语义。因此删除 `legacy-migration.mjs`、`current-migration.mjs`、runtime 注册/调用和相关测试，不提供 fallback。

备选方案是保留 importer 但在当前 Workspace 清空目录。该方案仍会把不存在的文件路径保留为产品契约，无法完成单一 authority 的边界收敛，因此不采用。

### 2. 产品不自动删除用户 Workspace 的旧目录

sync 只停止消费旧目录，不承担通用 filesystem cleanup。自举 Workspace 的已知历史文件作为本 Change 的精确 Git 删除交付；ignored Receipt 只在 retained Workspace 集成并再次核验 SQLite 后执行一次本机受控清理。其他 Workspace 即使仍有旧目录，也只把它当 inert local bytes，由 Workspace owner 决定删除。

备选方案是在 sync 中递归删除 `.buildr/tasks/`。这会扩大为未知文件 ownership、symlink、Git index 和恢复策略问题，不符合窄 Change，也可能删除用户保留内容，因此不采用。

### 3. 保留 broad ignore 作为兼容护栏

`/.buildr/tasks/` ignore 不创建目录，也不构成 authority。保留它可以避免升级后仍存在的本机遗留文件突然出现在 Git status，且无需让 sync 探测或修改 Git index。文档会明确它只是 inert legacy 的兼容护栏。

### 4. 只改动仍声明 importer/文件 authority 的权威资产

delta specs 删除 `task-environments` 与 `workspace-structured-data-store` 中的一次性 migration Requirements，并更新 package verification 只覆盖当前 Environment authority。Task Record、Development、Review 和 Verification 中“若旧文件存在则忽略”的负向约束可以继续保护 reader，不要求文件必须存在，也不阻塞本次删除。

## Risks / Trade-offs

- [仍未升级到 SQLite Environment current 的旧 Workspace 将失去文件导入路径] → 作为明确 BREAKING 兼容退出；当前版本线已完成 migration，release note/Brief 说明升级前应先使用仍含 importer 的版本完成 sync。
- [其他 Workspace 的旧目录不会自动消失] → 保持 ownership 安全；目录已无读取语义，维护者可在确认 SQLite current 后自行删除。
- [删除 ignore 会让旧文件污染 Git status] → 本 Change 明确保留 broad ignore。
- [过期文档或 Skill 继续引导 Agent 读文件] → 同步修改 capability contract、source Skill、package/runtime 投射来源和实现型文档，并由静态/package 测试覆盖。

## Migration Plan

1. 在仍含 importer 的 retained baseline 上确认当前 Workspace migration 为 0 待导入、0 冲突。
2. 删除两条 migration 的 runtime 注册、sync 调用与专用测试，更新 specs、contracts、Skills 和说明。
3. 删除 Git 已跟踪的历史 Task YAML；保留 broad ignore。
4. 完成 Change strict validation、受影响测试、正式 Verification 和 Finish。
5. 集成并激活 retained runtime 后，再次只读核对 SQLite 与旧 Receipt；仅对本 Workspace 使用可恢复方式移除 `.buildr/tasks/` 剩余 ignored bytes。

回滚只需恢复本 Change 的源码与文档；SQLite schema 和数据不发生变化。已删除的本自举历史文件可从 Git 历史恢复，本机 ignored bytes 若已移入废纸篓可从废纸篓恢复。

## Open Questions

无。
