## MODIFIED Requirements

### Requirement: candidate runtime identity 必须同时约束 runtime projection 与 Structured Store mutation
自举 candidate source 的 runtime identity guard MUST 区分纯 runtime projection 与完整 Workspace source sync，并一致约束 runtime projection、Workspace source asset 与 Structured Store mutation。候选 source MAY 向自身 task checkout 执行不包含 source/store mutation 的 projection-only render，也 MAY 向无关的独立验证 Workspace 执行完整 sync；同一 Git common-dir 的 retained Workspace、peer task worktree、验证根外共享 runtime，以及 linked candidate 自身源码 checkout 上的完整 sync MUST 在任何写入前被拒绝。

#### Scenario: candidate runtime 使用验证根
- **WHEN** candidate source 对自身 linked task checkout 执行包含 Rule、workspace Skill 与产品入口 Buildr Skill 的 projection-only render
- **THEN** runtime guard MUST 允许该投射并返回候选验证 provenance evidence
- **AND** MUST NOT 迁移 Structured Store、同步 Project registry、package builtin 或 Component source asset
- **AND** evidence MUST NOT 宣称 retained runtime 或 canonical data 已生效

#### Scenario: candidate runtime 在独立验证 Workspace 执行完整 sync
- **WHEN** candidate source 把不属于同一 Git common-dir checkout 的独立验证 Workspace 作为完整 sync target
- **THEN** runtime guard MUST 允许该隔离 mutation
- **AND** evidence MUST NOT 宣称 retained runtime 或 canonical data 已生效

#### Scenario: linked candidate 对自身源码执行完整 sync
- **WHEN** linked candidate Product source 请求以自身 checkout 为 target 执行完整 sync
- **THEN** guard MUST 在 Workspace 初始化、plan、migration、source asset 或 runtime mutation 前 fail closed
- **AND** diagnostic MUST 返回 caller、target、拒绝原因、projection-only 命令与独立验证 Workspace 指引

#### Scenario: candidate runtime 目标越界
- **WHEN** candidate source 请求写入 retained Workspace runtime、canonical Structured Store、peer task worktree 或验证根外共享 user runtime
- **THEN** guard MUST 在首个相关 mutation 前 fail closed
- **AND** diagnostic MUST 区分 caller identity、允许 validation boundary 与被拒绝 target identity

#### Scenario: retained source 保持正常同步
- **WHEN** retained Product source 对 canonical Workspace 执行完整 sync，或为 task worktree 执行 runtime projection
- **THEN** runtime guard MUST 保持既有合法行为
- **AND** MUST NOT 要求 Task Record 或 Environment Receipt 作为普通 sync/render 的前置权限
