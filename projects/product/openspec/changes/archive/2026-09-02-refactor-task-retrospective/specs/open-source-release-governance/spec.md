## MODIFIED Requirements

### Requirement: Release transaction evidence 必须提供正式关联与可验证 readback
Buildr MUST以closed release transaction context/evidence schema关联source release Task、显式support Tasks、Candidate source SHA/workflow/run、publish workflow/run、main/dev收敛提交、tag、npm version/dist-tag、GitHub Release与Registry smoke。发布事务 MUST不读取、复制或依赖Task复盘文档、决定状态或来源关系。

#### Scenario: dispatch 正式 release transaction
- **WHEN** 维护者明确授权publication且runner准备dispatch唯一protected workflow
- **THEN** runner MUST验证release/support Tasks、Candidate run/source、Git bridge与适用准备事实
- **AND** MUST不查询Retrospective Application、Task复盘关系或本机Markdown

#### Scenario: 读取完成的发布链路
- **WHEN** 调用方按publish run ID读取release transaction evidence
- **THEN** read model MUST返回release/support Tasks和公共发布事实
- **AND** schema MUST不包含`retrospectiveSources`

#### Scenario: transaction 在公共写入前失败
- **WHEN** Task、Candidate、Git或准备事实不匹配
- **THEN** runner MUST在tag、npm publish或GitHub Release写入前失败
- **AND** MUST不通过复盘状态补足或绕过缺失事实
