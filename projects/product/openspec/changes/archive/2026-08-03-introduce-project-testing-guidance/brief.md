# 引入 Project Testing 指导

## 一句话摘要

新增一个无状态 `project-testing` Skill，帮助 Agent 为 Project / Service 设计和开发测试，并让 `task-verification` 只把真实、稳定的既有测试入口声明为 capability。

## 背景与问题

Buildr 已能通过 `verification.yml` 选择和执行项目已有测试，但不负责设计测试。当前缺少独立指导来区分测试意图、执行边界与编排场景，项目容易把重型端到端测试混入高频入口，或把测试文件、内部 step 和稳定 capability 混为一谈。

## 目标与非目标

目标是提供技术栈无关的宽而薄测试模型，明确 Project / Service owner，指导 Agent 在功能实现后选择最低充分边界开发研发测试，并增强 Task Verification 的能力声明指导。

非目标是不建设测试框架、registry、DAG、调度器或 QA 平台；不要求固定目录和库；不创建 Project Testing Result、Receipt、Application、provider contract 或持久状态；不修改 Verification schema 和 Result。

## 受影响用户或角色

- 需要为任务设计、开发和编排项目测试的 Agent 与维护者。
- 维护 Project / Service 测试框架和稳定验证入口的团队。
- 继续独占 capability declaration、execution 与 current Result 的 Task Verification。

## 核心流程

Agent 先读取 Project / Service 的源码、测试、脚本、CI 和约定，再按主要意图、执行边界、编排场景及事实 owner 判断测试缺口。功能实现后优先在最低充分边界补充 Development Tests；需求驱动的 Acceptance Tests 第一版只识别案例和自动化边界。

测试入口稳定后，`task-verification` 核对真实 invocation、scope、环境、副作用和成本事实，只在 `verification.yml` 声明少量可独立选择的 capability。具体任务再由 Task Verification 执行适用能力并维护唯一 current Result。

## 关键变化

- 新增 `project-testing` Workspace Skill 与技术栈无关 reference。
- 测试主要意图使用 Development、Acceptance、Static Conformance、Delivery / Release。
- 执行边界使用 Static、Unit、Component、Integration、System；`System` 不等于 Acceptance。
- 编排场景使用 Quick、Task-affected、Candidate、Release；`focus` 只用于诊断选择。
- Service / Project owner 由待证明事实和独立交付边界决定，每项关键事实保留一个主要证据 owner。
- 更新 `task-verification` 声明指导，但不扩展 `verification.yml` v2 schema。

## 影响、风险与兼容性

这是新增 optional builtin Skill 和既有 Skill 指导更新，没有数据迁移或破坏性 API。主要风险是分类形式化过度；第一版只提供最小审查卡，不要求项目立即重命名目录、命令或 registry。

## 验收摘要

- runtime 能发现独立 `project-testing` Skill，且它没有 Result、Receipt、Application 或 capability binding。
- Skill 能正确区分三轴、Project / Service owner 和最低充分执行边界，并包含 Node.js / Java 的非强制映射示例。
- `task-verification` 明确读取真实入口与成本证据，只声明稳定 capability，不复制内部测试分类。
- package、runtime parity、Skill 契约、OpenSpec strict、文档质量和受影响测试通过。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Implementation tasks](tasks.md)
