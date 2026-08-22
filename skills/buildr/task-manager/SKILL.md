---
name: task-manager
description: 用户明确要求创建或查看待办/正式 Task Record、创建 Parent Task、更新顶层事实或复盘来源、激活待办、设置 Parent、完成或放弃 Task，或按 Task ID 恢复记录时使用；只管理Task Record，用户同时要求准备或拆分Parent时在active记录成功后自动交接task-development，不自行执行Environment或专业阶段动作。
---

# Task Manager Skill

本 Skill 是 `buildr.task-record/v2` 的默认 provider，只管理 Task 的最小顶层记录、直接 Parent/Child 和复盘来源。`todo` 是已接受但未启动的 data-only 意向，`active` 才进入正式执行。Buildr Web 是同一 Application 的独立人类客户端；Parent Plan、Contribution、复盘正文和专业事实不得复制到 Task Record。

Parent/Child只表达真正独立交付的协调层级。普通Agent并行调查、临时分工、同一交付内的局部实现或测试协作不触发本Skill创建Child；只有工作能单独说明目标/scope并形成Candidate/evidence、immutable Handoff与真实Delivery时，才建立正式Child关系。

## 1. 何时使用

仅在以下意图使用：

- 用户明确创建、查看、修改、激活、设置或清除 Parent、维护复盘来源、完成或放弃 Task Record；
- 用户给出 Task ID 要求继续正式任务，需要先恢复 title、intent、scope、Change 引用和顶层状态；
- `task-triage` 已判断即将进入正式持久交付，并在首次交付写入前要求创建或恢复记录。

不要仅因用户说“任务”就触发。普通任务分流、讨论、只读探索、单次测试、临时服务、只维护已有 metadata，以及 Task Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective 动作都不由本 Skill 执行。

## 2. 输入与 canonical target

确认 operation、稳定小写 Task ID、canonical Workspace 和明确字段。create 默认 active；只有用户已接受意向但尚未授权执行时使用 `--status todo`。todo 不得带 Change，也不运行 Git、Environment 或专业动作。复盘来源可在 create 或 update 中重复提供，但每个来源必须是已有 current 复盘的 completed/abandoned Task；只保存 source Task ID，不保存行动项或报告副本。activate 仅做 todo-to-active，调用前置门禁由 task-triage 负责。complete 需要 summary 和明确 no-change，todo 只允许 no-change；abandon 需要 reason。

当前位于 task environment 时，只接受上游已确认的 canonical Workspace target；不读取 environment receipt，不扫描父目录，不从 worktree 推断 retained root，也不把 environment identity 写入 Task Record。Buildr Web 已创建或用户按 Task ID 继续时先 inspect，同一记录即为权威来源。

作为 Buildr Web 统一内部文档引用规则在 Task intent 的具体应用：引用已登记 Project 内的 Markdown 文档时，使用具名的 Workspace 相对 Markdown 链接，例如 `[方案名称](projects/<project>/docs/<document>.md)`；不要只写裸路径、本机绝对路径或 `file:` URL。写入后确认 Buildr Web 将其呈现为可点击引用，并区分“链接可解析”与“正文当前可读取”：文档尚只存在于 Task Environment 时应如实说明暂不可预览，不得复制正文到 Task Record 或声称 canonical Project 已包含该文档。

## 3. 执行动作

调用 selected provider 对应的产品命令：

```text
buildr task create <task-id> --title <text> --intent <text> [--status todo|active] [--retrospective-source <task-id> ...] [--parent <task-id>] [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] --target <canonical-workspace> --json
buildr task inspect <task-id> --target <canonical-workspace> --json
buildr task update <task-id> [--add-retrospective-source <task-id> ... | --remove-retrospective-source <task-id> ...] [--parent <task-id> | --clear-parent] [set/add/remove flags] --target <canonical-workspace> --json
buildr task activate <task-id> --target <canonical-workspace> --json
buildr task complete <task-id> --summary <text> [--no-change] --target <canonical-workspace> --json
buildr task abandon <task-id> --reason <text> --target <canonical-workspace> --json
```

只提交动作参数，不直接读写 Workspace SQLite 或旧 `.buildr/tasks/<task-id>/task.yml`，不传完整 next state。`open` 只是 todo+active 查询值，不是持久状态。默认值、状态转换、来源校验、去重、系统字段和事务安全全部由 Application 决定。

## 4. 停止与交接

canonical target、identity、引用或授权不明，provider 不 ready，数据库或记录损坏、已终态、动作冲突或 result 为 blocked 时停止对应 Task Record 动作，保留原状态并报告唯一 next action。不得回退为 Agent 手写 YAML，也不得把专业记录复制进 Task Record。

成功后报告 operation、Task ID、status、effects 和必要的 nextActions；不得返回本地数据库路径。`complete|abandon` 成功时，先报告已经成立的终态，再使用长期名称“任务复盘”询问用户是否复盘，并说明当前重点包括 Agent 执行耗时、Token 消耗、重复尝试和人机协作效率；Token 数据仅在 Agent 可取得时记录，缺失不影响复盘。该提示非阻塞，只有用户明确同意后才路由 `task-retrospective`，不得自动执行或改变终态结果。

随后仅按用户意图把工作交给 Triage、Environment 或其他专业 Skill；Task Manager 本身不执行这些阶段，也不自动 commit、push、publication、Finish 或 cleanup。

active Task Record create或todo activate成功后，若当前用户目标明确包含创建并准备Parent、按总体目标拆分Contribution、准备到可开发状态或准备到可启动Child，不得把Task Record成功当作目标完成。立即把Task ID、canonical Workspace、完整scope，以及当前对话已经明确的Parent outcome、architecture decisions、Contribution directions/boundaries/dependencies与final acceptance交接给`task-development`，由它继续专业准备。交接不进入Task Record Result，不让本Skill调用Environment、Development或Review writer；这些输入仍由各owner校验和保存。

只有用户明确只创建todo、只写Task Record、只修改顶层metadata，或尚未授权启动正式执行时，才在Task Record结果后停止。Parent准备信息不足也先交接；由`task-development`只对会改变Parent目标、Contribution切分、依赖、边界或最终验收的最少问题判断是否形成真实blocker，不要求用户重新发起“准备Parent”。
