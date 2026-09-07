## ADDED Requirements

### Requirement: Task详情必须直接展示Task Record与独立专业事实
Buildr Web MUST在默认概览直接展示Task Record目标、状态、结果、Change、父子关系和复盘摘要；Review与Verification只在证据页按需独立读取，父任务协调只在适用Task显示。页面 MUST不请求Task Overview、组合统一推进状态或根据专业结果推断Task能否完成。

#### Scenario: 普通Task没有专业结果
- **WHEN** Task只有Task Record且没有Review或Verification
- **THEN** 默认概览 MUST正常显示目标和当前结果
- **AND** 专业结果缺失 MUST不形成Task错误或全局阻塞

#### Scenario: 专业读取失败
- **WHEN** Review、Verification或父任务协调中的一个读取失败
- **THEN** 页面 MUST只在对应区域显示局部错误
- **AND** Task Record及其他已读取事实 MUST继续可见

### Requirement: Buildr Web必须直接消费Parent Coordination v4
Buildr Web MUST通过生成DTO消费Parent Coordination v4，只展示所属父任务、直接Children、各自状态与结果、旧计划历史、完成观察和已保存授权依据。页面 MUST不重建Contribution、Handoff、依赖、完成比例或推荐下一步。

#### Scenario: Parent详情加载
- **WHEN** endpoint返回`mode: parent`
- **THEN** 页面 MUST展示整体目标、直接Children及父任务完成授权边界
- **AND** MUST不传播或修改任一Child状态

#### Scenario: Child或普通Task详情加载
- **WHEN** endpoint返回`child|ordinary`
- **THEN** 页面 MUST只展示适用的Parent链接或不显示父任务区域
- **AND** MUST不创建父计划空态或进度聚合

## REMOVED Requirements

### Requirement: Task 详情必须展示协调计划与派生 Child 交付
**Reason**: Parent Plan推进、Contribution和Handoff模型已经退役。
**Migration**: 使用Parent Coordination v4的直接Task关系与结果。

### Requirement: Task 概览必须按 Parent、Child 与普通 Task 差异化展示
**Reason**: 条款依赖旧`parent-plan|legacy`模式和Development binding。
**Migration**: 使用`parent|child|ordinary`与直接关系投影。

### Requirement: Parent Overview 必须以完整计划为核心并折叠技术事实
**Reason**: 当前计划属于任务目标或可读文档，不由专用Parent Plan应用维护。
**Migration**: 默认页直接展示Task Record和适用的父任务协调事实。

### Requirement: Buildr Web 必须直接消费Parent Coordination v3
**Reason**: v3及其Contribution字段已经退役。
**Migration**: 使用生成的v4 DTO。

### Requirement: 父任务贡献项必须呈现动态迁移进度
**Reason**: Contribution、Handoff、依赖与迁移进度不再是产品事实。
**Migration**: 展示独立Child Task的当前状态和结果，不计算百分比。

### Requirement: Task 概览必须优先展示用户结果与必要决定
**Reason**: 该条款依赖已删除Task Overview聚合与Delivery/Activation/Cleanup代理状态。
**Migration**: 直接展示Task Record结果；具体专业决定由所属owner返回。
