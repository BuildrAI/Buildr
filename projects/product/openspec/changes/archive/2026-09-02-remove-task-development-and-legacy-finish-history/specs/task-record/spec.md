## ADDED Requirements

### Requirement: Task Record 必须独立于已删除的研发与旧收尾数据
Task Record MUST在`task_development_current`和`task_finish_current`不存在时继续创建、查询、更新、完成和放弃任务。`legacy_parent_plan_json` MUST保留已迁移历史且不得回读Development表。

#### Scenario: 升级后读取历史任务
- **WHEN** migration已删除Development和Finish表
- **THEN** Task Record MUST保留原目标、范围、关系、状态、结果和legacy Parent Plan
- **AND** MUST不创建占位专业记录或机器交付结论

## MODIFIED Requirements

### Requirement: Buildr Web Task 详情必须使用四个一级信息视图
Buildr Web MUST 将 Task 详情一级导航保持为“概览、原型、证据、复盘、环境”。“概览”MUST以Task Record为主体；“证据”MUST组合Task Review与Task Verification；“环境”MUST投影Task Environment。页面 MUST不提供“研发”页签、旧Finish历史页或聚合状态机。

#### Scenario: 打开 Task 详情
- **WHEN** 用户进入`/workspaces/:workspaceId/tasks/:taskId`
- **THEN** 页面 MUST提供“概览、原型、证据、复盘、环境”并默认打开“概览”
- **AND** MUST不存在研发、独立审查、独立验证或旧交付历史一级页签

#### Scenario: 查看概览摘要
- **WHEN** 用户查看“概览”
- **THEN** 页面 MUST显示Task Record顶层事实与Review、Verification、Environment摘要
- **AND** MUST明确Task status仍由Task Record拥有

#### Scenario: 查看研发依据
- **WHEN** 用户需要查看实现、审查或验证依据
- **THEN** 页面 MUST通过Change内容与“证据”视图展示真实专业结果
- **AND** MUST不存在研发聚合页或gate reference

#### Scenario: 证据 reader 部分不可用
- **WHEN** Task Review或Task Verification任一读取失败或缺失
- **THEN** “证据”视图 MUST独立展示对应诊断或空状态，并保留另一reader的有效内容
- **AND** 概览、原型、复盘与环境视图 MUST不受影响

### Requirement: Buildr Web Task Overview 必须组合专业 current 摘要且不扩张 Task Record authority
Buildr MUST为单个Task提供独立只读Task Overview Application。它MUST以Task Record为身份/顶层状态authority，并通过一条Workspace SQLite查询组合Planning/Completion Review、Verification与Environment最小摘要；MUST NOT读取Development或旧Finish表、推断机器交付或写回Task Record。

#### Scenario: 打开 Task 概览
- **WHEN** Buildr Web请求真实Task的Overview
- **THEN** Application MUST返回Task Record、直接Parent/Children、Review、Verification与Environment摘要
- **AND** MUST不调用Git、Change resolver、专业writer或旧历史reader

#### Scenario: Overview mutation请求
- **WHEN** client对Overview resource发送POST、PUT、PATCH或DELETE
- **THEN** HTTP interface MUST拒绝该请求且effects为空
- **AND** Task Record与全部保留的专业current rows MUST保持不变

#### Scenario: 顶层状态与专业状态不一致
- **WHEN** Task Record status与Environment、Review或Verification摘要不同
- **THEN** Overview MUST以Task Record表达顶层status并分别展示专业事实
- **AND** MUST不反写Task Record或自动修复数据库
