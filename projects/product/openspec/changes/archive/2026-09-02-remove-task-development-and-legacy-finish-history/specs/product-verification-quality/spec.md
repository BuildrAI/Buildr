## MODIFIED Requirements

### Requirement: Task Content 与 Product Artifact Candidate 必须语义隔离
Product验证用户模型 MUST把普通Task交付对象称为当前任务内容或真实产物，并 MUST把Product Artifact Candidate限定为exact release source与唯一候选制品。产品和测试 MUST不存在内部Task Candidate、Candidate generation、Development Content Target或Handoff的current行为。

#### Scenario: 冻结普通 Task 内容
- **WHEN** Agent完成代码、文档、配置或外部结果并准备审查、验证或交付
- **THEN** Agent MUST使用真实Git、文件、外部revision或专业Result identity
- **AND** MUST不创建Task Candidate或借用Product Artifact Candidate术语

#### Scenario: 验证 Product Artifact Candidate
- **WHEN** release source进入完整Product Candidate验证
- **THEN** Product Candidate generation、CI aggregate和唯一tarball MUST继续由发布验证owner维护
- **AND** 删除Task Development MUST不改变其行为

## ADDED Requirements

### Requirement: 退役任务能力必须具有无残留验收
Product verification MUST覆盖fresh/升级SQLite、Task/OpenSpec/Review/Verification/Environment/Web无Development运行、退役CLI/HTTP/route缺失、package inventory与Product Candidate回归。

#### Scenario: 完整受影响验证
- **WHEN** 删除任务研发与旧Finish实现完成
- **THEN** 类型、Unit、Component、Contract、Integration、System、Browser、package和OpenSpec检查 MUST通过
- **AND** release candidate相关检查 MUST证明Product Candidate模型未变
