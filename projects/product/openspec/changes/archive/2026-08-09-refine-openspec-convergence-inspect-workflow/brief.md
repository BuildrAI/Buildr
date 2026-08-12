# OpenSpec 收敛与收敛检查流程优化

## 一句话摘要

`OpenSpec Convergence Inspect` 只检查尚未终结的收敛事务；正常 `OpenSpec Converge` 成功归档后释放事务回执，后续研发交付和环境清理不再追索它。

## 背景与问题

当前 `OpenSpec Audit` 被同时理解为事务恢复检查和归档后的长期审计，使 `Convergence Receipt` 被错误地当作永久交付证据。实际上正常 Converge 已经完成 canonical 写入确认和 Change 归档，而 `.buildr` 控制材料不会进入正常 Task 交付；清理 Worktree 后再次要求读取 Receipt 因而既重复长期 authority，也制造无法证明的假失败。

## 目标与非目标

目标是统一 OpenSpec Convergence 术语，让 Converge 对正常收敛负责，让 Convergence Inspect 只对仍存在的异常恢复现场负责，并让 Archived Change、Canonical Specs、Git 与 Development/Finish 事实继续承担长期证明。

本任务不建设长期 Audit、history/event store、第二份 Result 或新的 lifecycle authority，也不迁移、删除或回填历史 Archived Change 中已有的 Receipt。

## 受影响用户或角色

- 执行 OpenSpec Change 的 Agent：使用唯一 Converge 写入口，并只在未决现场运行 Inspect。
- 维护 Buildr 的开发者：通过 CLI、公共 JSON 与产品候选验证取得一致结果。
- 审查与交付人员：正常归档后直接消费既有长期事实，不在 Environment cleanup 后追索事务材料。

## 核心流程

1. Agent 完成 Change checklist 后运行 `buildr openspec converge`。
2. Converge 在首次 canonical mutation 前写入事务 Receipt，执行投射验证、条件写入、写后确认与 archive。
3. 正常归档成功后，Converge 释放本次事务 Receipt，再返回 `passed + archived`。
4. 只有 Converge 中断或返回恢复不确定，且现场仍存在时，Agent 才运行 `buildr openspec convergence inspect`。
5. Inspect 对 active Change 的有效 Receipt 比较 before、expected 与 actual；未开始或已经归档均返回 `not-applicable`。
6. Formal Verification、Task Finish 与 Environment cleanup 消费正常终态，不运行 Inspect，也不要求长期保留 Receipt。

## 关键变化

- `buildr openspec convergence inspect` 与 `buildr.openspec-convergence-inspect/v1` 替换旧 Audit 命名。
- Convergence Receipt 从长期可移植证明收窄为事务期恢复材料。
- Converge 增加正常终态释放和 archive 后幂等终结。
- Product Candidate 用 candidate Archived Change delta 与 canonical facts 关联规范变化，不再要求 tracked Receipt。
- Skills、Component contributions、当前认知与运行时契约同步限制 Inspect 的适用阶段。

## 影响、风险与兼容性

`openspec audit` 是明确移除的旧入口，将返回标准 unknown-command；CLI registry、公共 JSON、Skills 和文档同步切换。历史 Receipt 原样保留但不再作为正常流程 authority。Archive 已完成而 Receipt 释放失败时，Converge 返回可重试 blocked，不回滚已确认的 canonical 或 archive。

本任务不改变 SQLite schema、Task Record、Task Environment、Task Development 或 Task Finish Result。

## 验收摘要

- Active Change 未开始收敛时 Inspect 返回 `not-applicable`。
- 未决事务可以区分 before、expected 与 unknown，且 Inspect 始终只读。
- 正常 Converge 归档成功后释放新 Receipt；重复 Converge 幂等通过。
- Archived Change 的 Inspect 返回 `not-applicable`，环境清理后没有 Receipt 门禁。
- 无 tracked Receipt 的正常归档候选仍通过 OpenSpec contract audit；无法关联的 canonical 变化仍被拒绝。
- 旧 Audit 命令、旧 JSON schema 和所有正常流程消费者全部移除。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta Specs](specs/)
- [Implementation Tasks](tasks.md)
- [Knowledge Impact](.buildr/knowledge-impact.yml)
