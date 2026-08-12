## Why

Buildr 已能在一次验证运行内部限制并发，但多个 task environment 各自启动验证时会分别计数，仍可能同时争用浏览器、重型 Workspace fixture、Docker 或共享测试数据。现在需要让 Project 明确声明资源处理方式，并由验证执行器跨任务协调有限容量资源，才能真正支持并发开发下的独立验证。

本变更为兼容性增强：现有没有资源声明的 Project 和验证能力继续按原行为运行。

## What Changes

- Project `verification.yml` 可登记验证资源，并区分独立、命名隔离、容量协调和外部授权四种处理方式。
- 验证能力可显式引用资源；doctor 在执行前检查未知引用、无效容量、缺失命名变量、清理边界和授权冲突。
- Buildr 验证执行器为容量协调资源建立 Workspace 级、跨进程的任务归属租约；多个 task environment 共享容量，等待时间和持有身份进入验证证据。
- 独立或命名隔离资源不进入共享队列；命名隔离由执行器提供 task/run namespace。外部资源仍遵守显式授权，不由 Buildr 自动清理。
- 验证完成、失败或中断时只释放当前 run 持有的租约和 provider-owned 临时资源，不删除其他任务或外部资源。
- 不建立通用任务调度器，不调度 Agent 工作，也不把 Git worktree 描述为外部状态隔离。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `project-test-capabilities`: Project 验证声明新增资源目录、能力资源引用和四类处理策略。
- `task-verification`: 正式验证执行新增跨 task environment 的资源协调、等待证据、失效恢复和精确清理约束。

## Impact

- 影响 `verification.yml` 的向后兼容 schema 与 doctor 诊断。
- 影响 Buildr Product verification registry、DAG scheduler、process executor 和 timing evidence。
- 新增本机 Workspace/Git common-dir 下的临时资源租约；不进入 Git，不新增外部依赖。
- 需要更新 Project 验证声明示例、当前认知、验证测试和并发开发任务看板。
