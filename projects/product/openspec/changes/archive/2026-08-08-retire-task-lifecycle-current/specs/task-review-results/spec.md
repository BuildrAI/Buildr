## ADDED Requirements

### Requirement: Review current row 必须保存稳定查询字段
Task Review repository MUST在同一current row保存Domain验证的完整`result_json`、同一Result的`target_identity`、`outcome`与`updated_at`。这些字段MUST只作为结果定位、Overview查询与保存值一致性检查，MUST NOT保存applicability、Development gate adoption、terminal status或第二份Result正文。

#### Scenario: 记录 Review Result
- **WHEN** Application形成新的完整Planning或Completion Result
- **THEN** repository MUST在单一transaction中原子替换JSON与查询字段并写后验证
- **AND** target/outcome/time与Result JSON不一致时 MUST rollback并保留原slot

#### Scenario: 读取 Overview
- **WHEN** Task Overview查询Review摘要
- **THEN** repository MUST通过planning/completion两个`LEFT JOIN` alias返回presence、target、outcome与updated time
- **AND** MUST NOT反序列化或复制完整findings到Overview

## MODIFIED Requirements

### Requirement: terminal delivery association 必须与 Review current applicability 分离
Application 层 terminal projection MUST 只读取matching Finish completion中保存的association；当association的handoff gate `resultDigest`、`targetIdentity` 与当前 Review slot完全一致时，才将Result表达为`adopted-at-delivery`。该状态 MUST NOT命名为current applicability，MUST NOT写回Review Result/current row，也MUST NOT依赖独立lifecycle projection。

#### Scenario: Completion Review 已随交付候选采用
- **WHEN** completed delivered Task 的Completion Result digest与Candidate target identity均匹配Finish completion association
- **THEN** terminal projection MUST表达“已随交付候选采用”及原始conclusion
- **AND** 当前Result与保存Development gate的匹配关系 MUST作为独立保存值诊断

#### Scenario: Planning Review missing 且 gate not-applicable
- **WHEN** Planning Review slot missing，但Finish completion association保存的Development handoff planning gate disposition为not-applicable
- **THEN** Review slot MUST仍显示未记录
- **AND** terminal projection MUST另行展示gate disposition、summary与source，不得伪造Planning Result

#### Scenario: digest 或 target identity 不匹配
- **WHEN** Review slot与Finish completion association的gate digest或target identity任一不一致
- **THEN** terminal projection MUST fail closed，MUST NOT标记adopted-at-delivery
- **AND** MUST NOT扫描Git、Finish文件或已删除lifecycle投影寻找替代关联
