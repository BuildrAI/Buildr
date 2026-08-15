## ADDED Requirements

### Requirement: foreign-clear 自举重试必须有界承接同 run target-race
Buildr 自举 Workspace 的 bundled runner 在精确的 foreign-carrier 零副作用阻断解除后执行唯一同 run 重试时，若第一次 same-run Finish resume 返回 `task-finish.target-race`，MUST 使用该 Product Result 的 matching resume token 再承接一次既有 Task Finish target-race recovery。该承接 MUST只发生在本次 `--retry-after-foreign-clear true` invocation 内，MUST NOT为普通 closeout、其他 blocked Result或后续再次 target-race形成自动重试。

#### Scenario: target-race 可机械恢复并完成
- **WHEN** foreign carrier 已清除，runner 的唯一重试完成 latest target fast-forward、既有 activation 与 development entry gate，第一次 same-run resume 返回精确 `task-finish.target-race`及 matching deliver resume token，且第二次 resume 在最新 Delivery Baseline 上可机械完成
- **THEN** runner MUST把第二次 Product resume 作为同一 finalize 阶段的有界恢复并返回 passed
- **AND** runner MUST NOT复制 carrier reset、Git apply、containment或Task Finish状态机

#### Scenario: 最新 baseline 需要 Agent 适配
- **WHEN** runner 使用 target-race token 承接一次后，Task Finish 返回精确 Delivery Adaptation required、matching carrier与resume token
- **THEN** runner MUST返回专用 blocked diagnostic并保留 Product run、failure、carrier与matching resume evidence
- **AND** Agent MUST在该 carrier 内审核并执行可证明的适配，再由同一 Task Finish owner继续；Agent 无法安全处理时 MUST请求用户授权

#### Scenario: target-race 恢复不得形成循环
- **WHEN** 第二次 Product resume 再次返回 target-race、其他 blocked/failed Result，或 phase、code、carrier、resume token任一无法精确证明
- **THEN** runner MUST停止并报告实际 Result，不得自动调用第三次 resume、重跑 runner或改变恢复策略
- **AND** runner MUST NOT新增持久retry counter、队列、Receipt或聚合恢复store
