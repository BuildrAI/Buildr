## ADDED Requirements

### Requirement: Buildr Web必须把Review展示为独立可选意见
Task证据页 MUST独立读取并展示Planning/Completion v2 slots，以`已记录|未记录`、subject identity、method、实际覆盖、未覆盖、发现和`已接受|要求修改`表达Review。页面 MUST不显示current/stale、adopted、gate或统一下一步。

#### Scenario: Review与Development状态不同
- **WHEN** Review已有结果而Development缺失、变化或不可读
- **THEN** Review区块 MUST继续展示保存的Result
- **AND** MUST不根据Development重标Review状态

### Requirement: Buildr Web不得依赖后端Task Review prompt
Review Agent action MUST只在前端形成携带Task ID、review type与必要Task-scoped上下文的短指令，指导Agent读取Skill、inspect current Result和真实subject；MUST不调用后端Review prompt API。

#### Scenario: 用户交给Agent审查
- **WHEN** 用户从Review slot发起Agent action
- **THEN** 前端 MUST生成最小指令且不修改Review Result
- **AND** 后端 MUST不存在Task Review prompt route或DTO
