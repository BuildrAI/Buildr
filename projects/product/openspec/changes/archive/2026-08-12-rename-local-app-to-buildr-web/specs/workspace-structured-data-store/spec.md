## MODIFIED Requirements

### Requirement: canonical Workspace Structured Store 必须验证 writer runtime provenance
Buildr MUST 在创建数据库、打开 writable connection、应用 migration 或写入 canonical Workspace Structured Store 前，验证 caller runtime source 对 target canonical Workspace 的 writer provenance。来自与 target 共享 Git common-dir 的 linked task worktree、候选 checkout 或无法证明为 retained controller 的自举 runtime MUST 在任何 SQLite/filesystem mutation 前被拒绝；CLI、HTTP、Buildr Web 与 internal driver MUST 经过同一保护边界。该 writer 规则 MUST NOT 延伸为对已解析 root 的只读 Git/worktree 观察，也 MUST NOT 降低普通用户 Workspace 对其已安装/retained runtime 的合法单库写入能力。

#### Scenario: candidate runtime 尝试写 canonical database
- **WHEN** 自举 task worktree 中的 candidate Buildr runtime 将 canonical retained Workspace 作为 Structured Store target 执行任一 writable Task、migration 或 repository action
- **THEN** Buildr MUST 返回稳定的 writer-provenance rejection diagnostic
- **AND** MUST NOT 创建 SQLite、WAL/SHM、目录、ledger row、schema 或业务数据 mutation

#### Scenario: retained controller 写 canonical database
- **WHEN** receipt-pinned retained controller 对其 canonical Workspace 执行合法 writable action
- **THEN** Buildr MUST 允许现有 transaction 与连续 migration 行为继续执行
- **AND** MUST 保持 checksum、database-newer-than-runtime、integrity 和 busy 的现有 fail-closed 语义

#### Scenario: 普通用户 Workspace 写自己的 database
- **WHEN** 非自举候选 topology 中的 Buildr runtime 对其 Workspace root 执行合法 writable action
- **THEN** provenance guard MUST 不得仅因该 runtime 不在自举 retained checkout 而拒绝
- **AND** Buildr MUST 继续只使用该 Workspace 的唯一 local-only Structured Store

#### Scenario: 已解析 root 的只读调用不观察 Git
- **WHEN** Application 对已经解析的 canonical、candidate 或 validation Workspace root 执行只读 structured store action
- **THEN** store infrastructure MUST 完成读取或返回稳定的 not-found/health diagnostic
- **AND** MUST NOT 调用 checkout observer、`git rev-parse` 或其他 Git/worktree provenance 命令
