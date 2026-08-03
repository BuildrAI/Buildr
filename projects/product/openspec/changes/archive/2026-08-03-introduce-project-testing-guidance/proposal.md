## Why

Buildr 已能声明并执行 Project 的既有验证能力，但缺少帮助 Agent 设计项目测试边界与编排的独立指导，容易把测试类型、执行成本和交付场景混在一起。现在需要先提供一个宽而薄、无状态的 Project Testing 指导，并让 Task Verification 更准确地声明稳定能力入口。

## What Changes

- 新增 `project-testing` Workspace Skill，指导 Agent 按主要意图、执行边界和编排场景设计 Project / Service 测试，并在实现功能后开发适量研发测试。
- 第一版只覆盖 Development Tests 的实际建设；Acceptance Tests 仅说明需求驱动的占位边界，不建设 QA 平台或完整方法体系。
- 增强 `task-verification` 的声明指导：发现真实测试入口、核对成本与环境边界，只将稳定能力接口写入 `verification.yml`。
- 明确 Project Testing 不创建 Result、Receipt、Application 或持久状态；Task Verification 不替 Project 设计和实现测试。
- 不改变 `buildr.project-verification/v2` schema、Task Verification Result 或现有验证 runner。

## Capabilities

### New Capabilities

- `project-testing-guidance`: 定义无状态 Project Testing Skill，指导 Agent 基于 Project / Service 真实技术栈建立测试边界、事实 owner 与 Quick / Task-affected / Candidate / Release 编排；不创建测试结果、持久状态或通用 QA 平台。

### Modified Capabilities

- `agent-task-workflows`: 将测试框架设计与测试开发路由到 `project-testing`，并与 `task-verification` 的声明、执行和 Result authority 分离。
- `project-test-capabilities`: 要求声明指导核对真实入口、成本与环境，只暴露稳定能力接口而不复制项目内部测试目录或分类。

## Impact

- 新增随包 Workspace Skill `project-testing` 及配套 reference。
- 更新 `task-verification` Skill/reference、Workspace Skill manifest、runtime/package parity 测试和用户文档。
- 同步相关 canonical specs 与 current knowledge；无 CLI、schema、持久化或依赖变更。
