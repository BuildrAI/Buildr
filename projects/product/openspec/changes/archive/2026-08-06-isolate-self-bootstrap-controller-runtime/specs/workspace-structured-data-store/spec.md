## ADDED Requirements

### Requirement: canonical Workspace Structured Store 必须验证 writer runtime provenance
Buildr MUST 在创建数据库、打开 writable connection、应用 migration 或写入 canonical Workspace Structured Store 前，验证 caller runtime source 对 target canonical Workspace 的 writer provenance。来自与 target 共享 Git common-dir 的 linked task worktree、候选 checkout 或无法证明为 retained controller 的自举 runtime MUST 在任何 SQLite/filesystem mutation 前被拒绝；CLI、HTTP、Local App 与 internal driver MUST 经过同一保护边界。该规则 MUST NOT 降低普通用户 Workspace 对其已安装/retained runtime 的合法单库写入能力。

#### Scenario: candidate runtime 尝试写 canonical database
- **WHEN** 自举 task worktree 中的 candidate Buildr runtime 将 canonical retained Workspace 作为 Structured Store target 执行任一 writable Task、migration 或 repository action
- **THEN** Buildr MUST 返回稳定的 writer-provenance rejection diagnostic
- **AND** MUST NOT 创建 SQLite、WAL/SHM、目录、ledger row、schema 或业务数据 mutation

#### Scenario: retained controller 写 canonical database
- **WHEN** receipt-pinned retained controller 对其 canonical Workspace 执行合法 writable action
- **THEN** Buildr MUST 允许现有 transaction 与连续 migration 行为继续执行
- **AND** MUST 保持 checksum、database-newer-than-runtime、integrity 和 busy 的现有 fail-closed 语义

#### Scenario: 普通用户 Workspace 写自己的 database
- **WHEN** 非自举候选 topology 中的 Buildr runtime 对其 canonical Workspace 执行合法 writable action
- **THEN** provenance guard MUST 不得仅因该 runtime 不在自举 retained checkout 而拒绝
- **AND** Buildr MUST 继续只使用该 Workspace 的唯一 local-only Structured Store

### Requirement: canonical migration 只能由已集成 retained runtime 激活
Buildr MUST 只允许已携带当前 migration assets 的 retained controller 升级 canonical Workspace Structured Store。候选 migration MUST 先在独立 Task Validation Workspace 验证；失败、放弃或未集成候选 MUST NOT 修改 canonical ledger、删除 canonical schema 或生成 down migration。

#### Scenario: 候选 migration 验证失败或任务放弃
- **WHEN** candidate runtime 在 Task Validation Workspace 中的 migration 或测试失败，或该 Task 被放弃
- **THEN** Buildr MUST 只清理该 Task-owned validation store/Workspace
- **AND** canonical database 的 schema、ledger 和业务数据 MUST 保持不变

#### Scenario: 已集成 runtime 首次写 canonical database
- **WHEN** 含新 migration 的最终候选已进入 retained checkout，且 retained controller 对 canonical Workspace 执行下一次合法 writable action
- **THEN** runner MUST 依现有连续 migration 规则原子应用新 script 并登记 checksum
- **AND** MUST NOT 导入 Task Validation Workspace 的任何测试或任务数据
