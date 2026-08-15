# 降低正式任务启动开销

## 一句话摘要

用一个只读、可诊断的 Task Entry Snapshot 告诉 Agent 当前执行根、writer、唯一下一动作及其专业能力，减少 Formal Task 启动时的上下文装配，同时保留既有 authority 与用户调整 recommended 路径的空间。

## 背景与问题

上一正式任务从 Task 创建到首个 Development 事实耗时 14 分 12.331 秒，而 Environment 实际准备只用 5.642 秒。主要时间消耗来自 Agent 串行读取完整 lifecycle Skills、contracts、capability graph 与命令 schema，而不是 worktree、依赖安装或 runtime projection。

本任务通过 action-local loading 将相同启动区间缩短到 1 分 03.368 秒，证明产品无需删除 Task、Environment、Development、Review、Verification 或 Finish authority，也能显著降低启动负担。当前缺少的是稳定产品入口，而不是更多 Agent 提醒。

## 目标与非目标

- 目标：一次返回 Task、Environment、Development 的最小 current facts、retained writer route、直接 blocker 和唯一 typed next。
- 目标：只在当前动作成为 next 时返回 matching capability contract/provider identity。
- 目标：把硬安全前置表达为 `required`，把可由用户调整的默认流程表达为 `recommended`。
- 非目标：不自动执行、不实现完整 lifecycle DAG、不持久化 Agent context/source map 或性能指标。
- 非目标：不改变 Receipt/Result/store schema，不增加 migration，不降低 retained/candidate writer provenance。

## 受影响角色

主要影响使用 Buildr 执行正式 Task 的 Agent 与维护者。现有 CLI/Local App 消费者继续使用原 Task、Environment、Development、Review、Verification、Execution Record 与 Finish 接口。

## 核心流程

Agent 创建或恢复 active Task 后调用 `buildr task next`。入口先读 Task；若 Environment 未 ready，立即返回 required Environment 动作并停止。Environment ready 后返回 receipt 证明的 execution roots 与 retained controller；Development 缺失时返回 required begin。Development 存在时，入口从同源 typed projection 返回一个 recommended next，并只投影该动作的 capability route。实际动作仍由对应 owner 重验 currentness。

## 关键变化

- 新增 closed `buildr.task-entry-snapshot/v1` 与 `buildr task next <task-id> --json`。
- Task Development 增加 typed next，并由同一判定渲染 legacy `nextActions`。
- Snapshot 仅输出一个 current capability/contract/provider identity，不输出完整 graph。
- Environment Receipt resolver 提供 execution root、retained controller 与 candidate CLI provenance。
- `--profile` 只返回本次调用的可观察耗时与 owner read 次数，不持久化、不参与 gate。
- 更新 task-triage、task-development、Buildr 入口 guidance 与 current knowledge。

## 影响、风险与兼容性

主要风险是 compact applicability 被误解为最终授权，或推荐入口逐步演变成第二个 workflow engine。实现通过只读、单 next、无持久状态、`recommended` 可调整、专业 owner 写前重验来限制该风险。所有既有公开命令与持久 schema 保持兼容；无需 migration。

## 验收摘要

需要证明无 Environment 时零专业写入并只返回 Environment next；Environment ready 时直接返回 execution root 和 retained controller；Development current 时不复制完整 Receipt；stale identity、writer/target mismatch 与 capability routing failure 均精确 fail closed；后续能力只在成为 next 时出现；profile 不影响任何 lifecycle result。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Entry Snapshot delta](specs/task-entry-snapshot/spec.md)
- [Agent workflow delta](specs/agent-task-workflows/spec.md)
- [Public JSON delta](specs/public-json-contracts/spec.md)
- [Package assets delta](specs/buildr-package-assets/spec.md)
- [Tasks](tasks.md)
