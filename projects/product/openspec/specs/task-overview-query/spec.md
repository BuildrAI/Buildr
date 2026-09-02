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
Task Overview、Review、Verification和Parent inspect以及Buildr Web GET MUST只读取所属Application允许的值。复盘文档单项读取 MUST只读取固定本机Markdown和Task Record登记摘要，不执行Git、恢复、Agent调用或数据库mutation。

#### Scenario: 读取没有专业结果的Task
- **WHEN** Task仅存在Task Record
- **THEN** Overview MUST返回目标、状态与专业空态，复盘卡片显示未登记
- **AND** MUST不恢复旧研发、Environment、Retrospective current或收尾数据

### Requirement: Task轻量查询必须组合本机复盘文档摘要
Task列表与详情read model MUST直接返回Task Record拥有的可空复盘摘要和固定派生文档路径，不得读取Markdown正文、扫描文件系统或维护第二份状态。

#### Scenario: 列出等待人决定的Task
- **WHEN** Task query读取`pending-decision`记录
- **THEN** read model MUST返回登记摘要、状态和派生路径
- **AND** 文档正文与实际currentness MUST只在单Task文档读取时检查
