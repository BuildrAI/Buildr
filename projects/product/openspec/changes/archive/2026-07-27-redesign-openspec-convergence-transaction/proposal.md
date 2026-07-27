## Why

Buildr 当前把 OpenSpec 收敛的契约基线、同步前回执、确定性计划、收敛回执和恢复回执分别持久化，并让 Task Finish 理解多阶段恢复路径；同一输入身份被重复记录，任一漂移都会放大为多份旁路状态不一致。现在已有第一代产品化 `openspec converge` 和两个并发恢复/身份实现可供核对，适合在继续叠加恢复阶段前，把安全门禁重构为由真实文件事实驱动的单一产品事务。

## What Changes

- 将 OpenSpec 收敛统一为“输入身份 → 确定性计划 → 隔离严格验证 → 条件式原子应用 → 写后确认 → `archive --skip-specs`”事务。
- 只持久化一份 convergence receipt，以 canonical 文件的 `beforeDigest` / `expectedDigest` 和当前实际 digest 判断恢复，不再依赖长期阶段链。
- 保留隔离验证、并发/输入漂移检测、批量零写入、写后确认、断点恢复和关闭式失败；状态无法证明时返回 `recovery-unprovable`，语义冲突时返回 `blocked`。
- 拆分 planner、projected validator、canonical applier、observer 和 receipt 模块，缩小 OpenSpec domain 与 CLI 组合入口。
- Task Finish 只消费 `buildr openspec converge` 的 `passed`、`blocked`、`recovery-unprovable` 结果，不再编排 baseline、pre-sync、plan、apply、post-sync 或 canonical 恢复。
- 为 Task Finish checkpoint 提供不加载 OpenSpec domain 的轻量 CLI bootstrap，使 OpenSpec 模块语法错误或 Git 冲突时仍能持久化 blocked 并释放 lease。
- 提供旧 baseline、pre-sync receipt、sync plan、convergence/recovery receipt 的只读兼容与一次性迁移判断；不采用不可信旧状态，也不要求恢复 canonical 后重建 baseline。
- **BREAKING**：新的确定性收敛不再生成或推进旧的阶段型 sidecar；旧的 `baseline create`、`check --stage pre-sync|post-sync`、`sync-plan`、`sync-apply` 保留过渡期诊断兼容，但不再是 Task Finish 的正常编排接口。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `openspec-deterministic-sync`: 改为单一身份、单一计划和单一回执的文件事实驱动事务，并定义恢复、并发与幂等行为。
- `openspec-contract-guard`: 将 baseline/pre-sync/post-sync 的安全保证收敛进事务前置冲突检查与写后确认，定义旧 sidecar 兼容边界。
- `task-finish-execution`: Task Finish 只调用产品收敛事务，并通过轻量 bootstrap 在 OpenSpec domain 损坏时记录 checkpoint 和释放 lease。
- `agent-task-workflows`: Agent 只处理语义冲突或无法证明的状态，不参与内部阶段编排和 canonical 恢复。

## Impact

- 主要影响 `services/buildr/src/application/openspec/`、`services/buildr/src/application/domains/openspec.mjs`、CLI registry/bootstrap、Task Finish action/executor 与对应 JSON contracts。
- 更新 OpenSpec Component/Task Finish 的 Agent 指引和 CLI 文档，停止把旧阶段命令描述为正常收尾步骤。
- 需要迁移现有 contract fixtures、deterministic sync tests、Task Finish journey，并新增进程中断、并发 Change、归档失败和损坏模块 bootstrap 的完整 journey 覆盖。
- 不修改上游 OpenSpec CLI，不降低 `validate --all --strict`、active Change 冲突和 `archive --skip-specs` 门禁。
