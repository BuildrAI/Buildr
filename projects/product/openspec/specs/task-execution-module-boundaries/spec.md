# task-execution-module-boundaries Specification

## Purpose

收敛 Task Execution、Task Verification、Project Verification 与 Git Worktree provider 的静态 owner，保证目录迁移不改变既有生命周期、验证、执行记录、CLI/HTTP/JSON 契约及基础设施语义。

## Requirements

### Requirement: Task Execution 与 Verification 必须有清晰的静态 owner
Buildr SHALL 将 Task lifecycle、Task Environment、Task Verification、Task Execution Record 的 Application/Domain/Persistence 实现归入 `src/task/`，将 Project Verification 的执行、evidence、resource、process 与 declaration parsing 实现归入 Verification owner；System Doctor MUST 只持有 diagnostics 适配，不得成为 Verification declaration parser/validator 的调用源。

#### Scenario: Verification 解析 declaration
- **WHEN** Verification application 或 Task Verification 需要读取 `verification.yml`
- **THEN** 它们 MUST 依赖 Verification-owned parser/validator，且 MUST NOT 从 `system/doctor/application` 导入 parser/validator

#### Scenario: Doctor 生成 diagnostics
- **WHEN** System Doctor 检查 Project verification declaration
- **THEN** Doctor MUST 通过 Verification 的窄解析/校验能力生成 diagnostics，且 MUST NOT复制另一套 declaration 校验语义

### Requirement: Task Environment 与 Worktree provider 必须保持窄基础设施边界
Task Environment SHALL 通过 `buildr.git-worktree-provider/v1` 调用 Task infrastructure 中的 Git Worktree provider；provider MUST 只负责 Git plan/checkout/evidence/cleanup，不得拥有 Environment readiness、runtime projection、Verification Result 或 Task lifecycle authority。

#### Scenario: Environment 创建或清理 worktree
- **WHEN** Task Environment 请求 Git worktree prepare、inspect 或 cleanup
- **THEN** provider MUST 返回既有 Git evidence 和 effects，且 MUST 保持原有 checkout、branch、HEAD、remote、clean、registration 与 ownership 语义

#### Scenario: provider 被直接调用
- **WHEN** 调用方执行 provider-level inspect
- **THEN** 返回 MUST 不包含 Environment ready、runtime/CLI/dependency、Verification Result 或 Task status 判定

### Requirement: 结构迁移不得改变公开契约与运行语义
目录、文件和 import 迁移 SHALL 保留既有 CLI、HTTP、JSON envelope、Task/Verification Result、SQLite transaction、锁、安全边界、执行副作用、cleanup 顺序与 capability identity；本 Change MUST NOT 引入完整 JSON Schema、Ajv、DTO 生成或 Typed API Client。

#### Scenario: 迁移后运行公开入口
- **WHEN** 使用既有 CLI/HTTP/内部 Task application 入口执行相同请求
- **THEN** 返回 envelope、错误码、持久化结果和副作用 MUST 与迁移前保持等价

#### Scenario: 静态边界检查
- **WHEN** architecture boundary tests 扫描源代码
- **THEN** MUST 无 Verification→Doctor parser 反向依赖、无旧 owner 的实现残留，且 MUST 保留唯一 module/bootstrap composition path

### Requirement: Internal Workflow Route 必须分离清单、分发与业务执行
Task 模块 MUST以 contract catalog 作为内部进程级 route 清单，以 internal interface router 按 route id 分发到 runner，并 MUST将真实业务用例保留在 Task Application Service。Bootstrap MUST只通过 Task module 公开入口调用 router，不得拥有或复制 route 清单与分发实现。

#### Scenario: Doctor 读取 route inventory
- **WHEN** Doctor 或静态验证检查 required internal workflow routes
- **THEN** 它 MUST读取 Task contract catalog 的只读 inventory
- **AND** catalog MUST只登记 route metadata，不执行 Task 用例

#### Scenario: Bootstrap 分发内部 route
- **WHEN** CLI 收到 `buildr __internal <route>`
- **THEN** Bootstrap MUST调用 Task module 公开 internal workflow 入口
- **AND** router MUST按 catalog route id 选择 runner
- **AND** runner MUST调用既有 Task Application Service 执行业务

#### Scenario: 未知 route
- **WHEN** router 收到 catalog 未登记的 route id
- **THEN** router MUST返回未匹配结果并保持既有 CLI fallback 行为

#### Scenario: 检查旧顶层 route owner
- **WHEN** 架构验证扫描生产源码
- **THEN** 顶层 `src/application/internal-workflow-route-inventory.mjs` 与 `src/interfaces/internal/formal-workflow-routes.mjs` MUST不存在且无引用
