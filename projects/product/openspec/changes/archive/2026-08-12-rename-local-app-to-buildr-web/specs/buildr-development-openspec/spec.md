## MODIFIED Requirements

### Requirement: Project knowledge 区分当前事实与任务看板
Buildr Project `openspec/knowledge/` MUST 保持 current-state knowledge、canonical specs、active changes 和历史 archive 的职责边界；既有 `task-boards/*.html` 与 `task-cockpits/*.html` MUST 仅作为历史任务页面原地保留，不得被解释为当前 Task、进度、证据或协调 authority，也不得因产品升级被迁移、重写、删除或重新接管。

#### Scenario: 记录任务看板
- **WHEN** 维护者查看 `openspec/knowledge/task-boards/*.html` 或 `task-cockpits/*.html`
- **THEN** 页面 MAY 作为历史过程与来源线索读取
- **AND** 当前状态 MUST 由 Task Record、Parent/Child、各专业 read model、canonical specs、当前实现与有效 evidence 核实

#### Scenario: 任务看板包含未来批次
- **WHEN** Agent 推进普通或 Parent-managed 正式 Task
- **THEN** Agent MUST 使用 Task Record、Parent/Child、各专业 Application/read model、Buildr Web 与对话汇报
- **AND** MUST NOT 创建新的 `task-boards/*.html` 或 `task-cockpits/*.html`

#### Scenario: 读取权威事实
- **WHEN** 历史任务页面与 canonical specs、active change、代码或验证证据存在冲突
- **THEN** Agent MUST 以对应当前 authority 核实任务事实
- **AND** Agent MUST NOT 使用历史页面覆盖或回写权威事实

#### Scenario: 旧路径保留历史页面
- **WHEN** Buildr update、sync、Doctor 或 Task Finish 处理包含历史任务页面的 Project
- **THEN** 这些文件的路径与内容 MUST 保持不变
- **AND** 产品 MUST NOT 将它们转换为 runtime、compatibility redirect 或新的 current authority
