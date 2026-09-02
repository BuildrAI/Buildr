## ADDED Requirements

### Requirement: todo Task 必须保持最小数据意向边界
`buildr.task-record/v2` MUST允许创建显式`todo` Task并要求Change references为空。需要Task-owned专业写入的Environment、Review、Verification与Retrospective MUST只接受各自合法Task状态；任何reader MUST不因todo存在创建目录、专业current row或外部执行事实。

#### Scenario: 读取todo Task
- **WHEN** caller inspect一个todo Task
- **THEN** MUST只返回Task Record事实
- **AND** MUST产生零专业写入和零环境副作用

### Requirement: Buildr Web Task 证据视图必须直接组合独立专业投影
Buildr Web MUST分别读取Review与Verification Application投影，并在任一结果缺失时正常展示另一个结果或空态。

#### Scenario: active Task没有Review或Verification结果
- **WHEN** 用户打开证据视图
- **THEN** 页面 MUST展示独立空态
- **AND** MUST不要求Task Candidate、研发回执或统一target

## REMOVED Requirements

### Requirement: todo Task 必须保持数据式意向边界
**Reason**: 仍要求已退役Task Development与旧Task Finish只接受active Task。
**Migration**: 只约束当前专业能力。

### Requirement: Buildr Web Task 证据视图必须组合独立 Task Review 投影
**Reason**: 场景仍以Task Development plan/Candidate缺失为输入。
**Migration**: 证据视图直接组合Review与Verification。
