# 支持多仓库 Task Finish 交付

## 一句话摘要

Task Finish 将按 Task Environment 中的独立 Git repository 逐项交付：无贡献项跳过 carrier 和远端操作，有贡献项独立形成可恢复的交付与清理证据。

## 背景与问题

Task Environment 已能固定创建 Workspace 根 worktree，并为独立 Project/Service Git repository 创建额外 worktree。当前 Task Finish 仍只处理 Workspace 根：当实际贡献位于 Service repository 时，根 repository 的空 tree delta 不创建 carrier commit，却错误校验 baseline HEAD 的提交消息，导致 `task-finish.commit-message-mismatch`，真正的 Service 贡献也没有进入交付。

## 目标与非目标

目标是保留现有 Environment 建模和固定五阶段，逐 repository 识别贡献、交付、回读、恢复并最终统一 cleanup。无贡献 repository 不创建或校验 Delivery Carrier，不执行 Git delivery transition。

本次不取消 Workspace 根 worktree，不提供 repository 选择 CLI，不引入跨 remote 原子事务，也不扩展到 PR、release、deploy 或非 Git adapter。

## 受影响用户或角色

- 使用 Buildr 正式 Task 管理多 Git repository Workspace 的开发者和 Agent。
- 依赖 Task Finish Result、Environment cleanup 与 Buildr 自举 activation 的产品内部 consumer。

## 核心流程

1. Entry 从 matching Environment 取得完整 repository set，并逐项观察 Task Contribution。
2. 无贡献项记录为 not-applicable；有贡献项解析 retained target/remote。
3. Prepare/verify 在任何 push 前完成全部有贡献项的 carrier 与等价检查。
4. Deliver 按确定性顺序逐项交付并即时持久化；阻塞后只恢复最早未完成项。
5. Cleanup 用 carrier contribution proof 或 no-contribution proof 复核全部 repository，并统一移除 Task worktree、分支和 provider evidence。

## 关键变化

- Task Finish run/result 从单 carrier 扩展为 repository-scoped state，并保留 singleton 兼容投影。
- target lease identity 纳入 repository 边界，避免不同 repository 的同名分支误互斥。
- 无 tree delta 的普通 repository 不再进入 commit-message 校验；显式 zero-delta Delivery Adaptation 保持原语义。
- 精确无副作用的历史误失败可通过重跑同一首次命令创建新 run，无需恢复旧 run 或重建 Development handoff。

## 影响、风险与兼容性

多 remote 无法原子回滚，因此产品在 push 前完成全部 prepare/verify，并逐 repository 保存部分成功事实。旧 v2 current 保持有界可读；有副作用的旧 run 不自动改写为多仓库语义。Task Environment 根 worktree 与 cleanup ownership不变。

## 验收摘要

- Workspace 根无贡献、Service 有贡献时，只有 Service 产生 carrier/push/readback，两个 worktree 最终都被清理。
- 多个 repository 有贡献时全部先通过 prepare/verify，再按序交付；第二项阻塞后恢复不重复 push 第一项。
- baseline HEAD 消息不同不再触发空贡献 mismatch。
- 现有单仓库 journey 与 Buildr 自举 consumer 保持通过。
- Task Finish 相关 Unit/Integration/Contract/System 回归 221/221 通过；Product `test:changed` 登记选择全部通过，耗时 226.2 秒。
- Task Finish delivery integration 与 System Task Finish journey 超过登记目标耗时但结果通过，作为非阻塞 timing warning 保留。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `specs/public-json-contracts/spec.md`
- `tasks.md`
