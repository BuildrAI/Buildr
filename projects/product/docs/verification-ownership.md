# Buildr 测试能力与 Task Verification 实践

本文记录 Buildr 项目当前有哪些测试能力、这些能力怎样声明给 Task Verification、Agent 在具体任务中怎样使用它们，以及测试体系仍需解决的问题和每轮优化结论。

通用测试设计以 [project-testing Skill](../services/buildr/package/targets/workspace/skills/buildr/project-testing/SKILL.md) 及其 [testing model](../services/buildr/package/targets/workspace/skills/buildr/project-testing/references/testing-model-v1.md) 为准；能力声明和正式结果以 [verification.yml](../verification.yml)、[Task Verification spec](../openspec/specs/task-verification/spec.md) 和 [task-verification Skill](../services/buildr/package/targets/workspace/skills/buildr/task-verification/SKILL.md) 为准。本文只记录 Buildr 自举实践，不建立新的 Result 或生命周期权威。

## Buildr 当前有哪些测试

Buildr 使用 Node.js 内置 `node:test`，测试入口由 `services/buildr/package.json` 和 Product 内部 registry 组织：

| 入口 | 当前用途 |
| --- | --- |
| `test:unit` | 同进程验证纯逻辑和稳定模块边界 |
| `test:contract` | 静态检查源码、manifest、文档、Skill、schema 与 entrypoint 契约 |
| `test:integration:fast` | 验证 CLI、文件系统、Git、Task Environment、Local App 等技术边界 |
| `test:changed` / `test:focus` | 按变更 owner 选择开发期反馈，或定向重跑失败步骤 |
| `test:candidate` | 运行完整 Product、package、runtime、Workspace、浏览器、发布和 OpenSpec 回归 |
| 专项入口 | 定向验证 Browser、OpenSpec convergence、release 等高成本场景 |

这些是 Buildr 项目内部的测试分层和编排入口。它们可以继续拆分和调整，不是 Task Verification 的公共 schema。

项目测试采用三个正交维度，不把所有验证强行归入 Unit、Component、Integration：

| 维度 | 第一版分类 |
| --- | --- |
| 主要意图 | Development、Acceptance、Static Conformance、Delivery / Release |
| 执行边界 | Static、Unit、Component、Integration、System |
| 编排场景 | Quick、Task-affected、Candidate、Release |

`System` 是执行边界，不等于 Acceptance；`Static` 是独立执行形式；`focus` 是失败诊断和定向选择，不是交付编排场景。Service 负责自身代码、公开技术契约和独立交付物可判定的事实；Project 负责跨 Service 行为、治理资产、用户旅程及组合 Candidate / Release。允许辅助证据重叠，但每项事实应有一个主要证据 owner。

首轮只要求 registry step 记录最小审查卡：`ownerScope → primaryIntent → executionBoundary → orchestrationScenarios → environment/effects → targetDuration → applicability/proves → primaryEvidenceOwner`。这些分类属于 Project Testing 指导，不进入 `verification.yml` schema。

## Task Verification 如何看到这些测试

Task Verification 不登记每个测试文件，也不把 Product 内部的 42 个 Candidate step 暴露为 42 个能力。`verification.yml` 只声明 Agent 可稳定选择和调用的能力接口：

| capability | 证明范围 | 交付必需 |
| --- | --- | ---: |
| `product.fast` | unit、静态契约、fast integration、CLI 架构、OpenSpec strict 与 runtime adapter contract | 否 |
| `product.candidate` | Product 与 Buildr Service 的完整交付门禁 | 是 |
| `product.browser-smoke` | Local App 关键浏览器交互 | 否 |
| `product.archive-lifecycle` | Change active/archive 与 Task Finish 顺序 | 否 |
| `product.openspec-convergence-journey` | OpenSpec 写入、恢复、归档与并发收敛 Journey | 否 |

每项声明只保留稳定 identity、Project/Service scope、调用方式、适用条件、能证明的事实、交付要求，以及确有需要的环境、副作用和资源边界。测试不存在时只形成 coverage gap；Task Verification 不替项目开发测试。

Buildr 专用的 selector、registry、DAG、并发和资源协调留在测试实现内部。Task Verification 只消费声明的 capability，不把这些实现细节提升为所有项目必须采用的框架。

## Agent 如何验证一个任务

Agent 从任务变更和待证明事实出发，而不是根据 `fast`、`unit` 等名称机械选测试：

```text
Task scope + changed paths + implementation risk
                     ↓
       开发期运行 unit、changed 或 focus 反馈
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

当前 `product.candidate` 的 `paths: ["**"]`，所以所有待交付实现最终都匹配完整 Candidate。纯文档是否应继续采用同一政策，需要基于实践另行调整，不能由 Agent 临时跳过。

## 当前问题

`product.fast` 目前是相对 Candidate 较快的混合回归，不是单元测试入口。它同时运行 unit、contract、integration-fast、架构、OpenSpec 和 runtime contract，因此任何小改动都可能等待一分钟以上。进一步审查发现：

- 目前缺少独立 Component 层，真实 CLI、Git 和 Environment 生命周期容易混入高频反馈；
- `integration-fast` owner 过粗，同一组内的重型 fixture 会被整体选择；
- Candidate 包含多个 Workspace、Browser、package 和 release 重场景，资源互斥与依赖关系形成约 282 秒的关键路径；
- `product.candidate` 对所有路径适用，Project policy 仍偏保守；
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

1. `project-testing` 指导 Agent 按测试意图、执行边界、Project / Service owner 和 Quick、Task-affected、Candidate、Release 设计与开发测试；它无 Result、Receipt、Application 或 provider contract，Acceptance 第一版只保留需求驱动的设计占位。
2. `task-verification` 增强声明指导：发现项目已有测试、检查真实调用与成本，只按稳定调用边界声明 capability，不复制内部测试分类。

下一步使用最小审查卡逐项检查 Buildr registry，先补出 Component 层并继续缩短 Quick；只有真实实践证明现有 `verification.yml` schema 或 Task Verification 控制层不足时，才提出对应产品变更。
