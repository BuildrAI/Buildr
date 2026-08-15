## ADDED Requirements

### Requirement: Task Finish run 必须只把 occupancy 释放暴露为显式 existing-run 选项

CLI MAY 为现有 `task finish run` 增加 `--release-occupancy`，但 MUST NOT 增加新的 Finish action 或 pre-registry 执行入口。该选项 MUST 与 `--run <run-id>`、`--task <task-id>` 和 canonical target 一起使用，MUST NOT 与 `--resume`、`--bootstrap-recovery` 或 `--accept-zero-delta-adaptation` 同时出现。帮助与结构化诊断 MUST 把它描述为：仅在 Task 已放弃且该 run 从未成功交付时，释放隔离载体占用；不是普通 resume、不是作废已推送交付。

#### Scenario: 用户显式释放已放弃占用

- **WHEN** 用户调用 `task finish run --task <task-id> --run <run-id> --release-occupancy`
- **THEN** canonical CLI MUST 把该参数交给同一 Task Finish Application 的 run action
- **AND** MUST NOT 注册第三套 Finish action 名称

#### Scenario: 与恢复类选项混用

- **WHEN** 同一调用同时包含 `--release-occupancy` 与 `--resume`、`--bootstrap-recovery` 或 `--accept-zero-delta-adaptation`
- **THEN** CLI MUST 作为无效组合拒绝
- **AND** MUST NOT 启动五阶段或删除 carrier
