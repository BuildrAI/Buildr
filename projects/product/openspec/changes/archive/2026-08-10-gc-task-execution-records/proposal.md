## Why

Task Execution Record 已有固定 retention、eligibility 与单记录 cleanup，但缺少 Workspace 级批量选择和自动触发，因此到期正文与 tombstone 不会形成完整回收闭环。正式 Local HTTP Server 适合作为本地定时维护宿主，同时 Task Preview Server 必须保持无后台 mutation，避免测试与预览产生不可预期的数据变化。

## What Changes

- 为 Task Execution Record 增加 Workspace 级 ExecRecord GC，支持 dry-run、bounded batch、单次互斥与结构化结果。
- GC 复用既有 retention、resolution、recent-count、cleanup CAS 和正文 Store，只自动清理 eligible 正文，不扫描文件系统、不推断 open record 已死亡，也不自动处置失败记录。
- 删除超过固定期限且不再受 recent-count 保护的 cleaned tombstone metadata；不新增 GC 表、队列或第二 authority。
- 增加 `buildr task execution-record gc` 手动/headless CLI 入口。
- 正式 Local HTTP Server 启动 Workspace 级整点调度器；Task Preview Server 明确不注册、不触发任何 scheduled maintenance。
- Workspace Doctor 保持只诊断 Workspace source/runtime，不检查或修复 execution record 业务数据。
- 不包含破坏性变更；现有 producer、单记录 cleanup、Local App API 与 Task Preview 行为保持兼容。

## Capabilities

### New Capabilities

<!-- 无新增 capability；本 Change 只扩展既有 Task Execution Record、Local HTTP Server 与公共 JSON 契约。 -->

### Modified Capabilities

- `task-execution-artifacts`: 增加 bounded Workspace GC、eligible 正文批量 cleanup 与到期 cleaned tombstone 删除契约。
- `local-workspace-application`: 增加仅正式 Local HTTP Server 启用的整点 scheduled maintenance，并明确 Task Preview Server 禁用。
- `public-json-contracts`: 登记 ExecRecord GC CLI 的稳定 portable JSON 结果与安全字段边界。

## Impact

- `product/buildr`：Task Execution Record Domain/Application/repository、CLI command registry、Local HTTP Server scheduler 与测试。
- SQLite：复用现有 `task_execution_records` 表；只增加 repository 查询/删除语句，不新增 migration 或 store。
- 正文：仅通过现有 owner-bound body cleanup 删除已证明 eligible 的精确 record directory，不做 discovery。
- OpenSpec/current knowledge：更新上述三个 capability 与 Buildr Service 的维护任务说明。
- `product/buildr-web` 与 C6 的读取/UI Change 不在本 Change 范围内。
