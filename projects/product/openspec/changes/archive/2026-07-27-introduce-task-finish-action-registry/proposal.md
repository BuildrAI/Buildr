## Why

Task Finish 已有持久化状态机和 safe executor，但正常收尾仍由 Agent 猜测命令、执行目录、参数和证据映射，再通过 `--execution-plans` 注入产品。这造成重复工具往返、路径错误和不可观察的编排间隔，也让“产品自动化”停留在执行 Agent 已规划命令的层面。

## What Changes

- 为 Task Finish 增加版本化 action registry，覆盖标准步骤的适用条件、执行主体、执行目录、参数来源、副作用、结果断言、证据投射和 fallback 策略。
- 让 `task finish run` 默认从 registry 解析当前步骤：产品可确定的动作直接生成并执行计划，语义型 provider 动作返回精确的登记交接，不再要求 Agent猜命令。
- 当没有登记动作、前置条件无法唯一解析或运行时出现登记外语义分支时，返回结构化 `agent-reasoning-required` fallback；不得静默猜测或扩大授权。
- 增加 action registry 的查询入口，使 Agent 和诊断工具可查看当前步骤的登记动作、输入缺口与执行边界。
- 保留显式 `--execution-plans` 作为兼容和登记外恢复入口，但正常登记路径不再依赖调用方构造命令计划。

本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

### Modified Capabilities

- `task-finish-execution`: Task Finish 从调用方提供 execution plans 升级为产品持有、可查询且可执行的 action registry，并明确登记外 Agent fallback 契约。

## Impact

- `services/buildr/src/application/task-finish/` 的状态机、safe executor 与新增 registry/resolver。
- `buildr task finish` CLI、帮助、JSON schema 与测试。
- Task Finish Skill、CLI 文档及长期优化任务看板。
