# 开放按 Task 回读 Finish 终态交付

## 一句话摘要

新增 `buildr task delivery inspect <task-id>` 只读入口，让 Agent 在终端输出丢失后仅凭 Task ID 恢复 Finish run ID、最终远端引用、清理状态与可用恢复动作。

## 背景与问题

Buildr 已在 Terminal Delivery Application 中组合 Task、Development 与 Finish 事实，Local App 也已使用该模型。但 CLI 只能用已知 run ID 调用 `task finish inspect --run`；一旦 stdout 或上下文丢失，调用方无法从 Task ID 找回 run identity，只能调查内部 read model。

## 目标与非目标

目标是公开既有 `buildr.task-terminal-delivery/v1`，提供稳定、零写入的按 Task 查询，并让 route、help、JSON registry、文档和测试保持一致。

本 Change 不保存 stdout，不增加 Finish 历史或 SQLite writer，不自动执行恢复，也不改变 `task inspect` 与 `task finish inspect --run` 的既有语义。

## 受影响用户或角色

- 需要在终端或上下文中断后恢复 Formal Finish 状态的 Agent。
- 维护 Buildr CLI 产品表面、Skill 与自动化恢复流程的开发者。

## 核心流程

Agent 提供 Task ID 和 canonical Workspace。CLI 调用现有 Terminal Delivery Application：已交付时返回 run ID、final ref 和 cleanup；Finish 进行中时返回 run ID、phase 和产品生成的 next action；尚无 run 或关联不可证明时返回既有保守状态与 diagnostic。全过程只读。

## 关键变化

- 新增 agent-machine 命令 `task delivery inspect`。
- 将既有 Terminal Delivery schema 纳入公开 JSON registry。
- 增加 canonical help、CLI reference 与自动化覆盖。
- 保持 Task Record、Task Finish run detail、SQLite 和 Local App 边界不变。

## 影响、风险与兼容性

现有命令和数据完全兼容，无需迁移。主要风险是消费者误把组合投影视为完整 Finish run 明细；命名、help 和文档会明确二者边界。与其他 P1 任务只有普通 registry、文档或测试文件的潜在集成冲突，没有语义依赖。

## 验收摘要

- 仅凭 Task ID 可读取 terminal/current delivery 事实。
- JSON 使用 `buildr.task-terminal-delivery/v1`，文本输出保持紧凑。
- 查询不会执行 resume、cleanup、Finish 或任何 writer。
- 既有 `task inspect` 与 `task finish inspect --run` 行为不变。
- 受影响测试、CLI 产品表面验证与 OpenSpec strict validation 通过。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [CLI product surface delta](specs/cli-product-surface/spec.md)
- [Implementation tasks](tasks.md)
