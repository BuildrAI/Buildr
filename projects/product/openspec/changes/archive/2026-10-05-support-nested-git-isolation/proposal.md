## Why

非 Git 工作空间（Workspace）根内可以保存资料和独立 Git 代码库（Repository），但当前工作树（Worktree）规划与证据读取仍要求根自身属于 Git，合法的代码修改因此无法隔离。资料原地维护已经可用，本次补齐实际代码边界，才能让同一工作空间安全承接两类工作。

## What Changes

- 根确实不属于 Git 时，只为明确选择的独立代码库（Repository）规划工作树（Worktree），共享来源去重；保持已有 Git 根默认行为。
- 完整组证据仍保存在实际 Git 公共目录（Common Directory），采用确定性来源锚点；读取和代码查询共同发现证据，不新增持久索引。
- 检查、缺登记观察恢复和清理支持仅有子代码库（Repository）的完整集合，保留版本、身份、交付保全及删除安全。
- 任务提交和代码工作树（Worktree）查询读取同一完整证据；资料位置、开发预览适用条件及其他代码库保持各自边界。
- 无破坏性变更，不改公开证据格式、命令参数、远端引用政策或任务状态模型。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`：明确非 Git 根中的独立代码库（Repository）隔离、证据锚点、发现与观察恢复，缩小原有非 Git 目标缺证据诊断的适用范围。

## Impact

影响 Git 工作树提供者（Provider）、观察身份核验、任务提交来源查询、代码工作树（Worktree）目录查询及其内部依赖端口；维护现有 `task-worktree` 技能（Skill）、任务架构说明和代码地图（Code Map）。复用现有隔离执行器与真实 Git 生命周期测试，不新增依赖或前端交互，不涉及 DSH。
