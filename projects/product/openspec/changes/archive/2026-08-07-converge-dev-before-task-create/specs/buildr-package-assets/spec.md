## ADDED Requirements

### Requirement: Package 必须验证创建前 dev 基线收敛工作流
Buildr package verification MUST 覆盖随包 `task-triage` 在新正式 Task 创建前条件消费 `buildr.git-operations/v1`、收敛统一 `dev` 基线并保持 Task Record 与 Environment authority 分离的行为，且 MUST 验证 source、package manifest、capability graph 与 supported Agent runtime 的一致性。

#### Scenario: 随包 Skill 与 capability graph 一致
- **WHEN** Buildr 验证 workspace package 中的 `task-triage`、Git Operations contract/provider 和 Skill manifest
- **THEN** `task-triage` MUST optional 声明 `buildr.git-operations@1` dependency，并只在新正式 Task create 分支提升为 required
- **AND** package/runtime projection MUST 保持 provider、binding、description 与 consumer routing evidence ready

#### Scenario: 成功路径先收敛再创建
- **WHEN** fixture repository 处于 clean `dev` 且配置 `origin/dev`，并分别覆盖 aligned、behind 与未 push 本地 commit 分叉状态
- **THEN** verification MUST 证明 task-triage 依次完成 fetch/rebase、适用 transition check，再调用 Task Record create
- **AND** 创建出的 Task Environment checkout MUST 基于收敛后的 local `dev` identity

#### Scenario: 失败路径不创建 Task
- **WHEN** fixture 覆盖 dirty、错误 branch/upstream、fetch failure、rebase conflict、abort recovery 与 abort failure
- **THEN** verification MUST 证明 Task Record create 未执行，并核对实际 effects、current facts 与 blocker
- **AND** MUST 证明没有自动 stash、merge、force push、策略切换或把部分成功伪装为零 effect

#### Scenario: 专业 authority 保持分离
- **WHEN** verifier检查 Task Record CLI/Application、Local App mutation 和 Task Environment provider
- **THEN** 它们 MUST 保持不执行创建前 fetch/rebase，Task Record schema 与 Environment Receipt MUST 不新增该 Git 编排状态
- **AND** 创建前收敛 MUST 只存在于 Agent `task-triage` consumer 与 selected Git Operations provider 的组合行为
