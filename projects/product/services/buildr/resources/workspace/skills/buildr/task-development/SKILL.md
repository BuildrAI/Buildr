---
name: task-development
description: 正式Task从首个proposal、方案或直接实现等研发动作开始，到稳定Content Target、正式Verification、Task Candidate、Completion Review、风险决定与研发结果报告的全过程使用；不用于Task Record、专业内容写入、测试开发或交付执行。
---

# Task Development

本 Skill 编排`buildr.task-development/v2`。它通过Buildr内部Task Development Application工作；仍没有公共Development CLI，Buildr Web只消费Application `inspect`的只读投影来展示通用Development。父子管理不再由研发应用写入；研发记录仍只能由本应用维护。不得手写Development Receipt。

所有Development内部action必须使用`buildr task next`返回的`environment.controllerInvocation.command + argsPrefix`，再追加`__internal task-development <action> ...`；不得使用Task Environment的candidate `cliInvocation`、resource payload root或checkout中的`src/interfaces/internal`路径写canonical Workspace。

## 阶段化上下文与效率边界

进入或继续已有Formal Task时，先消费`buildr task next <task-id> --target <canonical-workspace> --json`的compact snapshot。它返回matching Environment execution roots、retained controller、保存的Development applicability和一个typed next；默认不复制完整Receipt。`required`只覆盖authority/identity恢复，`recommended`不构成gate，用户选择其他合法动作时仍交给实际owner contract判断。只有诊断恢复、审查或明确请求完整evidence时才读取详细Result。

只在某个专业动作成为 next executable action 时读取该动作的 capability contract、selected provider 与直接 authority：Planning Review、current knowledge、Formal Verification、Completion Review 和 Finish 的完整指引分别在进入对应阶段前装配，不在 proposal 前一次性预读整个生命周期。当前动作仍必须遵守已触发 Skill、required Rule、授权与 result evidence，按需读取不等于跳过门禁。

首次修改 proposal、Skill、代码、测试或当前知识前，复用 triage 建立的一次有界 authority source map；若尚未形成，则从直接相关的 canonical specs、current knowledge、实现、测试与 registries 建立。该 map 保留在 Agent 工作上下文，不写入 Receipt 或其他产品 store；只有 scope、authority 或相关事实变化时才增量刷新。

Task 可能产生用户可见前端 UI 变化、且 triage 尚未询问时，先询问用户是否需要界面原型（UI Prototype）。只有当前任务已有明确确认，才在正式前端实现前加载 selected `ui-prototype` Skill；用户拒绝、未确认或要求继续时不生成并继续本流程。当前 Task 已生成一个或多个原型且用户未明确要求忽略时，正式前端编辑前必须读取全部相关原型，并按其信息架构、布局和交互开发；需要成为正式行为的选择继续写入 design、delta specs、Brief 与 tasks。UI Prototype 与忽略选择都不保存为 Development node、gate、Result、Receipt 或 blocker。

proposal 启动耗时、重复 Skill/authority 读取、重复命令、实现到 handoff 耗时与 verification wall-clock 只作为 `task-retrospective` 跟踪、评估和优化的参考。它们不进入专业 Result、Development gate、Task status、Candidate identity或自动 skip/advance 决策，也不构成 pass/fail threshold。

日常 Development transition 或状态回读只需要 current identity、applicability 与下一步方向时，优先使用Task Entry Snapshot；直接调试Development owner时可对内部driver显式使用`--compact`。两者都只是response projection，不追加观察或写入，并以同源`formalVerificationReadiness`说明正式验证交接是否尚未到达、存在明确blocker或需要current knowledge即时确认。需要完整Receipt、专业Result引用或handoff snapshot时仍读取默认完整result。typed `next`与legacy `nextActions`来自同一判定；它们不执行动作、不代表授权，也不得越过当前阶段才加载的selected provider。

## 父子任务

父子规划与接续由 `task-manager` 的轻量父子管理方法指导。协调本身不建立环境、研发记录、专用父计划、贡献绑定或交接；本技能只在某个任务实际选择独立研发时使用。旧父计划和交接保留历史读取，不作为新工作的前置。父任务完成须取得明确用户授权，研发或验收结果不能替代。

父任务确实需要独立研发时，先按实际需要取得自己的环境，再把环境回执中的 `execution.workdir` 原样传给 `task next --execution-target <path>`，取得该研发路径的控制器与当前事实。没有执行目标时，父任务的 `task next` 只返回协调指引；不要据此猜测控制器或恢复旧父计划。

## 从首个研发动作接入

本节只适用于选择Buildr-managed Development与正式Result的路径。用户授权下的直接编辑、构建或有界测试可以在明确repository/ref、ownership与副作用边界内进行，但不会产生Development Receipt、正式Content Target、Verification、Candidate或handoff；一旦需要这些事实，必须回到matching ready Environment并由本Application建立。

1. 读取Task Record，确认Task active、Intent、Project/Service scope和`0..N` Change引用。
2. 通过`task-environment`恢复matching ready Environment，只使用Receipt返回的execution/validation roots。
3. 通过Development Application inspect已有Receipt；若缺失，在首个proposal、design、直接实现或其他正式研发动作前调用`begin`，记录完整Change dispositions与current planning snapshot。若Task将绑定OpenSpec变更，必须先有可解析脚手架并完成`add-change`再`begin`；不得先对空变更列表`begin`再绑定同一变更。无变更的任务仍在首个实现前`begin`空列表。`begin|planning`都必须显式提交完整`planning`整值；没有node时提交`{"targetIdentity":null,"nodes":[]}`，不得用字段omission表达清空、保留或patch。
4. Proposal、design或Project自定义规划artifact形成/改变时调用`planning`，只保存专业authority、portable reference、content identity、disposition与最小summary。不存在的节点不造占位；`not-applicable`说明任务不适用；`waived`必须绑定明确用户/业务授权source。省略顶层`planning`时Application会在任何Receipt写入前失败关闭，Agent应根据专业authority重新形成完整snapshot，而不是猜测旧值。
5. 通过`task-review`inspect Planning Result。Review可按当前policy不存在、not-applicable或明确waived；存在时必须绑定current planning target。旧Result和handoff snapshot即使stale也不删除或改写。

在调用`observe`或`policy`前，优先使用同一 retained controller 执行：

```text
<controller-command> <controller-args-prefix...> __internal task-development discover --task <task-id> --target <canonical-workspace> --input-json '{"action":"observe"}'
```

`discover`返回`buildr.task-development-current-input/v1`的`inputJson`与来源facts：`observe`输入来自current Receipt的完整Change dispositions与planning target；`policy`在current policy仍适用时保留显式overrides。stable Content Target进入正式验证时，默认先由`task-verification`形成按有效Project完整覆盖的closed Formal Plans，再使用重复`--plan <project>::<json-file>`让Task Verification Application校验Plan、target、declaration与capability并投影selected policy输入、coverage gaps与response-only not-selected摘要。没有Plan的合法降级路径仍按current declarations的`usableFor: task-delivery`默认能力生成policy输入。两种discover都只读、不写任何Receipt/Result；读取后仍由`observe|policy` Application对漂移事实fail closed。没有current facts时恢复对应owner，不回退到静态example手工穷举。

正式Task的OpenSpec planning artifacts达到apply-ready后，不再手工摘要文件。使用`buildr task next`返回的matching retained `environment.controllerInvocation`调用bundled只读resolver：

```text
<controller-command> <controller-args-prefix...> __internal task-planning-identity inspect --task <task-id> --target <canonical-workspace>
```

只有返回`resolved`时，才能把原样`target.identity`与全部`planningNodes`提交给`planning`并交给Planning Review。不得用artifact path、raw digest、mtime、checkbox progress、Git ref或旧Review target替代；返回`blocked`时停止推进并执行唯一`nextActions[0]`。归档后再次调用resolver：target相同则沿用current Planning Review，只更新Change disposition；target不同则先更新planning并重审。

Development只拥有这些专业事实如何构成当前Task研发过程，不生成或复制proposal、design、Review/Verification Result正文。

## 开发到稳定目标

在Candidate freeze前完成所有会改变交付内容的修改、测试开发与修复、Quick/Task-affected反馈，以及每个关联Change的deterministic convergence/archive最终处置。Current Knowledge provider可在实现、Review或Verification前后调用；若其reconcile/maintain改变delivery bytes，仍须重新observe并使旧Candidate与后续evidence失效。这些动作属于相应Project/Skill，不由Development Application执行。规划期间使用`pending`；只有OpenSpec专业流程已收敛时才能提交`converged`。Application会复用Task Record的Task-scoped Change read model，要求当前working copy为`available + archived`；retained baseline仍active不构成阻塞，调用方summary、路径与文件存在也不能替代该事实。OpenSpec归档路径、provenance、checkbox完成态和filesystem时间不属于plan target；只有Task Planning Identity resolver返回的新target才能使Planning Review stale。

检查通过后，向Development Application提交完整Change dispositions并调用`observe`形成Content Target。任一Change仍为`pending`时Application会在Content observation与Receipt写入前失败关闭；先完成Change-owned实现、current knowledge与deterministic convergence/archive，不能为了进入验证把pending伪装成stable。code-only Task提交空数组，明确`not-applicable`继续按原路径工作。观察结果必须只含逻辑selector、相对source path、observer capability与内容identity，不得保存本机路径。Content Target形成前，Receipt状态保持`planning`，不得虚构policy、Candidate或Result。

Candidate freeze后交付基线（Delivery Baseline）前进时，不要rebase或修改原Task worktree。先只读inspect原Task source snapshot、Task Context、policy与gates；Task Development是Content Target、Candidate、Verification、Completion Review、decision与handoff是否current/stale的唯一authority。原Task source与这些输入未变时，全部facts保持current，由智能体（Agent）按实际 Git 事实选择安全交付方式；不得调用observe覆盖Content Target、重跑正式Verification或递增generation。

Finish的Git conflict只证明机械应用失败或需要语义判断，不证明任务贡献（Task Contribution）已改变。只有Agent确认任务行为、验收目标或原Task source/Task Contribution真实变化时，才调用observe并按本Skill重新Verification、Completion Review、handoff与freeze。无法判断时保持blocked，不交付或伪造复用evidence。

## Verification policy 与正式 Verification

根据 Task scope、Task Verification Application返回的current declarations与current closed Formal Plans，形成一份完整 policy：

- 选择当前稳定目标需要的已有 capabilities，并说明 required；
- 没有能力时记录 Project/Service coverage gap；
- applicability override 必须包含 Project、capability、required decision、scope、basis 和 source；
- 不在 Verification 阶段开发测试，也不复制 Project 测试 registry。

有效Project集合必须合并显式Project、Service所属Project与Change所属Project。只有并集为空时才使用仅工作区policy：空declarations、空capabilities、唯一`workspace` coverage gap与空overrides；Service或Change不能因省略`scope.projects`进入该分支。仅工作区Content Target变化后重新形成policy；Project集合或declaration变化时旧policy必须stale。

stable Content Target形成后按默认顺序执行：

1. 针对每个有效Project形成并复核closed Formal Verification Plan；只运行较窄focused feedback，不在阶段切换前另启相同broad affected execution。
2. Plan preview为`action-required`时，把原样`preparation.planRequest`交给Task Environment一次幂等prepare；不手写安装或扩大Task scope。
3. 使用同一批Plan documents调用`discover policy --plan <project>::<json-file>`；若返回聚合`preparation.planRequest`，先原样交给Task Environment一次prepare并重跑同一批Plan preview/discover。检查selected、not-selected、coverage gaps与必要risk override，再把返回的closed `inputJson`交给policy writer。
4. Task Context、Planning、Content Target、Environment准备与policy均current后调用freeze形成或复用Candidate；随后把同一Plan文件交给formal run/reconcile。

该顺序是Formal Development的推荐工作流，不自动prepare、policy、freeze或run，也不是普通开发的许可层；Agent仍决定额外风险能力、override、外部授权及是否采用其他满足owner contract的合法路径。Plan、target、declaration或capability identity变化时重新plan，不复用旧preview或execution。

Candidate形成后读取response-only`formalVerificationReadiness`：`ready`时把current Candidate identity/generation与Content Target作为显式lease交给`task-verification`；`blocked`只处理其中明确的Candidate输入漂移；`not-applicable`表示尚未到Candidate或已有matching Verification。readiness不进入Receipt、Result或新sidecar。

该预检只属于正式Task的Development → Formal Verification交接。开发中的focused/affected/unit/integration反馈、Task外transient`verification run`和Candidate CI不读取readiness。Current Knowledge不再是Formal Verification前的固定预检；它只需在handoff前形成绑定current Content Target的最小disposition。

然后针对current Candidate执行正式`task-verification`。Execution Record与Result必须绑定Candidate identity/generation、Content Target与declarations；policy中每个required capability都必须有从matching execution authority对账的passed/failed fact，每个policy gap都必须在Result中有对应coverage gap。仅工作区没有验证能力时记录空declarations、空capabilities、唯一workspace gap与`not-passed`，不得自动passed或提交claimed capability facts。

## Candidate、Completion 与决定

所有Change disposition非pending、每个`converged`由current working copy archived事实证明、planning disposition明确且Content Target与policy current后，即可调用Development Application freeze。freeze不修改内容、不运行命令，只创建或复用current Candidate；Verification、Completion与Current Knowledge都不进入Candidate identity，也不作为首次freeze前置。Change lifecycle、planning、Content、Task context或policy变化会使旧Candidate失效并在下一次freeze递增generation。

Candidate形成后，按实际工作需要形成matching Verification、用`task-review`执行Completion Review，并由Current Knowledge provider形成绑定current Content Target的最小disposition。多Project Task逐Project取得Result后一次提交精确Project集合，单Project与仅工作区Task可沿用原聚合输入。`blocked`只用于会造成错误完成结论的冲突；`attention`保留portable follow-up但不阻止proceed/handoff。根据current gates记录：

- `blocked`：说明未获接受的风险或仍需处理的问题，不修改Task顶层status；
- `proceed`：必须绑定current Candidate。Verification not-passed、coverage gap或Completion changes-required时，每项风险都要绑定`verification|completion`、精确Result digest、scope、summary和用户授权source；跳过整个适用gate使用`gate`记录waiver，不伪造Result或混入风险列表。

只有current Candidate、三个current gates、非blocked且current的Knowledge disposition和合法proceed decision同时成立时生成正式handoff。Application append immutable snapshot；不得因后续Result刷新、Knowledge更新或新generation改写旧snapshot。

## 研发结果与独立收尾

本技能（Skill）保存研发路径自身选择的专业事实，不为收尾规定前置交接。研发结果就绪后报告成果及限制；用户要求收尾或交付时，由 `task-finish` 依据当前目标独立组合工具。已有候选或交接是可参考的历史，不要求所有交付路径消费，也不补造收尾运行或对账。

## 完成证据

只报告实际形成且适用的研发事实；缺失如实说明，不为收尾补造候选或交接。报告planning snapshot identity与nodes/dispositions、Content Target identity、policy identity、Verification Result或waiver applicability、Candidate identity/generation、Completion Result或waiver applicability、decision、handoff identity，以及适用的任务成果和交付目标观察。不得把Product Candidate verification误报成Task Candidate，也不得把commit/branch/worktree当Candidate。
