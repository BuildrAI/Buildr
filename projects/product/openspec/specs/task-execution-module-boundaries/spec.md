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
