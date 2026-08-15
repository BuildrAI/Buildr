---
name: task-development
description: 正式Task从首个proposal、方案或直接实现等研发动作开始，到稳定Content Target、正式Verification、Task Candidate、Completion Review、风险决定与Finish handoff的全过程使用；不用于Task Record、专业内容写入、测试开发或交付执行。
---

# Task Development

本 Skill 编排`buildr.task-development/v2`。它通过Buildr内部Task Development Application工作；仍没有公共Development CLI，Buildr Web只消费Application `inspect`的只读投影来展示通用Development。Parent coordination另有受控公共CLI/Buildr Web surface，但Development Receipt仍只能由Application写入。不得手写Development Receipt。

## 阶段化上下文与效率边界

进入或继续已有Formal Task时，先消费`buildr task next <task-id> --target <canonical-workspace> --json`的compact snapshot。它返回matching Environment execution roots、retained controller、保存的Development applicability和一个typed next；默认不复制完整Receipt。`required`只覆盖authority/identity恢复，`recommended`不构成gate，用户选择其他合法动作时仍交给实际owner contract判断。只有诊断恢复、审查或明确请求完整evidence时才读取详细Result。

只在某个专业动作成为 next executable action 时读取该动作的 capability contract、selected provider 与直接 authority：Planning Review、current knowledge、Formal Verification、Completion Review 和 Finish 的完整指引分别在进入对应阶段前装配，不在 proposal 前一次性预读整个生命周期。当前动作仍必须遵守已触发 Skill、required Rule、授权与 result evidence，按需读取不等于跳过门禁。

首次修改 proposal、Skill、代码、测试或当前知识前，复用 triage 建立的一次有界 authority source map；若尚未形成，则从直接相关的 canonical specs、current knowledge、实现、测试与 registries 建立。该 map 保留在 Agent 工作上下文，不写入 Receipt 或其他产品 store；只有 scope、authority 或相关事实变化时才增量刷新。

proposal 启动耗时、重复 Skill/authority 读取、重复命令、实现到 handoff 耗时与 verification wall-clock 只作为 `task-retrospective` 跟踪、评估和优化的参考。它们不进入专业 Result、Development gate、Task status、Candidate identity或自动 skip/advance 决策，也不构成 pass/fail threshold。

日常 Development transition 或状态回读只需要 current identity、applicability 与下一步方向时，优先使用Task Entry Snapshot；直接调试Development owner时可对内部driver显式使用`--compact`。两者都只是response projection，不追加观察或写入。需要完整Receipt、专业Result引用或handoff snapshot时仍读取默认完整result。typed `next`与legacy `nextActions`来自同一判定；它们不执行动作、不代表授权，也不得越过当前阶段才加载的selected provider。

## Parent Plan 与 Child Contribution

新建Parent可以显式采用Parent Plan。先用`task parent inspect`确认`legacy|parent-plan`模式；首次`record`只保存outcome、architecture invariants、Contribution Map、dependencies与final acceptance。Parent Plan不得保存Child状态、Result、完整delta Requirement、字段/migration/file清单或Markdown checkbox进度。只有这五类协调内容实质变化时才用current identity执行`reconcile`；普通Child完成、Verification、Change归档或Finish不得改写Plan。

Parent Plan JSON只是`task parent record|reconcile --input`的一次性CLI输入，不是Development资源或长期事实。Agent必须在操作系统临时目录创建，不得写入Workspace的`.buildr/local/`、`.buildr/tmp/`、`.buildr/transient/`或其他受管资产目录；`record`或`reconcile`成功后必须立即删除。命令失败时，只有仍需使用同一输入诊断或重试才能暂时保留，并必须报告路径；问题解决、放弃重试或Task终止后立即删除。Application保存的current Parent Plan才是authority；CLI、Task Development和Environment cleanup均不扫描或删除调用方临时输入。

Child必须先通过Task Record绑定Parent，再建立自己的Development Receipt，并用`task parent bind-child`绑定一个或多个current Contribution。Child仍拥有独立Environment、窄Change、Planning Review、Verification、Completion Review与Finish；同一个具体规范变化同一时间只能由一个active Change持有。

Child形成正式handoff时必须提交`contributionHandoff`，完整表达planned、delivered、extra、residual、superseded、affected与唯一`nextAction`。Application要求planned精确匹配已保存binding，全部引用属于current Parent Plan，且parentTaskId与Task Record关系一致；`completed`状态不能替代handoff证明。Parent自己承担窄集成Contribution时，在Plan中把`plannedChildTaskId`设为Parent Task ID，并由Parent自己的current Development handoff证明。

Child越过其他Contribution、改变依赖/invariant/final acceptance或覆盖未来Child范围时，先根据已保存handoff显式`reconcile` Parent Plan，再分别更新或放弃受影响Child：全部覆盖用Task Record `abandon`并在handoff/Plan中表达superseded，部分覆盖只保留residual intent与窄Change；不得伪装completed，也不得从代码、文件或canonical specs猜测delivery。

所有Contribution得到saved delivery或明确superseded后，`task parent accept`仍只记录显式最终集成验收，不自动完成Parent。随后继续正常Candidate、Completion Review、decision、handoff与Formal Finish。

## 从首个研发动作接入

1. 读取Task Record，确认Task active、Intent、Project/Service scope和`0..N` Change引用。
2. 通过`task-environment`恢复matching ready Environment，只使用Receipt返回的execution/validation roots。
3. 通过Development Application inspect已有Receipt；若缺失，在首个proposal、design、直接实现或其他正式研发动作前调用`begin`，记录完整Change dispositions与current planning snapshot。`begin|planning`都必须显式提交完整`planning`整值；没有node时提交`{"targetIdentity":null,"nodes":[]}`，不得用字段omission表达清空、保留或patch。
4. Proposal、design或Project自定义规划artifact形成/改变时调用`planning`，只保存专业authority、portable reference、content identity、disposition与最小summary。不存在的节点不造占位；`not-applicable`说明任务不适用；`waived`必须绑定明确用户/业务授权source。省略顶层`planning`时Application会在任何Receipt写入前失败关闭，Agent应根据专业authority重新形成完整snapshot，而不是猜测旧值。
5. 通过`task-review`inspect Planning Result。Review可按当前policy不存在、not-applicable或明确waived；存在时必须绑定current planning target。旧Result和handoff snapshot即使stale也不删除或改写。

正式Task的OpenSpec planning artifacts达到apply-ready后，不再手工摘要文件。使用Task Environment声明的Node与Buildr Service execution root调用只读resolver：

```text
node <buildr-service-root>/src/interfaces/internal/task-planning-identity-driver.mjs inspect --task <task-id> --target <canonical-workspace>
```

只有返回`resolved`时，才能把原样`target.identity`与全部`planningNodes`提交给`planning`并交给Planning Review。不得用artifact path、raw digest、mtime、checkbox progress、Git ref或旧Review target替代；返回`blocked`时停止推进并执行唯一`nextActions[0]`。归档后再次调用resolver：target相同则沿用current Planning Review，只更新Change disposition；target不同则先更新planning并重审。

Development只拥有这些专业事实如何构成当前Task研发过程，不生成或复制proposal、design、Review/Verification Result正文。

## 开发到稳定目标

在 Candidate freeze 前完成所有内容修改、测试开发与修复、Quick/Task-affected 反馈、current knowledge 维护，以及每个关联 Change 的 deterministic convergence/archive 最终处置。这些动作属于相应 Project/Skill，不由 Development Application 执行。规划期间使用`pending`；只有OpenSpec专业流程已收敛时才能提交`converged`。Application会复用Task Record的Task-scoped Change read model，要求当前working copy为`available + archived`；retained baseline仍active不构成阻塞，调用方summary、路径与文件存在也不能替代该事实。OpenSpec归档路径、provenance、checkbox完成态和filesystem时间不属于plan target；只有Task Planning Identity resolver返回的新target才能使Planning Review stale。

内容固定后，向Development Application提交完整Change dispositions并调用`observe`形成Content Target。code-only Task提交空数组。观察结果必须只含逻辑selector、相对source path、observer capability与内容identity，不得保存本机路径。Content Target形成前，Receipt状态保持`planning`，不得虚构policy、Candidate或Result。

Candidate freeze后交付基线（Delivery Baseline）前进时，不要rebase或修改原Task worktree。先只读inspect原Task source snapshot、Task Context、policy与gates；Task Development是Content Target、Candidate、Verification、Completion Review、decision与handoff是否current/stale的唯一authority。原Task source与这些输入未变时，全部facts保持current，直接让Finish在run-owned隔离交付载体（Delivery Carrier）处理交付适配（Delivery Adaptation）；不得调用observe覆盖Content Target、重跑正式Verification或递增generation。

Finish的Git conflict只证明机械应用失败或需要语义判断，不证明任务贡献（Task Contribution）已改变。只有Agent确认任务行为、验收目标或原Task source/Task Contribution真实变化时，才调用observe并按本Skill重新Verification、Completion Review、handoff与freeze。无法判断时保持blocked，不交付或伪造复用evidence。

## Verification policy 与正式 Verification

根据 Task scope 和 Task Verification Application 返回的 current declarations，形成一份完整 policy：

- 选择当前稳定目标需要的已有 capabilities，并说明 required；
- 没有能力时记录 Project/Service coverage gap；
- applicability override 必须包含 Project、capability、required decision、scope、basis 和 source；
- 不在 Verification 阶段开发测试，也不复制 Project 测试 registry。

有效Project集合必须合并显式Project、Service所属Project与Change所属Project。只有并集为空时才使用仅工作区policy：空declarations、空capabilities、唯一`workspace` coverage gap与空overrides；Service或Change不能因省略`scope.projects`进入该分支。仅工作区Content Target变化后重新形成policy；Project集合或declaration变化时旧policy必须stale。

然后对 Content Target identity 执行正式 `task-verification`。Result target/declarations 必须 current；policy 中每个 required capability 都必须有明确 passed/failed fact，每个 policy gap 都必须在 Result 中有对应 coverage gap。仅工作区没有验证能力时记录空declarations、空capabilities、唯一workspace gap与`not-passed`，不得自动passed。gap尚未进入matching current Result时不得freeze；事实完整后仍按现有风险授权门禁推进。

## Candidate、Completion 与决定

所有Change disposition非pending，且每个`converged`均由current working copy archived事实证明后，planning nodes与适用gates已得到current专业Result、`not-applicable`或明确`waived`处置，policy current且Verification facts满足policy，才调用Development Application freeze。freeze不修改内容、不运行命令，只创建或复用current Candidate；Change lifecycle、planning、Content、Task context、policy或gate disposition变化会使旧Candidate失效并在下一次freeze递增generation。

随后用 `task-review` 对 Candidate identity 执行 Completion Review。根据 current gates 记录：

- `blocked`：说明未获接受的风险或仍需处理的问题，不修改Task顶层status；
- `proceed`：必须绑定current Candidate。Verification not-passed、coverage gap或Completion changes-required时，每项风险都要绑定`verification|completion`、精确Result digest、scope、summary和用户授权source；跳过整个适用gate使用`gate`记录waiver，不伪造Result或混入风险列表。

只有 current Candidate、三个 current gates 和合法 proceed decision 同时成立时生成正式 handoff。Application append immutable snapshot；不得因后续 Result 刷新或新 generation 改写旧 snapshot。承担Parent Contribution的Task必须同时提供上述Contribution Handoff。

## 交给 Finish

handoff 完成后调用 `task-finish`。Finish 只能读取该 snapshot、准备或保留隔离Delivery Carrier、交付并清理；它每次核验都必须把run冻结的handoff、Candidate、generation与Content Target identity提交给Development Application，不能从历史handoffs自行选择。Finish不得收敛Change、同步Candidate内容、生成Candidate、发起正式Verification/Completion Review、接受风险或修改Development Receipt。只有Development Application报告applicability stale时才回到本Skill；Finish机械冲突留在carrier适配路径。

## 完成证据

报告planning snapshot identity与nodes/dispositions、Content Target identity、policy identity、Verification Result或waiver applicability、Candidate identity/generation、Completion Result或waiver applicability、decision、handoff identity，以及适用的Task Contribution/Delivery Baseline观察与Finish carrier equivalence。不得把Product Candidate verification误报成Task Candidate，也不得把commit/branch/worktree当Candidate。
