# 优化 Buildr Candidate 验证

## 一句话摘要

让每个正式任务通过一个 delivery plan 验证冻结目标：普通变更选择 affected 证据，验证选择基础变化时同一 plan 扩展为 full，并从完整回归中移出重复或节点不适用的专项执行。

## 背景与问题

当前 `product.candidate` 对全部 Product 路径交付必需，最近一次正式执行耗时 350.004 秒。Candidate 的 44 个 step 还包含五次重复 Browser fixture、Release Git convergence 和 clean-checkout onboarding。首轮优化又增加了重叠的 Task-affected/Candidate required capabilities，暴露出成本、范围和验证节点被混成同一分类的问题。

## 目标与非目标

- 目标：建立唯一 required delivery 能力、确定性的 affected/full 选择，并按唯一证明事实收敛显式完整回归。
- 非目标：不按改动大小或风险评分决策，不引入 P0.5、Result 字段、通用测试 DSL 或新调度平台。

## 受影响角色

主要影响维护 Buildr 的 Agent 和开发者；用户 Project 仍使用同一 `verification.yml` v2 与 Task Verification v3 模型。

## 核心流程

冻结候选后，Finish 始终选择 `product.delivery`。它按相对目标分支的 changed paths 运行 affected plan；命中 registry/planner/runner 等全局 owner 时，同一 plan 扩展为 full。Local App 变更另行选择一次 Browser capability，显式完整回归和 Release 专项按维护或发布需要运行。

## 关键变化

- 用唯一 required `product.delivery` 取代重叠的 `product.task-affected` / `product.candidate`，并保留非默认 `product.full-regression`。
- Quick、affected/full 与 Candidate/Release 分别表达成本、范围和验证目标/节点。
- Browser smoke 成为条件化必需的独立能力，不再在 Candidate 中重复五次。
- Release Git convergence 与 repository onboarding 退出默认 Candidate，但保留 affected/Release 与 focus 入口。
- Candidate 完整性按必要主证据定义，不再等同全部测试的并集。

## 影响、风险与兼容性

`npm test`、`test:changed`、`test:focus`、`test:candidate`、Task Verification Result 和 Finish authority 保持兼容。主要风险是 affected path 映射遗漏；未映射路径继续 fail closed，验证基础自身变化由同一 changed plan 强制扩展为 full。

## 验收摘要

需要证明代表性局部路径只选择适用 evidence，关键验证路径由同一 plan 选择 full，Local App 路径只执行一次 Browser 主证据，Release 专项仍可独立运行；本 Change 因修改 registry/policy 必须在冻结目标上通过 full delivery plan，并验证 `test:candidate` 兼容入口和前后耗时。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Project Testing delta](specs/project-testing-guidance/spec.md)
- [CLI verification delta](specs/cli-modular-architecture/spec.md)
- [Tasks](tasks.md)
