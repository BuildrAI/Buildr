## Why

任务登记被绑定到全部相关仓库的更新与变基，日报生成被绑定到工作空间同步和全局诊断，使本可独立完成的工作受网络、本地未提交内容及无关环境问题阻塞。用户已确认解除这两项前置，保留实际 Git 写入和数据真实性保护。

## What Changes

- 创建或激活任务只核对目标、范围、当前记录与授权；代码更新由实际工作目标独立决定。
- 日报默认收集明确本地引用范围内的当日提交，报告引用、观察时点和未覆盖范围；需要远端最新信息时按已有授权获取，不把资产同步与全局诊断作为写入条件。
- 更新 Buildr 自有技能、声明、相关规范、当前说明和已有检查；不修改外部 OpenSpec 技能、当前认知维护能力或双语规则。
- 行为变化移除旧的强制同步前置；无 CLI、数据库或文件格式破坏性变化。依赖旧前置的组织实践应显式表达更新目标。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`：任务登记与 Git 更新分离。
- `product-agent-skills`：任务启动和日报入口按真实动作选择依赖。
- `buildr-package-assets`：验证任务登记不依赖代码同步，保留实际 Git 操作的安全检查。
- `project-daily-progress`：明确提交观察范围，解除同步与全局诊断前置。

## Impact

影响 `services/buildr/resources/` 的自有技能和随包声明、相关契约及功能检查、`knowledge/overview.md`。Task Record 与 Daily Progress Application 沿用现有接口和数据结构；不增加状态、依赖或外部副作用。
