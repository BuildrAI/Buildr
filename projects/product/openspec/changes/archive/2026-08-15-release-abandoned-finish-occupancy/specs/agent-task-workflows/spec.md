## ADDED Requirements

### Requirement: 放弃任务后必须用产品入口释放未交付 Finish 占用

当用户放弃正式 Task 且 Environment cleanup 已按 abandon 授权执行后，若该 Task 仍有 Finish run 占用隔离载体且从未成功交付，Task Finish Skill MUST 调用 canonical `task finish run --task <task-id> --run <run-id> --release-occupancy`。Agent MUST NOT 用 `git worktree remove`、直接删目录或其他非产品入口冒充释放。占用不存在或产品已回报占用已释放时，Skill MUST 停止。

#### Scenario: 放弃后仍占着未交付载体

- **WHEN** Task 已 `abandoned`，Environment cleanup 完成或无需清理，且 `task finish inspect` 证明该 Task 仍有未交付 carrier
- **THEN** Agent MUST 使用产品 `--release-occupancy` 释放
- **AND** MUST NOT 手删 `.buildr/transient/task-finish/carriers/` 下的目录

#### Scenario: 没有残留占用

- **WHEN** 放弃后 inspect 证明该 Task 没有 Finish carrier 目录，或占用已被产品释放
- **THEN** Skill MUST 不调用 `--release-occupancy`
- **AND** MUST NOT 为「看起来像残留」的其他路径执行删除
