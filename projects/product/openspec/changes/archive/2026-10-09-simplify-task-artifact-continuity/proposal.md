## Why

原型（Prototype）已经形成源码隔离位置，进入正式开发时却再次创建工作树（Worktree），造成成果接续和清理负担。任务正文已由 `TaskRecord.brief` 唯一保存，Buildr 额外添加的 `brief.md` 又重复解释已有规范材料，容易产生过时叙述和缺失警告。

## What Changes

- 同一目标从原型进入开发时核对并沿用既有隔离标识、工作树（Worktree）和分支（Branch），保留未提交成果；任务分流选择位置，原型技能交接来源，任务管理接续身份，工作树提供者核验安全。
- 退役 Buildr 的变更说明（Change Brief）增强：不再生成、更新、专用读取、优先展示或警告缺少 `brief.md`。任务正文保存在数据库，具体变化继续由 `proposal.md`、`design.md`、规范和实施清单表达。
- **BREAKING**：移除 Buildr 变更读取模型中的专用 `brief` 字段；当前知识维护（Current Knowledge Maintenance）升级为 v4，取消 v3 中创建和维护变更说明的保证，内置调用方同步采用 v4。
- 旧归档、历史文件及链接保持可读；不批量删除或自动复制旧说明。OpenSpec 是外部组件，上游技能、模板、模式定义及命令实现全部保持原样，只修改 Buildr 自有增强。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`：规定同一目标原型到开发沿用已有隔离身份与位置。
- `ui-prototype`：补齐隔离位置与确认版来源的交接。
- `human-readable-change-brief`：退役专用说明增强，保留历史文件普通阅读。
- `current-knowledge-maintenance`：通过 v4 收敛知识维护职责并保护用户自有旧依赖。

## Impact

范围为 Buildr 自有技能源与 OpenSpec 贡献文件、知识维护契约及内置依赖声明、后端变更查询、前端变更材料阅读及必要测试。Task Record 数据库结构、已有正文和显式旧说明迁移保持原有行为。

任务目标、范围与完成依据见[任务说明](@task/task-artifact-continuity)。原型接续与旧文件兼容由真实工作树及文件阅读检查证明；OpenSpec 上游边界通过源码哈希核对。
