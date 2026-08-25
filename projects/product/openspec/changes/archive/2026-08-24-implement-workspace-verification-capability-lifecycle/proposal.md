## Why

当前 `buildr.project-verification/v2` 只能声明若干可调用 capability，无法一等表达验证目标、affected/full 选择、证据边界、依赖扩张和统一 Verification Plan；Agent 因而需要依赖自然语言条件或 Product 私有 planner 才能解释本次为什么运行这些测试。现有使用范围仍是可控试点，现在适合一次性迁移到单一新模型并删除 v2，避免新增一层无人能够按期清理的历史兼容。

## What Changes

- **BREAKING**：以 closed `buildr.project-verification/v3` 替换 v2；迁移全部受控 live 声明，并从 active runtime、canonical specs/docs、Skills 与 tests 删除 v2 reader、adapter 和双版本指导。不可修改的归档历史仍可保留 v2 provenance。
- 把 Project 根 `verification.yml` 定义为稳定 Test Capability Family 目录：声明 scope、proves、evidence boundaries、usable targets、可信 discovery、affected/full invocation/provider、环境、副作用与资源边界，不罗列具体测试。
- 引入统一 Verification Request 与 Verification Plan：冻结目标、选择范围、changed paths/风险，输出 selected items、直接触发、依赖扩张、证明事实、full reason、coverage gap 与 provider identity。
- 普通 Workspace 使用声明与构建/测试事实形成可解释计划；未知 owner、无法可信收窄或关键选择机制变化时 fail closed，显式扩大到 module/full 或形成 coverage gap。
- 为复杂 Project 提供高级 planner/runner provider contract；Buildr Product 可继续保留内部 registry、DAG 与 Test Context Runtime，但只能返回统一计划和 execution facts，不把内部结构推广为通用 schema。
- 保持 Runner/Application 对环境、授权、资源、Execution Record、去重、清理和 Result 写入的唯一 authority，并让 Verification Result 对账 matching Request、Plan 与 Execution Record。
- 更新 `project-testing`、`declaration-intake`、`task-verification` Skills、Doctor/diagnostics、package assets 与用户文档，并用集鲜 Pig、FreshX、Foundation、Buildr 自举 Workspace 和 Buildr Product 高级 provider 完成迁移/试点证据。

## Capabilities

### New Capabilities

- 无。新对象由既有 Project 测试能力与 Task Verification capability 承担，避免再建一套并行 authority。

### Modified Capabilities

- `project-test-capabilities`: 将 v2 capability 接口替换为 v3 Test Capability Family、discovery、target、evidence boundary、affected/full 与高级 provider contract。
- `project-testing-guidance`: 按待证明事实建设 Static、Unit、Component、Integration、System 能力，并建立可供声明和选择使用的稳定发现入口。
- `project-declaration-intake`: 只读发现真实测试、构建配置和 provider 候选，经授权写入 v3 能力族声明，不把发现结果或具体测试清单当声明。
- `task-verification`: 形成 Request/Plan、执行 selected capabilities、持久化选择理由并从 matching Execution Record 对账 current Result。
- `product-verification-quality`: 让 Buildr Product 私有 planner 通过统一 provider contract 投射计划与执行事实，保持内部 registry/DAG authority。
- `buildr-package-assets`: 原子交付 v3 contract、模板、Skills、runtime 与文档，并停止打包 v2 active assets。

## Impact

- Product canonical specs、glossary、roadmap/用户文档和 Buildr package assets。
- `projects/product/verification.yml` 以及受控集鲜 Pig、FreshX、Foundation live 声明；跨 Workspace 写入需分别在其正式 authority 中完成并留下试点证据。
- Project verification parser/validator/Doctor、Task Verification planner/application/repository、Execution Record/Result contract 与 CLI 输出。
- `project-testing`、`declaration-intake`、`task-verification` provider 和相关模板/reference。
- Buildr Product verification registry adapter 及 contract、unit、integration、system、browser 测试。
- 这是配置与公开 contract 的破坏性迁移；升级前必须迁移受控声明，不提供 v2 运行时兼容窗口。
