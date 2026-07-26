# OpenSpec确定性同步与Task Finish收敛优化

## 摘要

把能够机械证明唯一结果的OpenSpec sync变成Buildr产品能力，让Task Finish正常路径无需Agent手工编辑canonical specs，同时补齐root/cwd、低噪声诊断和durable效率证据。

## 背景与问题

上一轮真实收尾耗时约6分52秒。正式验证并行化已把required capabilities收敛到32.54秒，但OpenSpec convergence attempt仍耗时94.8秒，并伴随多次Workspace/Product/Service cwd错误、手工receipt搬运和大体积full checkpoint输出。现有通用composite handler并未真正持有OpenSpec语义阶段。

## 目标与非目标

目标是由产品对保守白名单操作生成只读plan、原子apply并持有完整convergence receipt；任一歧义整批零写入并回退Agent。不会用模型置信度判断确定性，不自动解决语义冲突，也不移除agent-driven fallback。

## 受影响角色

主要影响执行Buildr任务收尾的Agent和审查收尾效率/质量的维护者。普通用户仍只表达“收尾”，无需理解planner、receipt或cwd。

## 核心流程

Task Finish解析权威Workspace/Project roots，调用convergence orchestrator。Orchestrator依次执行rehearsal、pre-sync guard、deterministic plan、atomic apply、strict validation和post-sync guard。Safe批次直接完成；blocked批次停在plan并交给`openspec-sync-specs` Agent fallback，之后重新进入guarded convergence。

## 关键变化

- 独立deterministic sync planner/apply产品模块与公共JSON入口。
- 保守确定性白名单、already-applied幂等和整批零写入。
- 产品持有OpenSpec阶段receipt和resume。
- Task Finish不理解Markdown合并，只消费orchestrator结果。
- 自动root/cwd解析，completion receipt补齐完整timing与工具开销。
- full diagnostics使用引用和有界preview。

## 影响、风险与兼容性

影响OpenSpec/Task Finish application、CLI、JSON、随包Skill/contract和验证。主要风险是Markdown结构误判与自动覆盖范围过窄；前者通过未知输入fail closed和atomic fixtures控制，后者通过真实blocked evidence后续扩展。现有agent-driven流程保持兼容。

## 验收摘要

必须覆盖safe、already-applied、partial/冲突blocked、receipt stale、atomic failure和root/cwd误路由；下一次真实finish应证明OpenSpec正常路径不再手工编辑canonical，并分别报告验证、convergence、Agent往返、输出量与端到端wall-clock。

## 技术artifacts

- `proposal.md`
- `design.md`
- `specs/openspec-deterministic-sync/spec.md`
- `specs/task-finish-execution/spec.md`
- `specs/openspec-contract-guard/spec.md`
- `tasks.md`
