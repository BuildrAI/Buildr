# 修复多项目任务流程闭环

一句话摘要：保持每个Project独立Verification Plan与Execution Record authority，同时让一个正式Task在Environment、Result、Current Knowledge和Finish边界完整聚合全部Project事实。

## 背景与问题

rc.26已经采用“每个有效Project一份Formal Verification Plan”，但Result reconciliation仍要求所有records属于同一Plan；多个Project的Preparation请求还会整值覆盖，Current Knowledge与shared Environment Finish也缺少Project/repository完整性。

## 目标与非目标

- 目标：per-Project Plan匹配、Task级Result完整覆盖、一次完整Preparation closure、Project级Knowledge disposition、shared Finish只读fallback和逐repository Git基线。
- 非目标：不新增合并Plan、Plan store、SQLite表、通用DAG或让Finish解释Verification/Knowledge。

## 受影响角色与流程

- Agent：按全部Project形成Plans，一次准备完整closure，逐Project执行并一次对账Task级Result。
- 用户：不再需要寻找不存在的合并Plan参数，也不需要在多个Project准备之间反复恢复。
- Buildr：继续由各专业Application持有唯一writer，跨Project只聚合最小identity、facts与disposition。

## 关键变化

- Verification reconciliation按Project分组，Project内Plan一致、Project间Plan独立。
- Environment Plan Request从完整Plan集合形成精确requirements并集。
- Current Knowledge显式覆盖每个有效Project。
- shared Environment的reconciliation可从handoff scope恢复repository context。
- Task创建基线尊重每个repository声明的integration branch与remote。

## 风险、兼容性与验收

- 单Project与仅工作区路径保持兼容；旧多Project Knowledge不能直接满足新handoff。
- Result缺少任一Project、同Project混用Plan或Environment closure不完整均零写入失败。
- 三Project黄金流程必须从Plan、prepare、policy、Candidate、records、Result推进到handoff/Finish readiness。

## 技术Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Verification Delta](specs/task-verification/spec.md)
- [Task Environment Delta](specs/task-environment-preparation-plans/spec.md)
- [Task Development Delta](specs/task-development/spec.md)
- [Task Finish Delta](specs/task-finish-execution/spec.md)
- [Agent Workflow Delta](specs/agent-task-workflows/spec.md)
- [Tasks](tasks.md)
