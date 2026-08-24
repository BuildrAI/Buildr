## MODIFIED Requirements

### Requirement: Runner 必须保持阶段authority与部分成功事实

The self-bootstrap runner MUST remain the sole owner of sync, development Buildr Web continuity, development entry validation, and final Doctor execution. It MUST NOT directly write Finish Result, Task Record, Development, Verification, Review, Environment Receipt, or aggregate-store persistence. After a successful closeout, it MAY invoke the Product-owned Finish maintenance reconciliation command with its structured result; that command remains the sole writer of Finish maintenance projection.

#### Scenario: runner 成功后交给 Product 刷新维护状态

- **WHEN** all applicable self-bootstrap stages and final Doctor pass
- **THEN** the runner MUST submit the structured closeout result to Product-owned Finish maintenance reconciliation
- **AND** the runner MUST NOT open or mutate Finish SQLite/JSON persistence itself

#### Scenario: runner 阶段失败保持 Delivery 不变

- **WHEN** any self-bootstrap stage fails
- **THEN** the runner MUST return `blocked` Activation facts with completed effects and diagnostic
- **AND** it MUST NOT convert an already delivered Task into an undelivered result

#### Scenario: Commit成功但push失败

- **WHEN** runner已经创建合法successor commit，但普通push被拒绝或远端读回失败
- **THEN** commit阶段 MUST保持passed并报告本地history effect，push阶段 MUST为blocked并报告remote未完成
- **AND** runner MUST NOT reset、amend、force push、切换remote/ref或把整体结果报告为零effect

#### Scenario: 安装失败

- **WHEN** sync/Git阶段已经完成而development Buildr Web安装失败
- **THEN** runner MUST保留已经完成的commit/push/readback事实并停止开发入口验证与finalize
- **AND** MUST NOT重跑Formal Finish、改写Task终态或回滚已经发布的successor commit

#### Scenario: 显式开发入口验证失败

- **WHEN** sync/Git与适用的Buildr Web安装已经完成，但retained `projects/product/buildr`无法启动或身份不一致
- **THEN** development entry verification阶段 MUST为blocked并保留前序effects
- **AND** runner MUST NOT回退到PATH默认`buildr`或进入最终Doctor/Finish resume
