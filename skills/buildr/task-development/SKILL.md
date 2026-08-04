---
name: task-development
description: 正式实现任务在 Planning Review 后推进开发、稳定 Content Target、形成 verification policy、编排正式 Verification、冻结 Task Candidate、完成 Completion Review、记录风险决定或生成 Finish handoff 时使用；不用于 Task Record、Environment、测试开发或交付执行。
---

# Task Development

本 Skill 编排 `buildr.task-development/v1`。它通过 Buildr 内部 Task Development Application 工作；第一版没有公共 Development CLI，Local App 只消费 Application `inspect` 的只读投影，不提供 Development 写操作。不得手写 Development Receipt。

## 恢复事实

1. 读取 Task Record，确认 Task active、Intent、Project/Service scope 和 `0..N` Change 引用。
2. 通过 `task-environment` 恢复 matching ready Environment，只使用 Receipt 返回的 execution/validation roots。
3. 通过 `task-review` inspect Planning Result；没有 current ready Planning Review 时先完成 Planning Review。
4. 通过 Development Application inspect 已有 Receipt/current Candidate/handoffs。旧 snapshot 即使 stale 也不删除或改写。

## 开发到稳定目标

在 Candidate freeze 前完成所有内容修改、测试开发与修复、Quick/Task-affected 反馈、current knowledge 维护，以及每个关联 Change 的 sync/archive 或明确 `not-applicable`。这些动作属于相应 Project/Skill，不由 Development Application执行。

内容固定后，向 Development Application 提交完整 Change dispositions 并观察 Content Target。code-only Task 提交空数组。观察结果必须只含逻辑 selector、相对 source path、observer capability 与内容 identity，不得保存本机路径。

## Verification policy 与正式 Verification

根据 Task scope 和 Task Verification Application 返回的 current declarations，形成一份完整 policy：

- 选择当前稳定目标需要的已有 capabilities，并说明 required；
- 没有能力时记录 Project/Service coverage gap；
- applicability override 必须包含 Project、capability、required decision、scope、basis 和 source；
- 不在 Verification 阶段开发测试，也不复制 Project 测试 registry。

然后对 Content Target identity 执行正式 `task-verification`。Result target/declarations 必须 current；policy 中每个 required capability 都必须有明确 passed/failed fact，每个 policy gap 都必须在 Result 中有对应 coverage gap。正式 Verification 可能得到 `not-passed`，但不能缺少事实。

## Candidate、Completion 与决定

所有 Change disposition 非 pending、Planning ready、policy current 且 Verification facts 完整后，调用 Development Application freeze。freeze 不修改内容、不运行命令，只创建或复用 current Candidate；新的 Content/Task context/policy 输入才递增 generation。

随后用 `task-review` 对 Candidate identity 执行 Completion Review。根据 current gates 记录：

- `blocked`：说明未获接受的风险或仍需处理的问题，不修改 Task 顶层 status；
- `proceed`：必须绑定 current Candidate。Verification not-passed、coverage gap 或 Completion changes-required 时，每项风险都要绑定 `verification|completion`、精确 Result digest、scope、summary 和用户授权 source。

selected `buildr.task-asset-review@3` provider ready且存在当前Task observation时，在handoff前调用`finalize`；结果为 `awaiting-human` 时停止，不生成Finish handoff，待人工accept/reject。provider缺失或没有observation时保持non-blocking degraded，不创建空observation或让Finish补做判断。

只有 current Candidate、三个 current gates 和合法 proceed decision 同时成立时生成正式 handoff。Application append immutable snapshot；不得因后续 Result 刷新或新 generation 改写旧 snapshot。

## 交给 Finish

handoff 完成后调用 `task-finish`。Finish 只能读取该 snapshot、准备内容等价 Delivery Carrier、交付并清理；它不得收敛 Change、同步候选内容、生成 Candidate、发起 Verification/Completion Review、接受风险或修改 Development Receipt。等价检查失败时回到本 Skill。

## 完成证据

报告 Content Target identity、policy identity、Verification Result digest/applicability、Candidate identity/generation、Completion Result digest/applicability、decision、handoff identity，以及 Finish carrier equivalence。不得把 Product Candidate verification 误报成 Task Candidate，也不得把 commit/branch/worktree 当 Candidate。
