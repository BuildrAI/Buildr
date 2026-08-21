## ADDED Requirements

### Requirement: Finish maintenance 必须消费后续 self-bootstrap 与 Environment current facts

Task Finish MUST provide a Product-owned maintenance reconciliation path that accepts a matching `buildr.self-bootstrap-closeout-result/v1` result and reads the current Task Environment receipt for the same Task. A passed self-bootstrap result MUST project `activation=passed`; a cleaned Environment receipt MUST project `environmentCleanup=cleaned`. The path MUST update only maintenance projection fields and MUST preserve established Delivery, repository, carrier, remote-ref, Task Record, and Environment receipt facts.

#### Scenario: self-bootstrap passed 后刷新 Activation

- **WHEN** Product receives a self-bootstrap closeout result with schema `buildr.self-bootstrap-closeout-result/v1`, matching Task ID and Finish run ID, and status `passed`
- **THEN** the matching Finish current or terminal projection MUST show `maintenance.activation=passed`
- **AND** the existing delivery status and delivery identities MUST remain unchanged

#### Scenario: Environment cleaned 后刷新 Cleanup

- **WHEN** the matching Task Environment current receipt has status `cleaned`
- **THEN** the matching Finish current or terminal projection MUST show `maintenance.environmentCleanup=cleaned`
- **AND** the refresh MUST retain any previously recorded Activation status and self-bootstrap evidence

#### Scenario: 后续事实按任意顺序到达

- **WHEN** self-bootstrap reconciliation and Environment cleanup reconciliation arrive in either order
- **THEN** repeated maintenance reconciliation MUST converge to the combination of the latest proven Activation and Environment facts
- **AND** neither call MUST execute or rewrite Delivery

#### Scenario: foreign self-bootstrap result 被拒绝

- **WHEN** the supplied self-bootstrap result has a different Task ID, Finish run ID, or unsupported schema
- **THEN** the maintenance reconciliation MUST return a blocked identity diagnostic
- **AND** it MUST NOT modify the Finish projection

### Requirement: Finish maintenance refresh 必须由正式 owner 触发

The self-bootstrap closeout runner MUST submit its passed structured result to the Product-owned Finish maintenance reconciliation path after final Doctor success. Task Environment cleanup MUST submit the matching Task ID to the same path after persisting a cleaned receipt. Neither caller MAY directly edit Finish SQLite or JSON persistence.

#### Scenario: runner 成功收尾后触发刷新

- **WHEN** the self-bootstrap closeout status is `passed`
- **THEN** the runner MUST invoke the Product maintenance reconciliation with the same Task and Finish run identities
- **AND** a failed maintenance write MUST be reported as a closeout diagnostic rather than silently ignored

#### Scenario: cleanup 成功后触发刷新

- **WHEN** Environment cleanup persists status `cleaned`
- **THEN** the Environment owner MUST invoke Finish maintenance reconciliation
- **AND** a refresh failure MUST NOT roll back the already authoritative Environment receipt
