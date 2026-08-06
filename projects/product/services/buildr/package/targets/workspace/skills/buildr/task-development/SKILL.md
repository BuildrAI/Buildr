---
name: task-development
description: 正式Task从首个proposal、方案或直接实现等研发动作开始，到稳定Content Target、正式Verification、Task Candidate、Completion Review、风险决定与Finish handoff的全过程使用；不用于Task Record、专业内容写入、测试开发或交付执行。
---

# Task Development

本 Skill 编排`buildr.task-development/v2`。它通过Buildr内部Task Development Application工作；没有公共Development CLI，Local App只消费Application `inspect`的只读投影，不提供Development写操作。不得手写Development Receipt。

## 从首个研发动作接入

1. 读取Task Record，确认Task active、Intent、Project/Service scope和`0..N` Change引用。
2. 通过`task-environment`恢复matching ready Environment，只使用Receipt返回的execution/validation roots。
3. 通过Development Application inspect已有Receipt；若缺失，在首个proposal、design、直接实现或其他正式研发动作前调用`begin`，记录完整Change dispositions与current planning snapshot。
4. Proposal、design或Project自定义规划artifact形成/改变时调用`planning`，只保存专业authority、portable reference、content identity、disposition与最小summary。不存在的节点不造占位；`not-applicable`说明任务不适用；`waived`必须绑定明确用户/业务授权source。
5. 通过`task-review`inspect Planning Result。Review可按当前policy不存在、not-applicable或明确waived；存在时必须绑定current planning target。旧Result和handoff snapshot即使stale也不删除或改写。

Development只拥有这些专业事实如何构成当前Task研发过程，不生成或复制proposal、design、Review/Verification Result正文。

## 开发到稳定目标

在 Candidate freeze 前完成所有内容修改、测试开发与修复、Quick/Task-affected 反馈、current knowledge 维护，以及每个关联 Change 的 sync/archive 最终处置。这些动作属于相应 Project/Skill，不由 Development Application 执行。

内容固定后，向Development Application提交完整Change dispositions并调用`observe`形成Content Target。code-only Task提交空数组。观察结果必须只含逻辑selector、相对source path、observer capability与内容identity，不得保存本机路径。Content Target形成前，Receipt状态保持`planning`，不得虚构policy、Candidate或Result。

Candidate freeze后交付基线（Delivery Baseline）前进时，不要rebase或修改原Task worktree。先只读inspect原Task source snapshot、Task Context、policy与gates；Task Development是Content Target、Candidate、Verification、Completion Review、decision与handoff是否current/stale的唯一authority。原Task source与这些输入未变时，全部facts保持current，直接让Finish在run-owned隔离交付载体（Delivery Carrier）处理交付适配（Delivery Adaptation）；不得调用observe覆盖Content Target、重跑正式Verification或递增generation。

Finish的Git conflict只证明机械应用失败或需要语义判断，不证明任务贡献（Task Contribution）已改变。只有Agent确认任务行为、验收目标或原Task source/Task Contribution真实变化时，才调用observe并按本Skill重新Verification、Completion Review、handoff与freeze。无法判断时保持blocked，不交付或伪造复用evidence。

## Verification policy 与正式 Verification

根据 Task scope 和 Task Verification Application 返回的 current declarations，形成一份完整 policy：

- 选择当前稳定目标需要的已有 capabilities，并说明 required；
- 没有能力时记录 Project/Service coverage gap；
- applicability override 必须包含 Project、capability、required decision、scope、basis 和 source；
- 不在 Verification 阶段开发测试，也不复制 Project 测试 registry。

然后对 Content Target identity 执行正式 `task-verification`。Result target/declarations 必须 current；policy 中每个 required capability 都必须有明确 passed/failed fact，每个 policy gap 都必须在 Result 中有对应 coverage gap。正式 Verification 可能得到 `not-passed`，但不能缺少事实。

## Candidate、Completion 与决定

所有Change disposition非pending、planning nodes与适用gates已得到current专业Result、`not-applicable`或明确`waived`处置，policy current且Verification facts满足policy后，调用Development Application freeze。freeze不修改内容、不运行命令，只创建或复用current Candidate；planning、Content、Task context、policy或gate disposition变化会使旧Candidate失效并在下一次freeze递增generation。

随后用 `task-review` 对 Candidate identity 执行 Completion Review。根据 current gates 记录：

- `blocked`：说明未获接受的风险或仍需处理的问题，不修改Task顶层status；
- `proceed`：必须绑定current Candidate。Verification not-passed、coverage gap或Completion changes-required时，每项风险都要绑定`verification|completion`、精确Result digest、scope、summary和用户授权source；跳过整个适用gate使用`gate`记录waiver，不伪造Result或混入风险列表。

只有 current Candidate、三个 current gates 和合法 proceed decision 同时成立时生成正式 handoff。Application append immutable snapshot；不得因后续 Result 刷新或新 generation 改写旧 snapshot。

## 交给 Finish

handoff 完成后调用 `task-finish`。Finish 只能读取该 snapshot、准备或保留隔离Delivery Carrier、交付并清理；它不得收敛Change、同步Candidate内容、生成Candidate、发起正式Verification/Completion Review、接受风险或修改Development Receipt。只有Development Application报告applicability stale时才回到本Skill；Finish机械冲突留在carrier适配路径。

## 完成证据

报告planning snapshot identity与nodes/dispositions、Content Target identity、policy identity、Verification Result或waiver applicability、Candidate identity/generation、Completion Result或waiver applicability、decision、handoff identity，以及适用的Task Contribution/Delivery Baseline观察与Finish carrier equivalence。不得把Product Candidate verification误报成Task Candidate，也不得把commit/branch/worktree当Candidate。
