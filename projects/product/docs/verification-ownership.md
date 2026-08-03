# Buildr 测试能力与 Task Verification 实践

本文记录 Buildr 项目当前有哪些测试能力、这些能力怎样声明给 Task Verification、Agent 在具体任务中怎样使用它们，以及测试体系仍需解决的问题和每轮优化结论。

通用测试设计以 [project-testing Skill](../services/buildr/package/targets/workspace/skills/buildr/project-testing/SKILL.md) 及其 [testing model](../services/buildr/package/targets/workspace/skills/buildr/project-testing/references/testing-model-v1.md) 为准；能力声明和正式结果以 [verification.yml](../verification.yml)、[Task Verification spec](../openspec/specs/task-verification/spec.md) 和 [task-verification Skill](../services/buildr/package/targets/workspace/skills/buildr/task-verification/SKILL.md) 为准。本文只记录 Buildr 自举实践，不建立新的 Result 或生命周期权威。

## Buildr 当前有哪些测试

Buildr 使用 Node.js 内置 `node:test`，测试入口由 `services/buildr/package.json` 和 Product 内部 registry 组织：

| 入口 | 当前用途 |
| --- | --- |
| `test:unit` | 同进程验证纯逻辑；完整套件属于 Quick |
| `test:component` | 用 fake 协作者验证单一有界 Application 组装；完整套件属于 Quick |
| `test:contract` | 主要意图是 Static Conformance；因包含真实开发入口、Git 和临时目录检查，聚合执行边界按低成本 Integration 计 |
| `test:integration` | 验证真实文件系统、Git 或子进程技术边界；按 affected 或 full 范围运行 |
| `test:integration:fast` | 历史名称；实际是完整 CLI、Workspace 与生命周期 System 集合，不属于 Quick |
| `test:changed` / `test:focus` | 按变更 owner 选择开发期反馈，或定向重跑失败步骤 |
| `test:candidate` | 显式运行 Product 核心完整回归；保留候选包交付门禁，Browser 与 Git 发布流程专项独立 |
| 专项入口 | 定向验证 Browser、OpenSpec convergence、release 等高成本场景 |

这些是 Buildr 项目内部的测试分层和编排入口。它们可以继续拆分和调整，不是 Task Verification 的公共 schema。

项目测试先判断测试意图和执行边界，再分别决定成本、范围和验证目标，不把所有概念压成一个层级：

| 问题 | 第一版分类 |
| --- | --- |
| 主要意图 | Development、Acceptance、Static Conformance、Delivery / Release |
| 执行边界 | Static、Unit、Component、Integration、System |
| 成本约束 | Quick 或不受 Quick 预算约束 |
| 选择范围 | focus、affected、full |
| 验证目标 | 开发目标、冻结 Candidate、Release artifact |

Candidate 是验证目标，不自动等于 full：普通冻结 Candidate 可以执行 affected，明确完整回归时执行 full。`System` 是执行边界，不等于 Acceptance；`Static` 是独立执行形式；`focus` 是失败诊断和定向选择，不表示交付完整性。Service 负责自身代码、公开技术契约和独立交付物可判定的事实；Project 负责跨 Service 行为、治理资产、用户旅程及组合交付物。允许辅助证据重叠，但每项事实应有一个主要证据 owner。

registry step 只记录最小测试事实：`ownerScope → primaryIntent → executionBoundary → environment/effects → targetDuration → applicability/proves → primaryEvidenceOwner`。Quick/full membership 与 affected inputs 使用实际 profile/inputs 表达，不再维护重复的 `orchestrationScenarios`。这些事实属于 Project Testing，不进入 `verification.yml` schema。

## Task Verification 如何看到这些测试

Task Verification 不登记每个测试文件，也不把 Product 内部 Candidate steps 逐项暴露为能力。`verification.yml` 只声明 Agent 可稳定选择和调用的能力接口：

| capability | 证明范围 | 交付必需 |
| --- | --- | ---: |
| `product.fast` | 低成本 Unit、Component、Static Conformance 与两项轻量 Integration | 否 |
| `product.delivery` | 冻结目标的 changed paths 有 owner，且同一 plan 选择的 affected/full 证据通过 | 是 |
| `product.full-regression` | Product 与 Buildr Service 登记的核心完整回归 | 否 |
| `product.browser-smoke` | Local App 关键浏览器交互 | 适用时是 |
| `product.archive-lifecycle` | Change active/archive 与 Task Finish 顺序 | 否 |
| `product.openspec-convergence-journey` | OpenSpec 写入、恢复、归档与并发收敛 Journey | 否 |

每项声明只保留稳定 identity、Project/Service scope、调用方式、适用条件、能证明的事实、交付要求，以及确有需要的环境、副作用和资源边界。测试不存在时只形成 coverage gap；Task Verification 不替项目开发测试。

Buildr 专用的 selector、registry、DAG、并发和资源协调留在测试实现内部。Task Verification 只消费声明的 capability，不把这些实现细节提升为所有项目必须采用的框架。

## Agent 如何验证一个任务

Agent 从任务变更和待证明事实出发，而不是根据 `fast`、`unit` 等名称机械选测试：

```text
Task scope + changed paths + implementation risk
                     ↓
       开发期运行 Quick、changed 或 focus 反馈
                     ↓
  冻结 target，匹配 verification.yml 的 scope 与 applicability
                     ↓
       执行适用 capability，保留 transient evidence
                     ↓
      记录一个绑定 target 与 declaration 的 current Result
```

具体规则是：

1. 开发过程中先运行能快速定位问题的项目内部入口；这类反馈不要求每次都写正式 Result。
2. 形成冻结交付目标后，Agent 读取 `verification.yml`，核对真实命令行为、scope、paths、conditions、环境与授权，再选择适用 capability。
3. 完整输出、耗时、临时目录和诊断属于 transient Execution Evidence；portable Result 只保留目标、声明、实际能力事实、coverage gap 和整体结论。
4. Task Finish 与 Local App 读取同一个 current Result。target 或 declaration 变化后，旧 Result 自动变为 stale。

当前所有待交付实现都匹配唯一 `product.delivery`。普通路径由 `test:changed` 选择 affected 证据；registry、planner、runner、声明或 timing 等全局 owner 变化时，同一 plan 确定性扩展为 full。完整回归不再通过第二个 required capability 叠加执行。

## 当前问题

Quick 已恢复为约 6 秒的高频反馈，但测试体系仍有以下问题：

- Component 当前只有一个真实有界组装，覆盖仍薄，但不应为填数量伪造层级；
- 新 `test:integration` 仍约 19 秒，`integration-fast` 仍是 60–96 秒的粗粒度 System 集合，部分 owner 和事实有重叠；
- `integration-fast` 与多个 Workspace/System owner 仍可能重复覆盖，完整回归关键路径仍需按实测继续拆解；
- Browser 已独立，但 fixture 是否还能进一步复用需要在真实 Local App 任务中验证；
- 能力名称不能证明成本，Agent 必须检查实际命令，声明指导也需要明确这一点。

这些首先是 Buildr 项目的测试设计和实现问题，不是增加 Task Verification Result history、通用 DAG 或调度平台的理由。

## 第一轮优化：恢复 Fast 反馈

P0.4 实践基线中，`product.fast` 约 108 秒，`product.candidate` 约 282 秒；独立 `integration-fast` 为 94.256 秒。首轮定位到的主要成本是重复创建完整生命周期 fixture，而不是 Result Application 的读写。

本轮处理如下：

| 结论 | 处理 |
| --- | --- |
| keep | 保留 Application、CLI、Local App、Task Environment 和 worktree 的真实边界语义 |
| simplify | Task Record 和 worktree 测试复用隔离基线，减少无语义差异的 Workspace 初始化 |
| migrate | 把真实候选/retained Change 解析和 Preview 登记失败回收迁入已有 Candidate 并发验收 |
| fix | runner 用 PID 与启动时间识别进程，只跟踪当前存活 lineage，并复用短周期 `ps` 快照 |
| fix | `docs-quality` 按 Product 相对路径读取 changed 文档，避免选中 owner 后以 `0 file(s)` 假通过 |
| defer | Candidate 调度、Browser fixture、声明 applicability 和正式测试分层留给后续迭代 |

优化后，独立 `integration-fast` 为 62.777 秒，110/110 通过，比基线下降 33.4%。组合 changed 验证也覆盖 contract、integration-fast、Candidate 并发验收与文档 owner；其墙钟受并发资源竞争影响，不能与独立计时直接比较。

收敛前的组合 changed 验证为 115.136 秒：contract 7.897 秒、integration-fast 91.072 秒、Candidate 并发验收 114.854 秒，全部通过。该次运行同时发现 `docs-quality` 路径归属错误；修复后再用定向测试确认 Product 文档实际进入检查。

本轮没有修改 `verification.yml`、Task Verification Result、交付门禁或业务验收边界，也没有为了提速删除真实生命周期覆盖。

## 第二轮：建立 Project Testing 指导

本轮 Change 收敛两条窄线：

1. `project-testing` 最初按测试意图、执行边界、Project / Service owner 和 Quick、Task-affected、Candidate、Release 设计与开发测试；它无 Result、Receipt、Application 或 provider contract，Acceptance 第一版只保留需求驱动的设计占位。
2. `task-verification` 增强声明指导：发现项目已有测试、检查真实调用与成本，只按稳定调用边界声明 capability，不复制内部测试分类。

随后使用最小审查卡逐项检查 Buildr registry；只有真实实践证明现有 `verification.yml` schema 或 Task Verification 控制层不足时，才提出对应产品变更。

## 第三轮：落实边界并收敛 Quick

本轮为每个 registry step 增加 `ownerScope`、测试意图、执行边界、当时使用的编排场景、目标耗时、证明范围和唯一证据 owner，并由 registry validation fail closed。真实边界按行为迁移，没有删除测试：

| 入口 | 本轮实测 | 结论 |
| --- | ---: | --- |
| `test:unit` | 20.02 秒 → 0.27 秒 | 22 个真实边界文件迁出后，只保留 76 个纯逻辑测试 |
| `test:component` | 0.13 秒 | 先建立 2 个真实有界组装测试，不人为扩充 |
| `test:integration` | 19.23 秒 | 承接 139 个真实 FS、Git、process 边界测试 |
| `npm test` / `product.fast` | 6.31 秒 | 组合 Unit、Component、Static 及低成本 contract/runtime Integration |

`integration-fast` 保留稳定 id、专项 selector、Task-affected owner 和 Candidate membership，但退出 Quick；`product.candidate` 的完整覆盖未缩小。下一轮优先拆解 Integration/System 的重复 owner 和 Candidate 关键路径，不扩展 Task Verification schema。

## 第四轮：修正编排模型并优化完整回归

实践发现，把 Quick、Task-affected、Candidate、Release 放在同一“编排场景”轴会产生错误设计：条件化 Candidate 和 Task-affected 都在按任务影响选择范围，最终形成重叠 required capabilities。

本轮改为：

- Quick 只表达成本约束；affected/full 表达选择范围；Candidate/Release 表达验证目标或节点；
- 正式交付只有一个 required `product.delivery`，普通路径选择 affected，全局验证 owner 变化时同一 plan 扩展为 full；
- `product.full-regression` / `test:candidate` 保留为显式完整回归，不与 delivery 重复执行；
- Browser 由单一、条件化必需 capability 持有，内部 registry 只保存 delegated path owner，不再保留五个重复 Candidate steps；
- Release Git convergence 退出核心完整回归并保留 Release focus；clean-checkout onboarding 只保留 affected/focus，发布物安装由 release tarball smoke 持有；
- registry 删除 `orchestrationScenarios`，避免与实际 profiles、inputs 形成第二套编排事实。

本轮最终耗时和仍可删除的步骤以冻结目标的 delivery/full 实测为准；没有实测前不宣称优化完成。
