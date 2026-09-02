## MODIFIED Requirements

### Requirement: 发布关联必须与旧收尾执行证明解耦
Release transaction MUST只要求release/support Task Record关系、适用Task Environment、current Product Candidate、唯一artifact、Git/main/dev和publication facts。Task Development、Task Candidate、Development Handoff、Task Finish legacy Result或Terminal Delivery MUST不成为关联输入、缺失finding或发布准备条件。

#### Scenario: support Task直接交付dev
- **WHEN** support Task通过当前task-finish Skill和Git事实完成交付且Task Record已completed
- **THEN** release correlation MUST接受其Task、Environment与真实dev source commit
- **AND** MUST不要求旧Development或Finish run

#### Scenario: Product Candidate校验
- **WHEN** release进入Product Candidate与publication readiness
- **THEN** source、generation、CI aggregate与唯一tarball MUST继续按现有发布owner校验
- **AND** 本变更 MUST不降低或替换任何发布候选门禁

#### Scenario: 发布事实不足
- **WHEN** Product Candidate、artifact、Git、npm、GitHub或publication事实不足或不匹配
- **THEN** release MUST按对应owner返回blocked
- **AND** MUST不从已删除Development/Finish历史补造成功

#### Scenario: 直接完成支持任务
- **WHEN** support Task已通过真实Git/业务交付并保存Task Record结果
- **THEN** release correlation MUST接受matching dev source与Task/Environment facts
- **AND** MUST不要求旧Finish run、Candidate或Handoff
