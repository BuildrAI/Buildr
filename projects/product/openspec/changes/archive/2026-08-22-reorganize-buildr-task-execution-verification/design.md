## Context

第一、二个 Child 已完成内容生命周期和 Workspace Control Plane 的迁移。当前剩余代码中，Verification application 直接从 `system/doctor/application/project-verification-diagnostics.mjs` 导入 declaration parser/validator；execution record、evidence、resource coordinator、process executor 仍位于通用 `application/verification`；Git Worktree provider 仍位于通用 `application/worktree`。Task Environment、Task Execution Record 和 Task Verification 的 application/domain/persistence 已有明确 owner，适合在本 Child 中收敛。

## Goals / Non-Goals

**Goals:**

- 形成 `task`、`verification`、`system/doctor` 和 infrastructure 之间单向、可静态检查的依赖。
- 复用 Child 2 的 Workspace Control Plane query，不复制 Workspace writer 或读取模型。
- 保留 capability identity、Environment Receipt、Execution Record、Worktree evidence、事务和安全边界。
- 让 Doctor 只负责 diagnostics，不再成为 Verification parser 的 owner。

**Non-Goals:**

- 不改变 Task lifecycle、Verification authority、Result/JSON envelope、HTTP/CLI 行为、SQLite schema 或测试语义。
- 不在本轮引入 Ajv、完整 JSON Schema、DTO 生成、Typed API Client 或 Internal Workflow Route 重设计。
- 不拆 Bootstrap 为新的运行时产品边界；只更新组装入口和静态依赖。

## Decisions

1. **Verification declaration parser 的 owner**：新增 Verification 内部 declaration 解析/校验入口，Verification application 与 Task Verification 通过该入口消费；Doctor 通过窄 diagnostics adapter 使用同一能力。相比继续从 Doctor 导入，这能避免系统诊断层成为业务 parser owner；相比复制 parser，可保持校验语义单一。
2. **Execution 组件位置**：将 execution record producer、evidence lifecycle、resource coordinator、process executor 与 capability runner 放入 Verification infrastructure；Task Execution Record application 只通过已有窄 producer/recovery port 读取或持久化 Task-owned record。相比把全部组件塞入 Task，能保持 Project Verification 的独立执行语义。
3. **Worktree provider 位置**：将 Git Worktree provider 放入 Task infrastructure，并由 Task Environment 通过既有 runtime port 调用。保留 `buildr.git-worktree-provider/v1` identity 与 CLI adapter；不把 Git provider 变成 Task domain service。
4. **兼容迁移策略**：先迁移文件和 import，再更新 Bootstrap/module registry、静态边界测试和 fixtures；必要时保留极薄 re-export 兼容入口，最终由 contract test 禁止新代码继续依赖旧路径。这样可分步验证且不改变运行行为。

## Risks / Trade-offs

- [路径迁移遗漏] → 用 `rg` import closure、architecture boundary test 和全量 unit/component test 检查旧路径与循环依赖。
- [Doctor 与 Verification 校验结果漂移] → 共享同一个 parser/validator implementation，并增加 parser/diagnostics parity test。
- [Worktree/Environment ownership 被误改] → 只移动 provider 与 adapter，保留 capability identity、evidence schema、cleanup 调用顺序和既有测试。
- [变更范围扩大到 HTTP contract] → Change tasks 明确禁止 JSON schema/DTO/HTTP 行为改动，review 与验证只接受结构迁移证据。

## Migration Plan

1. 盘点并冻结当前 import/Bootstrap/contract test 基线。
2. 建立 Verification 与 Task infrastructure 目录，迁移实现并修复 import。
3. 抽出 declaration parser/validator 与 Doctor diagnostics adapter。
4. 更新模块组装和静态边界测试，运行 targeted 与既有 verification suites。
5. 删除不再拥有实现的旧路径（兼容 re-export 若存在，仅保留到本 Change 完成验证）。

## Open Questions

无。目录命名以现有 Task module 与 Parent Plan 的 owner 关系为准；若实现中发现必须改变公开行为，应停止并另建 Change。
