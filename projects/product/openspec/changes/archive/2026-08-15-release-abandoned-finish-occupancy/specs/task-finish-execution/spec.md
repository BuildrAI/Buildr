## ADDED Requirements

### Requirement: Task Finish 必须能释放已放弃任务的未交付隔离载体占用

Task Finish MUST 提供现有 `task finish run` 的显式 `--release-occupancy` 选项，用于释放指定 run 仍占用的隔离载体（Delivery Carrier）。该选项 MUST 要求 `--run <run-id>` 与 `--task <task-id>`，且 Task Record 当前为 `abandoned`。该 run MUST 绑定同一 Task 与 canonical Workspace。Run MUST 尚未形成成功交付：`delivery.status` 不是 `delivered`，且 `remoteAfterRef` 与 `finalRemoteRef` 均为空。满足时 Finish MUST 只删除可证明属于该 run 的 carrier（与成功 cleanup 使用同一 ownership 核验），MUST NOT push、fast-forward、改写远端、调用 `completeTaskRecordFromFinish`，也 MUST NOT 把 abandoned Task 改成 completed。释放成功后 MUST 留下 inspect 可核对的占用已释放事实，并使该 carrier 目录不再存在。

#### Scenario: 已放弃且从未交付时释放占用

- **WHEN** Task 为 `abandoned`，指定 Finish run 仍登记真实非 symlink carrier，且 Result 证明从未成功交付
- **THEN** `task finish run --task <task-id> --run <run-id> --release-occupancy` MUST 删除该 run-owned carrier 并返回占用已释放
- **AND** Task Record MUST 保持 `abandoned`，远端 target MUST 不变

#### Scenario: 已成功交付则拒绝释放

- **WHEN** 指定 run 的 `delivery.status` 为 `delivered`，或 `remoteAfterRef`/`finalRemoteRef` 非空
- **THEN** Finish MUST fail closed 并保留 carrier
- **AND** MUST NOT 删除目录、push、或改写 Task 终态

#### Scenario: 任务仍是 active 则拒绝释放

- **WHEN** `--release-occupancy` 的 Task 不是 `abandoned`
- **THEN** Finish MUST fail closed
- **AND** MUST NOT 把该选项当作普通 resume 或五阶段继续执行

#### Scenario: carrier 所有权不可证明

- **WHEN** carrier 路径缺失、为 symlink、越界，或与 run 登记 identity 不一致
- **THEN** Finish MUST fail closed 并保留现场
- **AND** MUST NOT 扩大删除到 Workspace 根、其他 Task 或其他 run
