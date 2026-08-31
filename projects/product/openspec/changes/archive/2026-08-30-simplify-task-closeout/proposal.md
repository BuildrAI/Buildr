## Why

默认收尾把完成目标绑定到候选、交接、收尾运行和完整环境，导致可从 Git 核实的交付仍被内部状态阻塞。用户已确认从简重构：由智能体（Agent）组合现有工具，软件只守住具体动作的安全边界。

## What Changes

- **BREAKING**：收尾技能（Skill）不再默认启动 `task next`、候选、交接、五阶段执行器或交付对账。
- 复用 `task complete` 保存真实任务结果；无任务不建任务。完成投影不因缺少旧交接而否定记录，也不伪称程序已验证远端交付。
- 受管环境清理允许消费已完成记录并现场证明工作树内容仍由保留仓库持有；不再必须先生成收尾运行。
- 原自举执行脚本支持直接交付后的激活，不增加通用应用或 Buildr 命令。
- 集中说明收尾的参与者、职责、输入输出、依赖、边界与异常，修正相关当前认知。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`：技能主导的默认收尾。
- `direct-git-closeout`：有无任务统一使用真实 Git 交付事实。
- `task-record`：完成记录与机器验证交付分离。
- `task-environments`：按删除安全执行清理。
- `task-finish-execution`：旧五阶段能力退出默认路径。
- `task-closeout-orchestration`：自举不再强制绑定旧收尾运行。

## Impact

修改已有技能、能力绑定、任务投影、环境清理和自举脚本；无数据库迁移，无新 Buildr 接口，无新应用。旧数据不删除，不为旧执行流程建立兼容迁移层。多项目、多独立仓库仍是工作空间（Workspace）核心场景；不发布版本。
