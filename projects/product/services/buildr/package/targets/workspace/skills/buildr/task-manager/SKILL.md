---
name: task-manager
description: 用户明确要求创建、查看、更新、设置 Parent、完成或放弃正式 Task Record，或按 Task ID 恢复正式任务顶层事实时使用；不用于普通任务分流、只读探索、Task Environment 或任何专业阶段动作。
---

# Task Manager Skill

本 Skill 是 `buildr.task-record/v1` 的默认 provider，只管理正式 Task 的最小顶层记录和直接 Parent/Child 层级。它不是全局任务 dispatcher；Local App 是调用同一 Task Record Application 的独立人类客户端。

## 1. 何时使用

仅在以下意图使用：

- 用户明确创建、查看、修改、设置或清除 Parent、完成或放弃正式 Task Record；
- 用户给出 Task ID 要求继续正式任务，需要先恢复 title、intent、scope、Change 引用和顶层状态；
- `task-triage` 已判断即将进入正式持久交付，并在首次交付写入前要求创建或恢复记录。

不要仅因用户说“任务”就触发。普通任务分流、讨论、只读探索、单次测试、临时服务、只维护已有 metadata，以及 Task Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective 动作都不由本 Skill 执行。

## 2. 输入与 canonical target

确认 operation、稳定小写 Task ID、已初始化 canonical Workspace target，以及动作所需的明确字段。create 需要 title、intent 和可为空的 Parent、Project/Service scope、`0..N` 个真实 `project/change`；update 需要 setter 或 add/remove；complete 需要 summary 和明确 no-change；abandon 需要 reason。设置 Parent 时只选择同一 Workspace 中已存在且 active 的 Task；不得用 Parent/Child 表达依赖或期待自动状态传播。

当前位于 task environment 时，只接受上游已确认的 canonical Workspace target；不读取 environment receipt，不扫描父目录，不从 worktree 推断 retained root，也不把 environment identity 写入 Task Record。Local App 已创建或用户按 Task ID 继续时先 inspect，同一记录即为权威来源。

## 3. 执行动作

调用 selected provider 对应的产品命令：

```text
buildr task create <task-id> --title <text> --intent <text> [--parent <task-id>] [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] --target <canonical-workspace> --json
buildr task inspect <task-id> --target <canonical-workspace> --json
buildr task update <task-id> [--parent <task-id> | --clear-parent] [set/add/remove flags] --target <canonical-workspace> --json
buildr task complete <task-id> --summary <text> [--no-change] --target <canonical-workspace> --json
buildr task abandon <task-id> --reason <text> --target <canonical-workspace> --json
```

只提交动作参数，不直接读写Workspace SQLite或旧 `.buildr/tasks/<task-id>/task.yml`，不传完整 YAML/JSON next state，不自行生成 `status`、`result`、时间或 `recordDigest`。引用、默认值、状态转换、去重、系统字段和事务安全全部由 Task Record Application 决定。

## 4. 停止与交接

canonical target、identity、引用或授权不明，provider 不 ready，数据库或记录损坏、已终态、动作冲突或 result 为 blocked 时停止对应 Task Record 动作，保留原状态并报告唯一 next action。不得回退为 Agent 手写 YAML，也不得把专业记录复制进 Task Record。

成功后报告 operation、Task ID、status、effects 和必要的 nextActions；不得返回本地数据库路径。随后仅按用户意图把工作交给 Triage、Environment 或其他专业 Skill；Task Manager 本身不执行这些阶段，也不自动 commit、push、publication、Finish 或 cleanup。
