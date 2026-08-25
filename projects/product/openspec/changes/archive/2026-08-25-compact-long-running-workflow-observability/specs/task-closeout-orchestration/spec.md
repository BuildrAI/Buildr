## ADDED Requirements

### Requirement: self-bootstrap runner 必须提供 durable compact terminal readback
`buildr-self-bootstrap-sync` bundled runner MUST 缺省返回 `buildr.long-running-operation-summary/v1` compact 投影，并 MUST仅在显式 `--detail full` 时输出 canonical closeout Result。runner 在能够证明 matching Task/run identity 后形成的 `passed|blocked|not-applicable` terminal Result MUST交给既有 Product Finish maintenance reconciliation 保存最小 phases/result identity；maintenance 写入失败 MUST作为 evidence attention 返回，但 MUST不撤销 Delivery、activation effects或原 terminal status。

#### Scenario: self-bootstrap 成功输出超大
- **WHEN** runner 完成全部适用阶段且 full Result包含大量 operations、paths与effects
- **THEN** 默认 stdout MUST只返回有界 phases status、run/result identity、cleanup与 Finish inspect pointer
- **AND** explicit full MUST继续返回 canonical Result供专项诊断

#### Scenario: 阶段失败后 stdout 丢失
- **WHEN** runner 在可识别 Task/run 的阶段 blocked且客户端未收到 stdout
- **THEN** matching Finish maintenance inspect MUST可回读 activation attention、closeout result identity与阶段摘要
- **AND** Agent MUST不因此再次启动第二个 self-bootstrap runner

#### Scenario: maintenance 刷新失败
- **WHEN** runner terminal Result 已形成但 Product maintenance reconciliation失败
- **THEN** summary MUST保持真实 terminal status并把 cleanup/evidence状态标记为 attention
- **AND** MUST不回滚已发生effects、重跑 Finish或把 Delivery改写为失败
