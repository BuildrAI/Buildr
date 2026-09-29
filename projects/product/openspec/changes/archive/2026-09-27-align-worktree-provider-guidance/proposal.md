## Why

工作树（Worktree）的既有目录契约与宿主原生工具的创建入口被混用，导致同一任务出现不同位置；新任务命名又主动添加了并非必要的日期。需要把跨宿主的一致调用边界和默认命名写清，减少重复创建及错误清理。

## What Changes

- 新选择的任务标识（Task ID）默认使用简短、稳定的语义名称，不主动添加日期；保留已有标识及用户指定名称。
- 创建、检查与清理遵循当前有效能力绑定（Capability Binding）和既有资源身份；原生工具可用不构成替换授权，绑定变化不自动转移旧资源归属。
- 保留 `buildr.git-worktree-provider/v1`、`.worktrees/<task-id>` 和既有删除安全；不兼容时说明具体冲突、保留现场，只停止受影响动作。
- 校准任务说明，明确 OpenSpec 归档日期不改变工作树（Worktree）的名称或清理条件。
- 无破坏性变更：不修改命令、标识合法格式、返回结果、能力绑定或已有目录，不新增宿主适配实现。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`：补齐工作树（Worktree）调用方的跨宿主选择边界、稳定语义命名和历史资源保全指引。

## Impact

影响随包 `task-manager`、`task-triage`、`task-worktree`、`task-finish` 技能（Skill）、既有能力契约（Capability Contract）的解释和任务体系说明。任务创建和工作位置选择使用同一命名默认值。复用现有路由、收尾与资源静态检查；无运行代码、界面、依赖或发布行为变化。
