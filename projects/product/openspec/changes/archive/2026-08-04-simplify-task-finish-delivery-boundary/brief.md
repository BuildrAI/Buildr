# 收敛并简化 Task Finish 交付边界

## 一句话摘要

删除 current specs、Roadmap、CLI help 与 package/runtime 中仍把 Task Finish 路由到旧 Change/Candidate/Verification 或 worktree target authority 的残留，保持已经交付的窄 v2 adapter。

## 背景与问题

P0.5 及其后续窄 Change 已经交付 current Development Handoff、固定五阶段、run-owned Delivery Carrier、deterministic reuse、Delivery Adaptation、target-race exact resume、remote readback、retained activation 与 Task Environment cleanup。真实实现和主要 canonical Task Finish spec 已经遵守这些边界，但更早的 workflow/package requirement、Roadmap 与 CLI help 仍有相互冲突的旧描述，可能让 Agent重复生成 Candidate、重跑 Formal Verification 或把 OpenSpec convergence 当作 Finish 动作。

## 目标与非目标

目标是让所有 current authority 和入口只表达现行 v2 delivery boundary，并用 residual verification 防止旧路由回归。非目标是新增 non-Git、multi-repo、task-branch、PR、release、deploy、adapter registry、Finish Receipt 或通用状态框架。

## 受影响用户或角色

- 使用 Buildr Task lifecycle 的 Agent：获得一个明确的 current handoff、carrier、delivery、cleanup 与恢复边界。
- Buildr 维护者：可以从 canonical specs、help、package graph 与 tests 得到一致事实，不再区分相互冲突的旧 P0.8 描述。

## 核心流程

`Task Development current handoff → Task Finish preflight → prepare Delivery Carrier → verify equivalence → deliver/retained activation → Task Environment cleanup → Task Manager terminal state`。

Delivery Baseline 前进但Task Contribution可机械等价时直接 deterministic reuse；Git conflict在run-owned carrier进入Delivery Adaptation；deliver target-race使用产品生成的exact token从`prepare`恢复。只有Development Application报告原Task source/context/policy/gates/handoff真实stale时返回Development。

## 关键变化

- 全文替换冲突的workflow、CLI与package requirements。
- 修正Roadmap中“目标前进必然重建Candidate”和“P0.8整体替换”的旧描述。
- 修正CLI help中的worktree start point与OpenSpec converge旧路由。
- 增加current package/runtime negative gate；若审计没有可执行旧writer/router/binding，则记录zero-delete而不制造删除。

## Retain / Delete / Simplify / Optimize 审计结果

- Retain：current Development handoff、固定五阶段、run-owned carrier、deterministic reuse、Delivery Adaptation、exact-token target-race resume、remote readback、retained activation 与 Environment cleanup。
- Delete：删除 current specs/docs/help/package 中的旧 Change/Candidate/Verification/worktree-target 路由。Application、CLI registry/bootstrap、compose runtime、JSON schema、managed mutations 与 capability graph 未发现真实可达的旧 writer/router/binding，故可执行面为 zero-delete；旧 v1 run 继续 fail closed，archive history 保持只读。
- Simplify：current Product/Git adapter 继续直接接线；没有第二个真实 adapter，不建立 registry、selection protocol 或未来路径占位。Git effects 留在 Product adapter，retained activation 留在 Product，cleanup 只交给 Task Environment。
- Optimize：正常路径保持一次 canonical CLI；所有 blocked 结果只给一个 next workflow/action；连续 target race 每次生成新 exact token，从 `prepare` 重做 carrier phases，Candidate/generation 与 Formal Verification 事实保持不变。

## 影响、风险与兼容性

当前run/result v2、Task/Environment/Development records、公共CLI actions和真实delivery行为保持兼容。主要风险是遗漏分散在current docs/tests中的旧表述，使用跨registry/static/runtime扫描与真实journey验证控制。历史archive保持只读，不做迁移。

## 验收摘要

canonical specs、Roadmap、current knowledge、Skill/contract、CLI help、package graph与实现一致；正常路径一次canonical CLI完成；Delivery Adaptation与连续target-race复用同一Candidate/handoff；`formalVerificationExecutions = 0`；remote readback、retained activation与Environment cleanup可证明；focused、affected、完整Product Candidate与真实journey通过。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `specs/agent-task-workflows/spec.md`
- `specs/cli-product-surface/spec.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`
