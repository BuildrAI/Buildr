## Context

当前 Workspace SQLite 已维护 Task Record、Development、Review、Verification、Task lifecycle projection 与 Finish current state。Task Environment 现由 `task_environment_current` 保存完整 current Receipt，`task_lifecycle_current` 只保存跨专业摘要；历史 `.buildr/tasks/<task-id>/environment.json` 只在受控 sync migration 窗口作为输入，Local App 不依赖它。

本 Change 只替换 Environment 的本机持久化 authority，不改变 Task Environment 的 ready/blocked、scope、provider、Runtime/CLI/依赖/projection、动态资源或 cleanup 语义。SQLite 仍是每个 canonical Workspace 的 local-only single store，候选 runtime 不能写 retained store。

## Goals / Non-Goals

**Goals:**

- 以 SQLite `task_environment_current` 保存每个 Task 的完整 normalized Environment Receipt。
- 让所有 Environment mutation 在同一 current row 上实时更新，并在成功提交后维护 lifecycle summary。
- 让 CLI/Local App inspect 从 SQLite current 数据读取，不解析文件、不重新探测、不在 GET 中回填 projection。
- 通过连续 migration 和受控一次性导入安全接管现有 `environment.json`，保留失败现场。
- 保持 Environment Application 为唯一 writer，保持现有 retained/candidate provenance guard、WAL、foreign key、busy 和 integrity 边界。

**Non-Goals:**

- 不把 Environment 内容并入 `tasks`，不让 Task Record 保存环境 path、runtime 或 resource facts。
- 不把完整 Environment Receipt 复制到 `task_lifecycle_current`；该表仍是跨专业派生读模型。
- 不建设 Environment history/event/audit/scheduler、远端同步或第二数据库。
- 不迁移 Git worktree evidence；它继续由 Git common-dir 的 provider evidence authority 维护。
- 不在 Local App 增加 Environment mutation、后台订阅或独立缓存。

## Decisions

### 1. 用窄表保存完整 closed payload

新增 `task_environment_current`：

- `task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE`
- `status TEXT NOT NULL CHECK (status IN ('ready', 'blocked', 'cleaned'))`
- `receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json))`
- `updated_at TEXT NOT NULL`

`receipt_json` 保存 Domain normalize 后的完整 v2 Receipt，包括 scope、execution/validation roots、provider evidence 摘要、probe、resources、latest ready/cleanup 与 controller fingerprint。`status` 和 `updated_at` 只为 bounded query 与诊断提供索引字段，不形成第二份语义 authority；写入时必须与 payload 一致。

选择 JSON payload 而不是把 Receipt 拆成多张表，是为了保持 closed Domain schema、避免通用 key/value/history 模型，并让现有 normalize/identity 逻辑继续成为字段 authority。

### 2. Environment Repository 改为 SQLite Repository

`readTaskEnvironmentPersistence` 从 `task_environment_current` 读取并回读校验；`writeTaskEnvironmentPersistence` 在 `BEGIN IMMEDIATE` 中验证 Task、canonical root、Receipt identity、status transition 与 writer provenance，整值替换并写后读取。Application 继续是唯一 writer，CLI、Local App、Preview、Finish 不直接打开表。

Environment 的每个 prepare checkpoint、resource register/release、cleanup resource release 与 final cleanup 都复用同一 repository。文件仓储不再作为正常 runtime fallback；旧 `environment.json` 只在受控 migration importer 中读取。

### 3. Environment inspect 读取 current row

`inspect` 只从 SQLite Environment current row 生成公开 read model；它不执行 Git/provider/foundation/resource probe，不读取 `environment.json`，也不写 lifecycle projection。需要重新确认当前机器事实时仍使用正式 `prepare` 或授权的 `cleanup`，而不是让 Local App GET 隐式刷新。

`task_lifecycle_current.environment` 继续保存跨专业展示所需的 compact Environment result。Environment mutation 成功写入 current 后由同一 Application 立即更新该 projection；projection 缺失时 Environment 专业 reader 仍以 `task_environment_current` 为权威返回数据，不能从旧文件补回。两者不是第二份 Environment authority。

### 4. Migration 是一次性受控导入

连续 SQLite migration 只创建新表并记录 schema checksum。随后由 retained Task Environment manager 执行 workspace-scoped importer：枚举合法 Task Record 对应的 `environment.json`，逐个 normalize、校验 workspace/task identity，并在同一 SQLite transaction 写入 `task_environment_current`。没有 matching Task Record 的历史文件标记为 inert legacy，不导入、不删除且不阻塞其他合法 Task；路径越界、symlink、JSON/schema/identity 不合法或已有 current 冲突仍使整个导入 fail closed，不覆盖原文件。

导入 receipt 的 checksum/数量与结果写入受控 migration result，导入完成后新 runtime 不再读取旧文件。旧文件可由明确的后续清理动作处理；不能用“文件存在”作为 SQLite current 缺失时的 fallback。候选 validation store 从完整 migration chain 和 fixture importer 独立验证，不向 retained store 回灌。

### 5. Local App 保持 Application boundary

Local App Environment endpoint 仍只接受已登记 Workspace 与 Task ID，调用 Task Environment Application inspect，并使用 `no-store`。Web/HTTP 不直接执行 SQL，也不直接解析 SQLite JSON；“直接读取数据库”在产品边界上表示读取 SQLite-backed Environment Application current，而不是建立 Local App 第二 writer/reader。

公开结果继续返回 `buildr.task-environment-result/v1` 与 `status/observedAt/environment/diagnostic/nextActions`；持久化定位改为稳定 SQLite locator 或明确的 non-file persistence metadata，不再要求可访问的 `environment.json` path。

## Risks / Trade-offs

- [Risk] SQLite 损坏会同时影响更多 Task lifecycle 读取。→ 复用现有 migration ledger、foreign keys、WAL、bounded busy timeout、integrity check 与 fail-closed Doctor；不自动删除或重建数据库。
- [Risk] migration 导入旧文件时可能存在部分损坏或 ownership 不明。→ 先完整 inventory 和 identity 校验，再事务导入；任何冲突保留文件现场并阻止 cutover。
- [Risk] lifecycle projection 与 Environment current row 可能短暂不一致。→ Environment mutation 先以 repository transaction 提交 current，再由同一 Application action 立即更新 projection；projection 失败不影响 current authority，inspect 直接读取 Environment current row并返回可诊断结果。
- [Risk] 旧工具仍期待 `environment.json` path。→ 更新 CLI/JSON contract、Local App、package/static validation 和 tests；新 runtime 不提供隐式 file fallback。

## Migration Plan

1. 发布连续 SQLite migration，建立 `task_environment_current` 并扩展 Doctor/schema validation。
2. 在 retained controller 中执行受控 legacy import，导入所有可证明属于当前 Workspace 的 v2 receipts；冲突或损坏时零切换。
3. 切换 Environment Repository、Application inspect/mutation 与 Local App reader 到 SQLite。
4. 运行 migration、Environment lifecycle、Local App、candidate-store isolation、Doctor 与 package parity 验证。
5. 仅在 SQLite rows、lifecycle projection 和读路径验证通过后，把旧 JSON 标记为 inert legacy；不再由 runtime 读取、更新或双写。

回滚策略是保留旧 JSON bytes、migration ledger 与 SQLite backup；代码回滚不得在已有新 runtime 写入后自动把 SQLite current 反向覆盖回文件。若 cutover 未完成，保持 blocked 并由受控恢复流程决定，不猜测双写。

## Open Questions

- 是否在本 Change 内提供一个公开 `task environment migrate` 命令，还是把 importer 作为受控 workspace migration action 暴露给维护流程；实现前以现有 Buildr migration/Doctor 入口的最小公开面为准。
