## Why

上一轮真实 Task Finish 虽已把确定性 OpenSpec convergence 收进产品入口，但收尾仍因新 capability 骨架直到正式验证才暴露 schema 错误、候选身份变化后需要逐步重建多段证据、compact diagnostics 与 completion metrics 丢失真实执行信息而达到 22 分 13 秒。最终 affected assurance 的最慢项又集中在 OpenSpec contract fixtures（90.174 秒），现在需要同时收敛正确性、恢复往返和验证成本，才能稳定逼近约 3 分钟的正常收尾目标。

## What Changes

- deterministic sync 在写 canonical 前验证新 capability 的完整 OpenSpec 文档骨架，包括 `Purpose`、`Requirements`、Purpose 完整度与最终严格校验所需结构；不能证明合法时整批零写入并返回 semantic fallback。
- Task Finish 提供 identity transition/recovery 产品入口：一次提交新的 environment、tree、target、runtime 与 assurance fingerprints，原子计算真正失效范围，并自动复用或重建确定性步骤，避免 Agent 逐步执行 claim/submit/resume。
- recovery 结果明确区分 implementation change、archive-sensitive metadata 与 `runtime-projection-only` transition；只允许政策声明且证据完整的转换复用正式保证。
- compact blocked result 保留最小结构化 child diagnostic、失败 stage、恢复 checkpoint 和 durable full-detail 引用，避免只显示通用 `Command failed`。
- completion receipt 从 executor 和 CLI observation ledger 汇总真实 command/tool round trips、bounded output bytes、Agent orchestration gap 与产品执行耗时；缺失来源时明确标记 coverage，不以不完整计数冒充完整审计。
- 优化 OpenSpec contract fixtures：拆分稳定 fixture preparation 与 assertion execution，按 source identity 复用只读准备结果，并在 verification scheduler 中避免同一候选重复构建等价 fixture；保持隔离、失败现场和 strict coverage。
- 为 affected selector 增加 OpenSpec fixture 的独立 timing、cache/reuse evidence 与目标预算；正常路径将该 family 控制在 20 秒预算内，超预算仍报告但不隐藏验证结果。
- 增加真实 finish benchmark，覆盖首次成功、候选修订后恢复、正式验证失败后修复和 runtime projection closeout，记录端到端 wall-clock、重试浪费与输出量。

不包含破坏性变更；不降低 affected/Candidate assurance，不把语义冲突自动化，也不因优化缓存跨 candidate 复用可变或写副作用 fixture。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `openspec-deterministic-sync`: 在 canonical 写入前保证新 capability 文档骨架满足严格 OpenSpec 结构与 Purpose 完整度，失败时零写入 fallback。
- `task-finish-execution`: 增加原子 identity recovery、低往返 checkpoint 重建、结构化 compact diagnostics 与具有 coverage 的真实完成计量。
- `task-verification`: 为 OpenSpec contract fixtures 增加 identity-bound preparation reuse、重复工作消除、独立 timing/evidence 与性能预算。

## Impact

影响 Buildr Service 的 deterministic sync planner/apply、Task Finish state machine/application/CLI、verification registry/scheduler/OpenSpec fixture runner、JSON contracts、completion receipt 与 benchmark tests；同步调整随包 Task Finish Skill/capability contract、Product current knowledge 流程说明和现有 Task Finish 优化任务看板。不会修改外部 OpenSpec CLI，也不会把 task environment 或 Agent session 作为验证缓存的全局共享边界。
