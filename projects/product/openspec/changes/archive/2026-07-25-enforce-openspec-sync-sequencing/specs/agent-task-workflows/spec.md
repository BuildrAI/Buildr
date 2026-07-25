## ADDED Requirements

### Requirement: OpenSpec apply 保持 canonical specs 直到受控同步阶段
Buildr OpenSpec apply guidance MUST 要求 Agent 在 active change 的实现阶段只修改 change artifacts 与实现内容，MUST NOT 在当前会话的 `pre-sync` contract guard 成功前写入该 change 的 canonical specs。Agent MUST 在 pre-sync 成功后执行 agent-driven canonical sync，并在 `post-sync` guard 返回 `ok: true` 后才使用 `openspec archive <change> --skip-specs --yes`。

#### Scenario: apply 阶段尚未进入受控同步
- **WHEN** Agent 正在实现 active OpenSpec change，且当前会话尚未取得该 change 的成功 pre-sync receipt
- **THEN** Agent MUST NOT 将该 change 的 delta 预写入 canonical specs
- **AND** MUST 保持 canonical Requirement 与 baseline 可比较，直到 Task Finish 进入受控同步阶段

#### Scenario: 受控同步与归档
- **WHEN** pre-sync guard 返回 `ok: true`，Agent 已按该 change 的 delta 完成 canonical sync，且 post-sync guard 返回 `ok: true`
- **THEN** Agent MUST 记录同步证据并使用 `openspec archive <change> --skip-specs --yes`
- **AND** archive 后 MUST 继续执行 strict validation、status 与现有 closeout workflow checks

#### Scenario: pre-sync 或 post-sync 未通过
- **WHEN** pre-sync 或 post-sync guard 未返回 `ok: true`
- **THEN** Agent MUST 停止 canonical sync 后续动作或 archive
- **AND** MUST NOT 通过 baseline adopt、重跑 pre-sync 或 `--skip-specs` 掩盖失败

## MODIFIED Requirements

### Requirement: Task Finish 自动编排已验证任务收尾
Buildr MUST 提供实现 `buildr.task-finish/v1` 的 `task-finish` 默认 workspace Skill，将用户当前轮次明确的“收尾”意图作为受限的一次性授权，并通过绑定的 `buildr.task-verification/v2`、`buildr.task-worktree-lifecycle/v1` 和 `buildr.git-task-integration/v1` providers 自动完成可安全确定的剩余任务动作；Task Finish MUST NOT 固定所有任务均要求 Candidate。

#### Scenario: 收尾前置检查
- **WHEN** 用户在 canonical task worktree 中要求收尾
- **THEN** Agent MUST 解析当前 task/change、仓库边界、目标分支、远端、工作区改动、发布意图、已知验证 evidence 和三个 required providers
- **AND** Agent MUST 在 Git 写操作前披露 selected provider identities、实际验证/集成/清理策略、提交范围、目标分支、远端和清理范围
- **AND** 存在无关 dirty changes、多个无法消歧的 change/目标分支、required provider readiness 为 `blocked` 或不可信验证状态时，Agent MUST 在破坏性动作前停止

#### Scenario: 普通收尾要求 affected 保证
- **WHEN** Task Finish 提交非发布、未命中 Project 高风险政策的任务上下文
- **THEN** selected verification provider MUST 返回 `requiredAssurance: affected`
- **AND** Task Finish MUST 只在成功 evidence 的 level 匹配 affected、candidate identity 匹配且 evidence 可复用时继续

#### Scenario: 发布高风险或显式完整收尾要求 candidate 保证
- **WHEN** Task Finish 提交发布任务、Project 高风险任务或用户明确要求完整验证的上下文
- **THEN** selected verification provider MUST 返回 `requiredAssurance: candidate`
- **AND** Task Finish MUST 只在成功 Candidate evidence 完整、identity 匹配且可复用时继续

#### Scenario: 收尾复用可信 evidence
- **WHEN** 当前候选已有 selected verification provider 产生或核对的成功 evidence，且 level 满足 `requiredAssurance`、candidate identity 未改变
- **THEN** Task Finish MUST 复用该 evidence
- **AND** Task Finish MUST NOT 重复运行相同验证
- **AND** provider evidence inspection MUST NOT 被计作 verification execution

#### Scenario: 收尾补齐验证 evidence
- **WHEN** 所需 evidence 缺失、级别不足、不可读、不可复用或与当前候选 identity 不匹配
- **THEN** Task Finish MUST 调用 selected task-verification provider 对当前最终候选执行 `requiredAssurance` 对应的项目验证
- **AND** 新验证失败或仍不完整时 MUST 停止 integrate、push 和 cleanup

#### Scenario: Closeout metadata 改变 delivery tree
- **WHEN** delivery tree 与已验证 implementation identity 的差异完全来自可归因的 OpenSpec sync/archive、归档格式规范、Project 明确定义的 closeout-only artifacts，或符合 runtime projection-only 条件的 Buildr sync 投影与 receipt
- **THEN** Task Finish MUST 将 transition 标记为 `closeout-metadata-only`，保留原 evidence，并运行 closeout workflow 已要求的 focused checks
- **AND** Task Finish MUST NOT 调用 task-verification `execute`，最终报告 MUST 分别说明已验证 identity、delivery tree identity 和 closeout delta checks

#### Scenario: Buildr runtime projection-only delivery delta
- **WHEN** implementation source 已由可复用 evidence 覆盖，已集成保留 checkout 上的 `buildr sync` 只修改受管 runtime projection 与对应 receipt，且 `git diff`、component integrity 与 doctor 均证明没有其他 source 或生成资产变化
- **THEN** Task Finish MUST 将该 delta 作为 `closeout-metadata-only` 处理并复用原 verification evidence
- **AND** MUST 运行并记录 runtime/receipt focused checks、sync 来源、implementationCandidateIdentity 和 deliveryTreeIdentity

#### Scenario: 实现内容改变时重新验证同一所需保证
- **WHEN** provider integration、冲突解决、lockfile 或非 projection-only 的生成资产更新、其他步骤改变 implementation content，或差异无法完全证明属于 closeout-only scope
- **THEN** Task Finish MUST 将 transition 标记为 `implementation-changed`，使原 evidence 失效，并在集成前请求新的 `requiredAssurance`
- **AND** 普通任务 MUST 重跑 affected，发布、高风险或显式完整验证任务 MUST 重跑 candidate，新验证失败时 MUST 停止尚未执行的 integrate、push 和 cleanup

#### Scenario: 完成 OpenSpec 归档
- **WHEN** 当前任务包含 artifacts 和 tasks 均完成的 active OpenSpec change
- **THEN** Task Finish MUST 先通过 pre-sync guard，再执行 canonical sync，并在 post-sync guard 通过后归档 change
- **AND** Task Finish MUST 通过外部可用的 OpenSpec CLI/Skills 完成该步骤，不修改外部 `openspec-*` Skill 源
- **AND** OpenSpec strict、contract guard 和 `git diff --check` MUST 作为 closeout workflow checks 记录，不得计作 verification executor invocation

#### Scenario: 归档后规范 EOF 空白行
- **WHEN** OpenSpec archive 或 specs sync 后 `git diff --check` 仅报告本次修改的 OpenSpec Markdown 文件存在 `new blank line at EOF`
- **THEN** Task Finish MUST 将这些文件规范为恰好一个结尾换行
- **AND** Task Finish MUST 重新运行 `git diff --check` 和 OpenSpec strict validation

#### Scenario: 归档后存在其他格式问题
- **WHEN** `git diff --check` 报告非 EOF 空白行、非 OpenSpec 文件或无法确认来源的问题
- **THEN** Task Finish MUST 停止自动修复
- **AND** Agent MUST 报告问题并等待用户决定

#### Scenario: 收尾授权覆盖 provider 声明的常规动作
- **WHEN** 前置检查、所需验证和归档相关检查通过
- **THEN** 用户的“收尾” MUST 授权提交当前任务范围、调用已绑定 task-integration provider 完成其 contract 与执行前披露中声明的常规集成动作、推送已确认目标分支，以及删除已安全合入的本地 worktree 和本地任务分支
- **AND** Task Finish MUST 遵循 provider contracts，且 MUST NOT 复制或覆盖 verification、Git integration 或 worktree lifecycle provider 的内部 policy

#### Scenario: 默认 Git provider 保持现有集成策略
- **WHEN** `git-ops` 是已绑定的 `buildr.git-task-integration/v1` provider
- **THEN** 默认 task integration MUST 继续使用无语义冲突的必要 rebase 和 fast-forward-only 集成
- **AND** MUST NOT 因验证保证变化扩大 Git 授权

#### Scenario: 默认收尾授权的固定排除项
- **WHEN** 收尾需要 force push、删除远端任务分支、丢弃改动、改写共享分支历史或解决语义冲突
- **THEN** “收尾” MUST NOT 授权这些动作
- **AND** Agent MUST 停止并取得用户对具体动作的明确授权或决策

#### Scenario: Optional 资产审查 provider 缺失
- **WHEN** `buildr.task-asset-review/v1` optional dependency 未绑定
- **THEN** Task Finish MUST 跳过资产审查阶段并明确记录该降级
- **AND** 收尾的其他 required 阶段 MUST 继续执行

#### Scenario: 安全清理 task worktree
- **WHEN** 目标分支已包含任务提交、远端目标分支已推送且 task worktree 干净
- **THEN** Task Finish MUST 调用已绑定 worktree-lifecycle provider 确认 cleanup preconditions 和本机入口迁移要求
- **AND** Task Finish MUST 按 provider contract 清理并检查清理后的 worktree 列表和仓库状态
