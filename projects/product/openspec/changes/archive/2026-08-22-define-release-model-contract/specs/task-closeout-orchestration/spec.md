## ADDED Requirements

### Requirement: Self-bootstrap发布关联必须保持Activation单一authority
`buildr-self-bootstrap-sync` MUST继续只消费Product-owned stable Finish projection并拥有matching retained Activation、development entry验证和最终Doctor closeout。Release correlation MAY读取其closed result/readback identity，但 MUST NOT要求runner保存release selection、Product Candidate、publish、tag或npm事实；Publication与dev convergence也 MUST NOT反向改写runner或Finish Delivery。

#### Scenario: matching self-bootstrap完成
- **WHEN** release/support Task的matching self-bootstrap runner返回`passed`或带完整plan的`not-applicable`
- **THEN** release correlation MUST核验Task、Finish run、delivered ref、plan、status和result identity后再引用该事实
- **AND** MUST NOT从聊天、临时stdout、近似Git ancestry或caller摘要推断Activation成功

#### Scenario: self-bootstrap失败但Delivery已成立
- **WHEN** runner在sync、Buildr Web install、development entry验证或Doctor阶段blocked/failed
- **THEN** runner MUST返回Activation/Diagnostics所属的结构化失败并保持Finish Delivery不变
- **AND** release readiness或publication MUST按当前阶段契约独立决定blocked/attention，不得改写、删除或伪造Delivery

#### Scenario: publication先于后续维护收敛完成
- **WHEN** 公开Publication已成立而Activation、Environment Cleanup或Diagnostics尚未完成
- **THEN** 后续owner MUST可按matching identity独立恢复并更新自己的current事实
- **AND** 恢复结果 MUST NOT重新publish、移动tag、生成第二tarball或反向修改release selection
