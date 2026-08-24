## ADDED Requirements

### Requirement: Release selection 必须从精确 dev baseline 创建
Release owner MUST在 clean checkout 中从维护者指定且可由 `dev` ref 证明的精确 commit 创建唯一 `release-<version>` branch，并记录 immutable baseline ref。创建 MUST不隐含 remote push、Candidate 或 publication。

#### Scenario: create release collection
- **WHEN** 输入 version、baseline commit 与 `dev` ref 均有效且 branch 不存在
- **THEN** 创建 `release-<version>` 指向 baseline，并写入 `refs/buildr/release/<version>/baseline`
- **AND** inspect read model 返回 baseline/source/tree identity、generation `0` 与空 selection chain

#### Scenario: baseline or branch drift
- **WHEN** baseline 不属于 `dev`、checkout dirty、branch 或 lifecycle ref 已被占用
- **THEN** 操作 MUST fail closed，`effects` MUST为空且不得覆盖已有 ref

### Requirement: Release update 必须只纳入明确选择的 cherry-pick -x commit
Update MUST按调用方给出的单个 source commit 执行 `git cherry-pick -x`，并从结果 commit 的 trailer 重建 ordered selection chain。普通 `dev` 前进、未选择的 ancestor/descendant 或已选 commit MUST不改变 release。

#### Scenario: selected commit succeeds
- **WHEN** source commit 是当前 `dev` 的后代、在 baseline 之后且尚未纳入
- **THEN** 产生一个 release commit，read model 区分 source dev commit、result release commit、changed paths 与递增 generation
- **AND** 不产生 remote 或公共 effects

#### Scenario: cherry-pick conflicts or source drifts
- **WHEN** source 无法干净应用、已漂移、已选择或工作区不 clean
- **THEN** MUST停止且返回 source、pre-operation release HEAD、conflict paths 和精确 abort/recovery action
- **AND** MUST不自动解决、继续选择、reset、rebase、force push 或报告部分成功

### Requirement: Lifecycle state 必须独立、可重建且 fail closed
Freeze、abandon、cleanup MUST使用独立 Git lifecycle refs，并保持幂等与授权边界。冻结或放弃后不得继续 update；cleanup MUST只清理本地资源，发现 remote matching ref 时必须拒绝。

#### Scenario: freeze and inspect
- **WHEN** 未冻结集合被要求 freeze
- **THEN** 写入 frozen ref 并返回 stable selection identity；重复 freeze 在 HEAD 未变时幂等成功
- **AND** branch 内容变化或 frozen ref 与 HEAD 不一致时 read model 标记 stale

#### Scenario: abandon and cleanup
- **WHEN** owner 明确 abandon 或 cleanup 一个本地 release
- **THEN** abandon 阻止后续 Candidate/update 且保留既有 Git/Task事实；cleanup 只在显式确认后删除本地 branch/lifecycle refs
- **AND** remote ref 存在、ref 漂移或确认缺失时 MUST保留资源并返回恢复动作
