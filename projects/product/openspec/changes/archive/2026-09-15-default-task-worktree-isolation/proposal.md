## Why

当前任务分流技能（task-triage）允许直接在主开发分支修改，却没有明确隔离条件，导致并发任务共用未提交文件并影响后续集成。用户已确认持久文件改动默认隔离，只有明确要求在主开发分支修改时例外。

## What Changes

- **BREAKING**：受版本管理的持久文件首次修改前，默认创建或复用当前任务的独立工作树（Worktree）；代码、文档、配置、技能（Skill）和 OpenSpec 材料一并覆盖。
- 保留 `task-worktree` 管理创建、检查和安全清理；任务分流技能（task-triage）负责选择执行位置并交接。
- 用户明确要求主开发分支修改时仍核对归属与覆盖风险；已有授权持续有效，不因阶段切换重复询问。
- 主目录的无关未提交内容不阻止从已确认提交创建新位置；无法隔离只停止依赖该位置的文件写入。
- 同步 OpenSpec 本地补充、现有检查及相关解释文档，不修改上游技能（Skill）正文。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`：明确持久文件写入前的默认隔离、复用、用户例外和局部失败边界。

## Impact

修改随包技能（Skill）、OpenSpec 本地补充、工作流规范、相关文档和现有检查。现有命令、能力契约（Capability Contract）、依赖绑定、数据库和工作树（Worktree）底层实现保持不变。只读调查及任务记录写入无需创建工作树（Worktree）。
