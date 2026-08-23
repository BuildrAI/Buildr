## ADDED Requirements

### Requirement: Publish workflow必须复用matching Candidate artifact
显式dispatch的release workflow MUST从release context声明的successful Candidate run读取`candidate-aggregate`与唯一`candidate-package`，并 MUST在所有Host Node、Launcher、protected transaction与Registry readback前核对source commit/tree、registry identity、artifact manifest、SHA-256、integrity与application payload digest。Publish workflow MUST NOT执行application payload build、`npm pack`或完整Product Candidate。

#### Scenario: 下载matching Candidate evidence
- **WHEN** dispatch context引用completed successful Candidate run
- **THEN** workflow MUST从该run下载aggregate与artifact并验证aggregate status、source和artifact identity完全匹配context
- **AND** 后续所有consumer MUST使用同一下载目录中的tarball bytes

#### Scenario: Candidate artifact缺失或过期
- **WHEN** aggregate、artifact或任一必需bytes无法从matching Candidate run读取
- **THEN** workflow MUST在公共mutation前失败并要求对current release source形成新的Product Candidate
- **AND** MUST NOT在publish run内构建替代artifact、重新pack或接受其他run的近似bytes

#### Scenario: Protected transaction复核同一bytes
- **WHEN** 唯一protected job准备执行tag或npm mutation
- **THEN** job MUST再次核对context artifact identity与下载tarball bytes
- **AND** 任一不一致 MUST在tag mutation前失败关闭并保留current attempt evidence
