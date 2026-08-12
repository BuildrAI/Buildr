## Why

任务环境目前只返回 Buildr CLI 的源码路径与身份，调用方仍需根据当前目录、产品位置和 Node 入口自行拼装命令，容易在并发任务中误用其他 checkout 或反复试错。现在需要把已经核验的产品身份进一步收敛为可直接执行且与任务收据绑定的调用信息，让任务从第一条 Buildr 命令开始就不依赖 cwd 猜测。

本变更不包含破坏性变更：现有 `cliSource` 等身份字段暂时保留兼容，标准消费者迁移到新的调用信息。

## What Changes

- 任务环境收据与 `worktree create/context` 结果新增完整 CLI 调用信息，包括绝对命令、固定参数前缀、源码位置、来源类型和身份摘要。
- 自举 Workspace 的任务环境绑定当前任务 checkout 内已有的 Node-aware 产品入口；普通 Workspace 绑定其声明的外部产品执行入口，不假设产品位于固定相对目录。
- 创建和读取任务上下文时核验调用入口存在、可执行且与收据中的产品身份一致；核验失败时不允许进入执行就绪状态。
- Task Finish Action Registry 等标准消费者直接使用收据绑定的调用信息，不再根据 `cliSource` 或 cwd 拼装产品命令。
- 不创建环境内短路径别名，不修改全局 `PATH`，也不反复安装全局开发 CLI。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`: 将任务环境的执行绑定从“CLI 源码身份”扩展为“源码身份 + 可直接执行的绝对调用信息”。
- `task-finish-execution`: 产品执行型收尾动作改为消费任务环境已经核验的 CLI 调用信息。

## Impact

- 影响 `worktree create/context` 的收据、JSON 输出、执行绑定核验和兼容字段。
- 影响 Task Finish Action Registry 的上下文契约与产品命令计划。
- 需要更新任务环境、任务收尾执行相关测试、产品当前认知、Skill/契约投射及并发开发任务看板。
- 不新增运行时依赖，不改变全局 CLI 安装方式。
