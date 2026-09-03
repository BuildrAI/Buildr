## MODIFIED Requirements

### Requirement: Review current row 必须保存稳定查询字段
Repository MUST在同一row保存完整`result_json`、同一Result的`subject_identity`、`outcome`与`updated_at`，只用于专业inspect定位与一致性校验，不保存applicability、gate、Overview摘要或第二份正文。

#### Scenario: 记录 Review Result
- **WHEN** Application形成新的完整Planning或Completion Result
- **THEN** repository MUST在单一transaction中原子比较、替换并写后验证
- **AND** subject/outcome/time与Result JSON不一致时 MUST rollback

#### Scenario: 读取 Review
- **WHEN** CLI或Buildr Web请求Review详情
- **THEN** Application MUST返回两个独立槽位的完整保存结果或missing
- **AND** MUST不调用Task Overview或其他专业Application

#### Scenario: 读取 Overview
- **WHEN** 调用方请求旧Task Overview路径
- **THEN** route MUST不存在且Review repository MUST不被调用
- **AND** Review detail MUST继续通过自身inspect读取
