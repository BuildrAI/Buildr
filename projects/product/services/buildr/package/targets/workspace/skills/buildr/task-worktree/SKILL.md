---
name: task-worktree
description: 用户要求创建、定位、复用、保留或清理 task worktree/change-id/本地任务分支，或实现型任务需要确定隔离 checkout 时使用；负责 canonical task environment 生命周期，不负责业务分流、Git 集成或验证。
---

# Task Worktree Skill

## 1. 职责边界

本 Skill 是 `buildr.task-worktree-lifecycle/v2` 的默认 provider。分流属于 `task-triage`，验证属于 `task-verification`，Git integration 属于 `git-ops`，完整收尾属于 `task-finish`。

## 2. 决策

Project/Service 规则优先于本表。

| 结果 | 条件 | 动作 |
|---|---|---|
| `create` | 将修改代码、运行构建/测试、多仓协作或需要长期隔离，且没有匹配 environment | 创建 canonical environment |
| `reuse` | task id、owner、branch、start point 与完整 repository plan 均匹配既有 receipt | 复用同一 environment，并重新核对 session adoption |
| `none` | 只维护 artifacts、Rules、Skills、文档或模板，不进入代码、构建或测试 | 在当前 workspace 处理 |
| `blocked` | Workspace、repository set、path、branch ownership 或 receipt 无法确认或冲突 | 停止写入并报告最少决策问题 |

实现型 Change 必须在 propose 和创建 change artifacts 前完成决策。create/reuse 前说明 task/environment、repository set 和分支。

未使用 environment 的元内容任务后来进入实现时，先 create/reuse，再核对已有 artifacts 的 ownership、内容和唯一目标。只有证明原位置是当前任务自有重复副本后才能删除；无法证明时停止删除或覆盖。

## 3. 生命周期

1. **Plan**：用 registry 与 Git boundary 确认 Workspace、task、owner、分支和完整 repository set；不同 plan 不得复用。
2. **Create/Reuse**：root 固定为 `<workspace-root>/.worktrees/<task-id>`，不得静默回退到 `/tmp`。调用 `buildr worktree create <task-id>`；产品入口统一预检 root 与 nested checkouts，部分失败保留现场和 receipt。
3. **Runtime handoff**：create/reuse 返回 `runtimeExpectation` 与 adoption 状态。`handoff-required` 时，当前 session 停止 artifacts/实现写入；让 Agent runtime 以 environment root 启动或重新进入 session。Codex Rules 是 `path-read`、Skills 是 `session-start`，sync 完成不表示当前 session 已重发现 Skills。
4. **Adopt/Context gate**：新 session 从 checkout-local CLI 运行 `buildr worktree adopt`，提交 agent、target、session root/handle、root evidence source、mode、started-at 和 `--json`；再用同一 session evidence 运行 `worktree context`。只有 `executionReady: true` 才继续。environment evidence 是 `buildr-verified`，session evidence 是 `agent-attested`；只切换 cwd 不通过。复用只跳过 create-time doctor/sync，仍执行 context 和本次动作需要的状态检查。
5. **Use**：采用 environment 后，artifacts、编辑、checkout-local CLI、构建、测试和合并前验证只在 `allowedExecutionRoots` 内执行，并在 provider 交接中携带 adoption identity；原 Workspace 只做只读检查、environment 管理或集成。同一 environment 同时只有一个 owner Agent 写入，不从未合并 task checkout 更新主自举 workspace。
6. **Retain/Cleanup**：普通任务在上线、归档、明确收尾或用户要求清理前默认保留。发布 environment 在远端 ref 匹配候选、checkout clean、没有后续本地动作且当前发布流程已授权时，删除本地 worktrees、environment receipt、对应 adoption receipt 和已由远端承载的本地分支；否则保留并说明下一动作。主 Workspace runtime 只从 retained checkout sync；不得据此删除远端分支。

Git worktree 只隔离 working tree/index；Git metadata 仍共享。`<workspace-root>/.worktrees/` 必须被忽略且不作为 Rules 源。

## 4. 协作交接

准备验证或收尾时，返回三类事实：

- environment identity：task id、owner、canonical root、receipt、membership、`allowedExecutionRoots`、runtime expectation 与 adoption/executionReady evidence；
- repository state：完整 repository plan，以及各 checkout 的 branch、HEAD、clean 状态和可确认 tree/fingerprint 输入；
- lifecycle result：created、reused、retained、removed、blocked 和本次动作产生的 `treeChanged`。

本 provider 不监控普通编辑，不比较 rebase/merge/reset 前后的内容，也不决定 Candidate evidence 的有效、复用或重跑。调用方把事实交给 selected `buildr.task-verification/v2` provider；Task Finish 通过 contract 消费结果，不依赖固定 provider id。

## 5. 授权与停止条件

以下任一情况必须停止并保留整个 environment：repository set 无法消歧、canonical path 被占用、registry/remote/branch/receipt identity 冲突、cwd 或 CLI source 越界、任一 checkout 有未处理工作，或清理会影响其他 environment、入口、进程或外部资源。

删除前确认内容已集成，并迁移或停止 task-owned 本机入口与进程；否则保留。删除远端分支、丢弃工作或清理外部资源始终需要当前轮次单独明确授权。

Tree transition 遵守 required Core workspace-transition invariant；本 Skill 不依赖 `git-ops` provider，也不复制 Git 策略。
