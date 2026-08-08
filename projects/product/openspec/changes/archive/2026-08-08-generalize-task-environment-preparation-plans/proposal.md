## Why

当前 Task Environment 把 Buildr 自举场景的 npm/package-lock 依赖声明固化成通用产品契约，导致 Buildr 核心需要预先认识每一种技术栈，也无法由 Agent 针对当前 Task 表达多个 Service、多个准备步骤和明确的不适用结论。现在需要把“判断需要什么环境”交还 Agent，同时保留 Task Environment 对执行边界、持久化、恢复、只读检查和聚合 readiness 的唯一 authority。

## What Changes

- **BREAKING**：停止把 Project `task-environment.yml`、package manager 和 lockfile 类型作为 Task Environment 准备计划 authority。
- 新增由 Agent 为当前 Task 登记的 Environment Preparation Plan；一个 Plan 可包含多个 Service，每个 Service 可包含多个有序准备步骤。
- 每个步骤声明工作目录、绝对 executable、参数、输入 identity 来源、预期本地输出和 `required`，Task Environment 负责验证边界、执行、逐步保存事实与幂等恢复。
- 新 Environment 首次没有 Plan 时明确返回 `blocked / plan-missing`；Agent 可以显式登记无准备要求的 `not-applicable` Service，不能因未识别技术栈而假 `ready`。
- `inspect` 只比较已登记 Plan、executable/input identity 与输出事实，不执行准备命令、不修复输出、不回写 current。
- Receipt、SQLite current、CLI JSON、Local App 与测试改为 Plan → Service → Step 的可审计模型；旧 v3 dependency-root Receipt 只读兼容并要求显式 Plan 升级。

## Capabilities

### New Capabilities

- `task-environment-preparation-plans`: 定义 Agent 如何依据当前正式 Task 的完整 Service scope、构建与验证事实，登记可审计的多 Service、多步骤环境准备计划，并约束通用步骤执行、显式不适用、漂移恢复与只读检查边界。

### Modified Capabilities

- `task-environment-dependency-declarations`: 退役 Project npm dependency root/Service requires 图作为环境准备 authority，保留明确的兼容迁移边界。
- `task-environments`: 将准备、恢复、漂移、失败与聚合 readiness 从 npm dependency roots 改为 Agent-declared Service Plans 与 Preparation Steps。
- `cli-product-surface`: 增加 Environment Plan 的登记/读取入口，并保持 `prepare`、`inspect`、`cleanup` 为 Application 薄客户端。
- `public-json-contracts`: 公开 Plan、Service、Step 的 current/prepared facts 与逐步 effects。
- `product-source-layout`: 移除 Product Project root 的专用 `task-environment.yml` 治理资产。
- `buildr-package-assets`: 原子交付新 Plan contract、CLI、Receipt、Skill、Local App 与 source/package/runtime parity。

## Impact

- 影响 Task Environment domain、Application、SQLite current payload、公共 CLI/schema、Task Triage/Environment Skills、Local App Environment Tab、Product current knowledge 和测试。
- 不新增第二个 Environment store、package manager adapter registry、后台调度器或递归仓库扫描。
- 不改变 Task Record authority、Task Verification Result authority、Git provider ownership、Finish cleanup 或已安装 Buildr/web-dist 的运行时依赖。
