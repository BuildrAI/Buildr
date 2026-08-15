## ADDED Requirements

### Requirement: 已放弃且未交付的 foreign carrier 必须给出 occupancy 释放命令

当 foreign Finish Result 可证明其 Task 为 `abandoned`、该 run 从未成功交付、carrier 路径/identity/Workspace 匹配，且目录真实存在时，自举 closeout recovery plan MUST 把该条目标记为可由原 Task Finish owner 执行的 occupancy 释放步骤，命令为既有 `task finish run --task <task-id> --run <run-id> --release-occupancy`。该步骤 MUST 排在 `cleanup_pending` 的 `resume-owner-cleanup` 之后、当前 run 的 `retry-current-closeout` 之前，按 `taskId + runId` 稳定排序。协调器 MUST NOT 删除、忽略或代替 owner 释放该 carrier。

#### Scenario: 放弃后的未交付占用挡住当前 closeout

- **WHEN** 当前 doctor-blocked run 之外存在 foreign carrier，inspect 证明 Task abandoned、delivery 未成功、carrier identity 匹配
- **THEN** recovery plan MUST 包含该 run 的 owner `--release-occupancy` 步骤，并保持当前 invocation 零副作用 blocked
- **AND** MUST NOT 把它标成 `manual-owner-review` 或生成 resume-five-phase 命令

### Requirement: 其他非 cleanup_pending 外载体仍须人工审查

除「abandoned 且从未交付」这一可证明子集外，foreign Result 为 doctor-blocked、prepare/deliver blocked、terminal 残留或其他非 `cleanup_pending` 状态时，recovery plan MUST 仍标记 `manual-owner-review`。identity 不可证明时 MUST 仍为 `unprovable`。

#### Scenario: 仍在交付中的 foreign doctor-blocked

- **WHEN** foreign Result 为 doctor-blocked 且 Task 仍为 active，或该 run 已有成功交付 refs
- **THEN** recovery plan MUST 标记 `manual-owner-review` 或不适用 occupancy 释放
- **AND** runner MUST NOT 生成 `--release-occupancy` 命令
