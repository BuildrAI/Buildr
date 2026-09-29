# buildr-development-openspec 变更

## MODIFIED Requirements

### Requirement: OpenSpec apply 阶段批量安排验证
Buildr 产品 OpenSpec change 的 apply 阶段 MUST 以任务组为单位安排受影响范围验证，并 MUST 仅在候选冻结后执行产品级完整验证。

#### Scenario: Apply 期间完成普通实现任务
- **WHEN** Agent 在 task worktree 中完成任务组内的普通实现任务
- **THEN** Agent MUST 更新任务进度并执行必要的最小反馈检查
- **AND** Agent MUST NOT 因单个任务完成而默认执行产品级总验证或临时 workspace E2E

#### Scenario: Apply 到达任务组边界
- **WHEN** 相互关联的实现与对应测试或断言已经完成
- **THEN** Agent MUST 对该组运行一次能够覆盖受影响面的专项验证
- **AND** 验证结果 MUST 作为继续后续任务或进入候选冻结的依据

#### Scenario: 候选冻结门禁
- **WHEN** change 的实现、文档、自然语言代码、所需 runtime 同步和 review 修订全部完成
- **THEN** Agent MUST 在最终候选 tree 上运行产品要求的完整验证入口
- **AND** Agent MUST NOT 在候选仍预期发生内容修改时提前反复运行完整验证

#### Scenario: 候选冻结包含预归档检查
- **WHEN** 任务组验证完成进入候选冻结
- **THEN** Agent MUST 先将 task worktree 变基到开发主线最新提交、按验证适用性重跑受影响验证、执行预归档检查，再完成候选冻结
- **AND** Agent MUST NOT 在未同步主线的候选上执行归档

#### Scenario: 验证失败后恢复 Apply
- **WHEN** 完整验证发现失败并导致候选内容需要修改
- **THEN** Agent MUST 退出候选冻结状态并恢复受影响范围的实现与专项验证
- **AND** 所有修复稳定后 MUST 对新的最终候选重新运行一次完整验证

#### Scenario: 外部 OpenSpec workflow 保持上游所有权
- **WHEN** Buildr 为 apply 阶段增加分层验证编排
- **THEN** 该编排 MUST 由 Buildr-owned 项目契约或任务 Skills 承载
- **AND** Buildr MUST NOT 为此直接修改 Component 管理的外部 `openspec-apply-change` Skill

### Requirement: Buildr 产品候选版本必须完成隔离验证
Buildr 产品开发 MUST 区分 Product Project、用户交付资产源、task worktree 和主自举 workspace，并在最终候选 Git tree 上完成隔离验证。

#### Scenario: 产品开发限制在 task worktree 的 Product Project
- **WHEN** 维护者在 task worktree 中实现 Buildr 产品能力或修改用户交付资产源
- **THEN** 正式产品源变更和 OpenSpec change artifacts MUST 只发生在该 task worktree 的 `projects/product/`
- **AND** 维护者 MUST NOT 通过同步或手工编辑主 workspace 根中的产品安装结果来代替修改 Product Project

#### Scenario: 从用户视角验证交付资产
- **WHEN** 变更影响 `package/targets/`、bootstrap、CLI 或 runtime adapter
- **THEN** 产品验证 MUST 覆盖新用户初始化、已有 workspace 更新和日常 Agent 使用路径中的相关部分
- **AND** 产品验证 MUST 使用临时用户 workspace 或 task worktree 自身，避免修改主自举 workspace

#### Scenario: 最终候选 tree 完成产品验证
- **WHEN** 维护者已经完成 rebase、冲突解决和本次任务的内容修改
- **THEN** 维护者 MUST 对准备集成的最终候选 Git tree 运行项目要求的完整验证
- **AND** 验证通过前 MUST NOT 将该 tree 作为已验证候选集成

#### Scenario: 相同 tree 完成后续 Git 动作
- **WHEN** commit、集成、push 或 worktree 清理没有改变已验证候选的 Git tree
- **THEN** 维护者 MUST 复用 worktree 中的验证结果
- **AND** 维护者 MUST NOT 在主开发分支重复运行相同产品 E2E

#### Scenario: 验证后的候选 tree 改变
- **WHEN** rebase、冲突解决、后续编辑或集成过程改变已验证候选的 Git tree
- **THEN** 维护者 MUST 将原验证结果视为失效
- **AND** 维护者 MUST 在集成前对新 tree 重新运行受影响的验证

#### Scenario: 归档后的验证适用性
- **WHEN** OpenSpec 归档只移动 change 目录并写入主规格，未改变实现与测试内容
- **THEN** 维护者 MUST 复用候选验证结果并说明归档导致的 tree 变化
- **WHEN** 归档暴露与验证相关的事实变化
- **THEN** 维护者 MUST 按验证适用性规则补最小充分检查

#### Scenario: 实际自举 workspace 更新
- **WHEN** 维护者在集成后选择使用当前产品 checkout 更新实际自举 workspace
- **THEN** update/sync MUST 被视为独立的 workspace 状态变更，而不是第二轮产品 E2E
- **AND** 状态变更后 MUST 按 Buildr Core 运行当前 Agent doctor
