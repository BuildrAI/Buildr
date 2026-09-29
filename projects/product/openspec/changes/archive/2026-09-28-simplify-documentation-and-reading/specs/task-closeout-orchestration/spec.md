## MODIFIED Requirements

### Requirement: 自举激活必须支持无旧收尾运行的直接交付
同一自举技能（Skill）脚本 MUST 支持以真实基线、已交付提交、目标分支、远端与明确 Node 为待核验输入。脚本 MUST 以 `deliveredRef`、远端回读及 Git 身份证明交付；任务编号 MAY 作为说明，但 MUST NOT 要求任务存在、已完成或包含特定范围。脚本 MUST 不读取旧 Finish run、`noChange` 或其他任务结果分类作为交付证明，也不创建虚假收尾运行。

#### Scenario: 直接交付
- **WHEN** Git 证明交付提交在目标远端，且实际改动命中自举范围
- **THEN** 唯一脚本 MUST 执行适用自举动作，不要求任务记录、`noChange`、Candidate 或 Handoff

#### Scenario: 输入不匹配
- **WHEN** 工作空间（Workspace）、基线、提交、目标、远端或 Node 不能证明一致
- **THEN** 脚本 MUST 在相关副作用前停止并保留原交付结果

#### Scenario: 激活局部失败
- **WHEN** 交付已成立但同步、安装或诊断失败
- **THEN** 脚本 MUST 记录已发生动作并返回独立 attention
- **AND** MUST 不撤销任务完成或重新推送业务内容
