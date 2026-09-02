# task-overview-query Specification

## Purpose

以一次纯SQLite联表查询组合Task与专业current摘要，不建立聚合store或第二writer。

## Requirements

### Requirement: Task Overview 必须从专业 current facts 组合读取
Buildr MUST通过只读Task Overview Application从Workspace SQLite组合Task Record、Planning/Completion Review、Verification与Environment摘要。Repository MUST使用一个read-only connection和一条参数化查询；MUST NOT join Development或旧Finish表、持久化聚合JSON或把专业row缺失解释为任务失败。

#### Scenario: 读取 active Task 全貌
- **WHEN** Buildr Web请求已有active Task的Overview
- **THEN** Application MUST返回Task顶层事实和保留专业row的独立presence/summary/time
- **AND** MUST不返回Development、Candidate、Handoff、legacy Finish或机器交付状态

#### Scenario: 专业 row 缺失
- **WHEN** Review、Verification或Environment row尚未形成
- **THEN** Overview MUST保留其他事实并把对应section表达为missing
- **AND** MUST不创建占位row或统一blocked状态

### Requirement: Task 轻量查询必须组合复盘来源关系
Task 列表与详情的 SQLite read model MUST 从 Task Record owner tables 读取 `retrospectiveSourceTaskIds`，并 MAY 对单个 source Task 派生承接 Task 的 ID、title 与 status。查询 MUST 保持只读、固定数量 SQL，不得读取复盘 Markdown、专业 currentness 或建立关系缓存。

#### Scenario: 查看目标 Task 来源
- **WHEN** Buildr Web 读取一个具有多个复盘来源的 todo 或 active Task
- **THEN** read model MUST 返回去重后的 source Task 摘要
- **AND** MUST NOT调用 Task Retrospective writer 或复制原始报告

#### Scenario: 查看源 Task 承接列表
- **WHEN** Buildr Web 打开 terminal source Task 的复盘页
- **THEN** read model MUST 返回全部当前承接 Task 摘要
- **AND** 目标状态变化 MUST 由下一次查询直接反映

### Requirement: Task Overview 必须返回面向用户的正交结果摘要
Task Overview Application MUST从Task Record和Environment分别表达目标、顶层结果、资源清理与局部attention。它 MUST不从已删除的Development/Finish历史推导Delivery、Activation、Candidate、Handoff、授权或完成判断。

#### Scenario: 已完成任务没有机器交付历史
- **WHEN** Task Record已completed且旧Finish数据已删除
- **THEN** Overview MUST显示任务结果已保存
- **AND** MUST不显示delivered、历史缺失警告或补造旧流程建议

#### Scenario: Environment cleanup需要关注
- **WHEN** Environment保存cleanup attention
- **THEN** Overview MUST保留Task顶层结果并单独显示Environment attention
- **AND** MUST不撤销Task完成事实

#### Scenario: 已交付但激活或清理需要关注
- **WHEN** Agent已从真实交付现场确认成果，而Environment仍有cleanup attention
- **THEN** Overview MUST只展示Task结果与Environment attention
- **AND** MUST不保存或推断Delivery/Activation历史

#### Scenario: 仍需用户授权
- **WHEN** 某个具体专业动作仍需业务或外部副作用授权
- **THEN** 对应owner MUST直接向Agent返回该决定
- **AND** Overview MUST不从Review finding或旧历史推导授权

#### Scenario: 没有Finish历史
- **WHEN** Task已completed且`task_finish_current`不存在
- **THEN** Overview MUST正常展示Task结果
- **AND** MUST不显示历史缺失诊断

#### Scenario: 专业事实尚未形成
- **WHEN** Task尚无Review、Verification或Environment中的任一row
- **THEN** Overview MUST只把对应section表达为missing并保留其他事实
- **AND** MUST不从Task状态、Git、文件或聊天猜测专业结果

### Requirement: Task Overview 与专业 inspect 必须只计算当前owner保存值
Task Overview、Review、Verification、Environment、Retrospective和Parent inspect以及Buildr Web GET MUST只读取所属Application允许的已保存值。它们 MUST不执行Git observation、Environment probe、filesystem recovery或数据库mutation。

#### Scenario: 读取没有专业结果的Task
- **WHEN** Task仅存在Task Record
- **THEN** Overview MUST返回目标、状态与专业空态
- **AND** MUST不恢复旧研发或收尾数据
