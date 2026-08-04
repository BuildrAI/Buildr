# openspec-upgrade-integration Specification

## Purpose
定义 Buildr 对经过评估的 OpenSpec 上游版本、planning update workflow、guard 职责边界、sidebar 组合和 Stores beta 范围的集成契约。

## Requirements

### Requirement: Buildr 只支持经过评估的 OpenSpec 集成版本
Buildr MUST 仅将经过 Product 集成验证的 OpenSpec 上游 release 作为 OpenSpec Component 的支持版本，并使依赖、外部 Command 声明、Component metadata、上游 workflow Skill、integrity、Buildr sidebar、contract guard 和 package targets 对应同一 release。

#### Scenario: 采用 OpenSpec 1.6.0
- **WHEN** Buildr 发布包含 OpenSpec 1.6.0 的 OpenSpec Component
- **THEN** Product source MUST 将 `@fission-ai/openspec`、OpenSpec Command version constraint、Component upstream metadata 和 guard 支持版本一致地声明为 `1.6.0`
- **AND** Component integrity MUST 覆盖从该 release 刷新的外部 workflow Skills 和 Buildr 自有 members
- **AND** package verification MUST 检查这些版本和成员关系，而不是只检查单个 package dependency

#### Scenario: 版本声明不完整或不一致
- **WHEN** OpenSpec integration 的任一受管版本或成员声明与其他受管声明不一致
- **THEN** package or Component verification MUST fail
- **AND** Buildr MUST NOT 将该 source tree 作为已支持的 OpenSpec release 交付

### Requirement: Buildr 受控交付 OpenSpec planning update workflow
Buildr MUST 将上游 `openspec-update-change` 作为可选的 planning-only workflow Skill 交付，并保持它与 Buildr task、Component 和 contract 边界一致。

#### Scenario: 用户修订已有 change 的 planning artifacts
- **WHEN** 用户要求更新、协调或修订已有 OpenSpec change 的既有 planning artifacts
- **THEN** `openspec-update-change` MUST 先通过 `openspec status --change <id> --json` 解析实际 change、artifact paths 和 `changeRoot`
- **AND** Skill MUST 只修改 status 返回的 `existingOutputPaths` 中的 planning artifacts
- **AND** Skill MUST 明确确认每项拟议修改
- **AND** Skill MUST NOT 创建缺失 artifact、修改实现代码、执行 apply、sync 或 archive

#### Scenario: planning 修订意味着实现变化
- **WHEN** `openspec-update-change` 识别出已确认的 planning 修改需要改变实现代码
- **THEN** Skill MUST 报告该影响并引导用户进入 `openspec-apply-change`
- **AND** Skill MUST NOT 自行开始代码实现或绕过 task-worktree 决策

#### Scenario: Buildr 为 update workflow 组合 sidebar
- **WHEN** enabled installed OpenSpec Component 的 runtime 投射 `openspec-update-change`
- **THEN** Buildr MUST 以经过 integrity 验证的上游 Skill source 为基础组合 Buildr sidebar contribution
- **AND** sidebar MUST 只补充从 planning 转入实现前重新执行 task-worktree 决策的 Buildr 特有约束
- **AND** sidebar MUST NOT 重复上游已有的 status/path 解析、planning-only、逐 artifact 确认或 apply 引导
- **AND** workspace 中的上游 Skill source MUST 保持未被 Buildr 修改

### Requirement: Buildr OpenSpec guard 只保留上游未提供的契约安全
Buildr MUST 将 `openspec-contract-guard` 限定为 OpenSpec 1.6.0 未提供的跨 change、历史基线和同步证据保证，并 MUST NOT 维护第二套等价的 OpenSpec delta parser 或 archive validator。

#### Scenario: 上游 1.6.0 已提供单 change 安全检查
- **WHEN** OpenSpec 1.6.0 已验证 delta operation、Requirement existence、rebuilt spec validity 或 `MODIFIED` scenario preservation
- **THEN** `openspec-contract-guard` MUST NOT 重复实现等价检查
- **AND** Product tests MUST 证明这些被移除职责由锁定的上游 release 提供

#### Scenario: Buildr 保留跨 change 与基线检查
- **WHEN** change 准备进入 apply 或 canonical sync
- **THEN** guard MUST 继续验证 proposal capability 与 delta 对齐、完整 baseline、canonical Requirement 漂移和其他 active changes 的 Requirement identity 冲突
- **AND** 任一冲突、缺失或漂移 MUST fail closed

#### Scenario: Buildr 保留 Agent-driven sync 证据
- **WHEN** Agent 使用 `openspec-sync-specs` 修改 canonical specs
- **THEN** guard MUST 在写入前生成绑定 baseline 和预期 delta 的 pre-sync receipt
- **AND** guard MUST 在写入后验证 touched 与 untouched Requirements 并生成 Agent-readable post-sync result

#### Scenario: 集成版本不一致
- **WHEN** 当前 Component、Command、CLI、baseline 或 guard 版本与 Product 已评估的 OpenSpec integration 不一致
- **THEN** guard MUST fail closed 并引导修复集成版本
- **AND** version source consistency MUST 由 package 和 Component verification 负责验证

### Requirement: Buildr OpenSpec sidebars 只表达 Buildr 特有增量
Buildr MUST 仅在上游 workflow 未覆盖且 Buildr consumer 需要该约束时保留 OpenSpec Skill Contribution，并通过 Component integrity 和组合测试验证固定组合。

#### Scenario: 保留 Buildr 特有 sidebar
- **WHEN** sidebar 约束 task-worktree 决策、Candidate evidence、proposal baseline gate 或 Task Finish pre-sync/post-sync gate
- **THEN** Buildr MUST 保留并验证该 contribution

#### Scenario: 上游已提供相同路径保证
- **WHEN** OpenSpec 1.6.0 workflow 已通过 status context 解析 change、artifact paths 和 `changeRoot`
- **THEN** Buildr MUST 合并或删除只重复该保证的 explore、sync 或 archive sidebar 内容
- **AND** Buildr MUST NOT 因删减重复文案而移除 task-triage 或 Task Finish 的安全门禁

#### Scenario: Sidebar 不建立独立 capability contract
- **WHEN** sidebar 只作为 OpenSpec Component 固定组合中的自然语言增量且没有可替换 provider
- **THEN** Buildr MUST 使用 Component member integrity 和 composition tests 保护它
- **AND** Buildr MUST NOT 为每个 sidebar 创建 `provides`、`requires` 或 binding
- **AND** 现有 task-worktree、task-verification、git-operations、task-asset-review 和 task-finish capability contracts MUST 保持有效

### Requirement: Buildr 不将 OpenSpec Stores 作为默认受支持工作流
Buildr MUST 不因 OpenSpec 1.6.0 包含 Stores beta 而在默认 OpenSpec Component、Buildr Skills 或 Project 资产中声明、创建、迁移或操作 Store。

#### Scenario: 上游 CLI 暴露 Store 命令
- **WHEN** 用户安装的受支持 OpenSpec CLI 暴露 Store 相关命令
- **THEN** Buildr MUST 继续将其视为未纳入默认支持范围的上游能力
- **AND** Buildr MUST NOT 因 Component install、update、sync、runtime render 或 contract check 创建、迁移或修改 Store 数据

#### Scenario: 用户要求启用 Stores
- **WHEN** 用户要求 Buildr 管理、迁移或依赖 OpenSpec Stores
- **THEN** Agent MUST 说明该能力尚未纳入 Buildr 默认支持范围
- **AND** Agent MUST 先创建独立的评估与设计 change，再改变 Buildr source assets 或 Project workflow
