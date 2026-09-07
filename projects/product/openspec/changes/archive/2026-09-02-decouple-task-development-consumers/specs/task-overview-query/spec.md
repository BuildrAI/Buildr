## MODIFIED Requirements

### Requirement: Task Overview 必须从专业 current facts 组合读取
Buildr MUST 通过只读 Task Overview Application 从 Workspace SQLite 中组合 Task Record、Development、Planning/Completion Review、Verification、Environment 与 Finish 的已保存摘要。Repository MUST 对单个 Task 使用一个 read-only connection 与一条参数化查询取得这些 facts；MUST NOT持久化聚合JSON、复制完整专业payload、调用writer或把任一专业row缺失解释为任务失败。

#### Scenario: 读取 active Task 全貌
- **WHEN** Buildr Web 或内部 consumer 请求已有 active Task 的 Overview
- **THEN** Application MUST 返回 Task 顶层事实和各专业 row 的独立 presence/summary/observed time
- **AND** MUST NOT根据Development gate、Candidate或Handoff推导任务完成、下一步或交付

#### Scenario: 专业 row 缺失
- **WHEN** 一个或多个专业 current row 尚未形成
- **THEN** Overview MUST保留其他已保存事实并把对应section表达为missing
- **AND** MUST NOT创建占位row、统一blocked状态或替代专业Result

### Requirement: Task Overview 与专业 inspect 必须只计算无副作用保存值关系
Task Overview、Task Development/Review/Verification inspect 与 Buildr Web GET MUST只读取所属Application允许的已保存值和响应格式。它们 MUST NOT比较Development gate与Review/Verification Result、执行Git或Content Target observation、Environment probe、Finish filesystem scan、旧专业文件恢复或数据库mutation。

#### Scenario: 比较保存的 gate 与 Result identity
- **WHEN** Overview读取Development、Review与Verification保存值
- **THEN** MUST分别返回各自摘要
- **AND** MUST NOT报告matched/mismatched、adopted或统一readiness

#### Scenario: 外部事实在最近一次 action 后变化
- **WHEN** Git、文档、声明、环境或外部系统在最近一次专业动作后变化
- **THEN** GET MUST继续返回最近一次保存事实与观察时间
- **AND** Agent MUST通过真实owner工具重新观察，不由Overview更新

### Requirement: Terminal Delivery 必须直接读取 Finish completion association
Terminal Delivery Application MUST只从Task Record和只读Finish history取得顶层结果、旧run、远端引用、activation与cleanup事实。它 MUST NOT读取Development或Review，不返回Candidate、Handoff、planning/completion gate association，也不得因Finish历史缺失或损坏撤销Task Record已保存结果。

#### Scenario: matching Finish completion
- **WHEN** completed Task存在可读的旧Finish terminal记录
- **THEN** Application MUST返回历史交付、激活和清理事实及其观察来源
- **AND** MUST NOT恢复Environment、观察Git、读取Development或判断Review adoption

#### Scenario: completion association 缺失或不匹配
- **WHEN** completed Task没有Finish记录或旧payload不可读
- **THEN** Application MUST保留Task Record completed结果并返回局部历史diagnostic
- **AND** MUST NOT从Development、Review、Git或外部系统补造交付证明

### Requirement: Task Overview 必须返回面向用户的正交结果摘要
Task Overview Application MUST从Task Record、Environment和旧Finish保存事实分别表达目标、Delivery、Activation、Cleanup与局部attention。该摘要 MUST保持这些结果正交，MUST NOT使用Development applicability、Candidate、Handoff或Review/Verification缺失生成attention、authorization或完成判断。

#### Scenario: 已交付但激活或清理需要关注
- **WHEN** Finish历史保存Delivery成功且Activation或Cleanup需要关注
- **THEN** Overview MUST保持Delivery为delivered并分别返回局部状态

#### Scenario: 仍需用户授权
- **WHEN** 任一具体专业动作保存了仍需人决定的业务或外部副作用授权
- **THEN** Overview MAY返回该owner保存的最小授权摘要
- **AND** MUST NOT从Development risk、Review finding或内部恢复状态推导新授权

#### Scenario: 没有Finish历史
- **WHEN** Task已completed但没有旧Finish记录
- **THEN** Overview MUST显示任务结果已保存且机器交付历史不可用
- **AND** MUST NOT显示Development blocked或要求补造旧流程

#### Scenario: 专业事实尚未形成
- **WHEN** Task尚无Development、Review、Verification、Environment或Finish中的任一专业row
- **THEN** Overview MUST只把该section表达为missing并保留其他事实
- **AND** MUST NOT从Task status、Git、文件或聊天内容猜测专业结果
