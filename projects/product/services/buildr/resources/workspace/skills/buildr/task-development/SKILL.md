---
name: task-development
description: 正式Task从首个proposal、方案或直接实现等研发动作开始，到稳定Content Target、正式Verification、Task Candidate、Completion Review、风险决定与Finish handoff的全过程使用；用户创建或准备Parent时还负责从active Task Record持续准备到可选择首个Child；不用于Task Record、专业内容写入、测试开发或交付执行。
---

# Task Development

本 Skill 编排`buildr.task-development/v2`。它通过Buildr内部Task Development Application工作；仍没有公共Development CLI，Buildr Web只消费Application `inspect`的只读投影来展示通用Development。Parent coordination另有受控公共CLI/Buildr Web surface，但Development Receipt仍只能由Application写入。不得手写Development Receipt。

所有Development内部action必须使用`buildr task next`返回的`environment.controllerInvocation.command + argsPrefix`，再追加`__internal task-development <action> ...`；不得使用Task Environment的candidate `cliInvocation`、resource payload root或checkout中的`src/interfaces/internal`路径写canonical Workspace。

## 阶段化上下文与效率边界

进入或继续已有Formal Task时，先消费`buildr task next <task-id> --target <canonical-workspace> --json`的compact snapshot。它返回matching Environment execution roots、retained controller、保存的Development applicability和一个typed next；默认不复制完整Receipt。`required`只覆盖authority/identity恢复，`recommended`不构成gate，用户选择其他合法动作时仍交给实际owner contract判断。只有诊断恢复、审查或明确请求完整evidence时才读取详细Result。

只在某个专业动作成为 next executable action 时读取该动作的 capability contract、selected provider 与直接 authority：Planning Review、current knowledge、Formal Verification、Completion Review 和 Finish 的完整指引分别在进入对应阶段前装配，不在 proposal 前一次性预读整个生命周期。当前动作仍必须遵守已触发 Skill、required Rule、授权与 result evidence，按需读取不等于跳过门禁。

首次修改 proposal、Skill、代码、测试或当前知识前，复用 triage 建立的一次有界 authority source map；若尚未形成，则从直接相关的 canonical specs、current knowledge、实现、测试与 registries 建立。该 map 保留在 Agent 工作上下文，不写入 Receipt 或其他产品 store；只有 scope、authority 或相关事实变化时才增量刷新。

Task 可能产生用户可见前端 UI 变化、且 triage 尚未询问时，先询问用户是否需要界面原型（UI Prototype）。只有当前任务已有明确确认，才在正式前端实现前加载 selected `ui-prototype` Skill；用户拒绝、未确认或要求继续时不生成并继续本流程。当前 Task 已生成一个或多个原型且用户未明确要求忽略时，正式前端编辑前必须读取全部相关原型，并按其信息架构、布局和交互开发；需要成为正式行为的选择继续写入 design、delta specs、Brief 与 tasks。UI Prototype 与忽略选择都不保存为 Development node、gate、Result、Receipt 或 blocker。

proposal 启动耗时、重复 Skill/authority 读取、重复命令、实现到 handoff 耗时与 verification wall-clock 只作为 `task-retrospective` 跟踪、评估和优化的参考。它们不进入专业 Result、Development gate、Task status、Candidate identity或自动 skip/advance 决策，也不构成 pass/fail threshold。

日常 Development transition 或状态回读只需要 current identity、applicability 与下一步方向时，优先使用Task Entry Snapshot；直接调试Development owner时可对内部driver显式使用`--compact`。两者都只是response projection，不追加观察或写入，并以同源`formalVerificationReadiness`说明正式验证交接是否尚未到达、存在明确blocker或需要current knowledge即时确认。需要完整Receipt、专业Result引用或handoff snapshot时仍读取默认完整result。typed `next`与legacy `nextActions`来自同一判定；它们不执行动作、不代表授权，也不得越过当前阶段才加载的selected provider。

## Parent Plan 与 Child Contribution

正式Child只用于真正独立交付的Contribution：它必须能单独说明目标与scope，并形成自己的Candidate/evidence、immutable Contribution Handoff和真实Delivery。普通并行调查、临时Agent分工、同一Contribution内的局部实现或测试协作不创建Child、不绑定Contribution，也不进入Parent进度事实；Agent可在同一Task内自行编排。不能独立handoff和delivery的工作不得仅因并发人数或目录边界被长期建模。

新建Parent可以显式采用Parent Plan。正常启动顺序是：active Task → matching ready Parent Environment → Development begin → Parent Plan record → current Planning Review → `task parent refresh-planning`消费Review → `task next`返回首个依赖已满足的Contribution。任何一步blocked都只恢复该步的owner事实；不要先创建Child、手工拼Development写入或把非阻塞建议升级成gate。

当`task-manager`或`task-triage`因用户的创建、准备、拆分Parent或准备到可启动Child目标交接active Parent时，本Skill默认连续完成上述准备，不要求用户为每个阶段重新发指令：

1. 先运行`buildr task next <parent-task-id> --target <canonical-workspace> --json`，只执行current typed next或同一次Parent交接明确要求的Plan采用动作。
2. next为`prepare`时交给`task-environment`；next为`begin`时使用返回的matching retained controller调用Development `begin`。每次成功后立即重读`task next`，不得缓存后续next。
3. Environment与Development current、但尚未采用Parent Plan时，复用当前对话已明确的规划输入。能够明确写出outcome、architecture decisions、至少一个Contribution的objective/directions/boundaries、dependencies与final acceptance时，直接按v2 schema执行`task parent record`；不重复询问已知事实。只有缺失信息会改变这些协调语义时才提出最少问题，不创建占位Contribution、不猜架构决定，也不把Child状态、Result或实现清单写入Plan。
4. Plan保存后继续消费typed next：`planning-review`交给`task-review`；`refresh-parent-planning`调用公开`task parent refresh-planning`。owner成功后均重读current next，不跨owner直接写Environment Receipt、Review Result或Parent progress。
5. 只有current next为`start-child-contribution`且返回至少一个eligible Contribution时，才报告“Parent已准备好，可以选择第一个Child”，列出eligible Contributions并停止。不得继续`observe`、Verification、Candidate、Finish，也不得自动选择或创建Child。

默认准备只在真实blocker处中断：owner返回blocked且需要业务决定或新授权，或缺失事实会实质改变Parent outcome、Contribution切分、依赖、边界或final acceptance。普通recommended动作、可由对应owner恢复的内部登记缺口和当前对话已经提供的信息都不是要求用户重新发起准备的理由；能够安全恢复时继续循环。若Parent Coordination没有eligible Contribution，报告它返回的真实依赖或planning blocker，不得把Task Record created、Plan saved或Review ready单独误报为Parent已经准备好。

Parent Environment只服务Parent本身。纯协调且在Child前不修改交付内容的Parent可以显式采用coordination-only共享执行根；Parent会直接修改代码、文档或其他生产内容时，必须从一开始使用隔离checkout。Child Environment按Child自己的Task scope另行准备，既不继承Parent Receipt，也不因Parent Plan刚建立而提前prepare。若Child依赖Parent尚未进入canonical baseline的真实交付，Parent Plan必须表达该依赖，并等前置Contribution正式交付后再准备Child Environment。

先用`task parent inspect`确认`ordinary|legacy|child|parent-plan`模式；`task parent record|reconcile --schema|--example`是Parent Plan输入的公开发现入口。首次`record`只保存outcome、architecture decisions、结构化Contribution Map与final acceptance。每个Contribution显式包含自由格式priority、title、objective、directions、boundaries、可选expectedChild和dependencies。`expectedChild`只描述预期形态，不是Task ID、binding或已创建事实；预期、可执行性与实际Child事实必须分别判断。Parent Plan不得保存Child状态、Result、完整delta Requirement、字段/migration/file清单或Markdown checkbox进度。只有协调内容实质变化时才用current identity执行`reconcile`；普通Child完成、Verification、Change归档或Finish不得改写Plan。

新writer只接受`buildr.parent-plan/v2`输入。Application对已保存v1按原字段与原identity只读兼容，再投影到current read model；升级必须通过current v1 identity和完整v2输入显式`reconcile`，不得迁移SQLite、批量backfill或在inspect时改写。

Parent Plan JSON只是`task parent record|reconcile --input`的一次性CLI输入，不是Development资源或长期事实。Agent必须在操作系统临时目录创建，不得写入Workspace的`.buildr/local/`、`.buildr/tmp/`、`.buildr/transient/`或其他受管资产目录；`record`或`reconcile`成功后必须立即删除。命令失败时，只有仍需使用同一输入诊断或重试才能暂时保留，并必须报告路径；问题解决、放弃重试或Task终止后立即删除。Application保存的current Parent Plan才是authority；CLI、Task Development和Environment cleanup均不扫描或删除调用方临时输入。

满足独立交付门槛的Child必须先通过Task Record绑定Parent，再建立自己的Development Receipt，并用`task parent bind-child`绑定一个或多个current Contribution。Child仍拥有独立Environment、窄Change、Planning Review、Verification、Completion Review与Finish；同一个具体规范变化同一时间只能由一个active Change持有。

Child形成正式handoff时必须提交`contributionHandoff`，完整表达planned、delivered、extra、residual、superseded、affected与唯一`nextAction`。Application要求planned精确匹配已保存binding，全部引用属于current Parent Plan，且parentTaskId与Task Record关系一致；`completed`状态不能替代handoff证明，`expectedChild`也不能替代真实Child relation与binding。

只有Child已经completed且非no-change、matching terminal Finish association精确指向不含Contribution Handoff的immutable handoff、全部Change仍为archived，并且用户或治理任务已经明确给出current Parent Plan映射时，才可使用`task parent reconcile-child-delivery`异常恢复。先用`--schema|--example`发现closed输入，再显式提交`--parent`、`--expected-plan`、完整Contribution Handoff、`--reason`与`--source`；不得从Git、代码、文件、canonical specs或completed状态猜测delivery。相同恢复可幂等重放；Plan漂移、handoff/Finish不匹配、已有原生handoff或其他Child owner冲突时停止。该入口不重开Task、不修改旧Receipt/handoff/Finish，也不得被建议为正常Child省略binding或handoff的后补路径。

Agent读取`buildr.parent-coordination-result/v3`时只消费canonical字段：Plan identity与治理摘要取`plan`，工作项取唯一顶层`contributions`，预期Child取`expectation.child`，真实Child binding取`boundContributions`，delivery来源取`delivery.proof.kind`（`native-handoff|terminal-reconciliation`），下一步取`startup.next`。不得期待v2的raw `parentPlan`、`plan.contributions`、顶层`nextActions`、`finalAcceptanceReady`、Child `plannedContributions`或完整Review/Handoff Result；需要完整长期事实时回到对应专业authority，而不是要求Parent Coordination复制。

Child越过其他Contribution、改变依赖/invariant/final acceptance或覆盖未来Child范围时，先根据已保存handoff显式`reconcile` Parent Plan，再分别更新或放弃受影响Child：全部覆盖用Task Record `abandon`并在handoff/Plan中表达superseded，部分覆盖只保留residual intent与窄Change；不得伪装completed，也不得从代码、文件或canonical specs猜测delivery。

所有Contribution得到saved delivery或明确superseded后，`task parent accept`仍只记录显式最终集成验收，不自动完成Parent。随后继续正常Candidate、Completion Review、decision、handoff与Formal Finish。

## 从首个研发动作接入

本节只适用于选择Buildr-managed Development与正式Result的路径。用户授权下的直接编辑、构建或有界测试可以在明确repository/ref、ownership与副作用边界内进行，但不会产生Development Receipt、正式Content Target、Verification、Candidate或handoff；一旦需要这些事实，必须回到matching ready Environment并由本Application建立。

1. 读取Task Record，确认Task active、Intent、Project/Service scope和`0..N` Change引用。
2. 通过`task-environment`恢复matching ready Environment，只使用Receipt返回的execution/validation roots。
3. 通过Development Application inspect已有Receipt；若缺失，在首个proposal、design、直接实现或其他正式研发动作前调用`begin`，记录完整Change dispositions与current planning snapshot。若Task将绑定OpenSpec变更，必须先有可解析脚手架并完成`add-change`再`begin`；不得先对空变更列表`begin`再绑定同一变更。无变更的任务仍在首个实现前`begin`空列表。`begin|planning`都必须显式提交完整`planning`整值；没有node时提交`{"targetIdentity":null,"nodes":[]}`，不得用字段omission表达清空、保留或patch。
4. Proposal、design或Project自定义规划artifact形成/改变时调用`planning`，只保存专业authority、portable reference、content identity、disposition与最小summary。不存在的节点不造占位；`not-applicable`说明任务不适用；`waived`必须绑定明确用户/业务授权source。省略顶层`planning`时Application会在任何Receipt写入前失败关闭，Agent应根据专业authority重新形成完整snapshot，而不是猜测旧值。
5. 通过`task-review`inspect Planning Result。Review可按当前policy不存在、not-applicable或明确waived；存在时必须绑定current planning target。旧Result和handoff snapshot即使stale也不删除或改写。

正式Task的OpenSpec planning artifacts达到apply-ready后，不再手工摘要文件。使用`buildr task next`返回的matching retained `environment.controllerInvocation`调用bundled只读resolver：

```text
<controller-command> <controller-args-prefix...> __internal task-planning-identity inspect --task <task-id> --target <canonical-workspace>
```

只有返回`resolved`时，才能把原样`target.identity`与全部`planningNodes`提交给`planning`并交给Planning Review。不得用artifact path、raw digest、mtime、checkbox progress、Git ref或旧Review target替代；返回`blocked`时停止推进并执行唯一`nextActions[0]`。归档后再次调用resolver：target相同则沿用current Planning Review，只更新Change disposition；target不同则先更新planning并重审。

Development只拥有这些专业事实如何构成当前Task研发过程，不生成或复制proposal、design、Review/Verification Result正文。

## 开发到稳定目标

在Candidate freeze前完成所有会改变交付内容的修改、测试开发与修复、Quick/Task-affected反馈，以及每个关联Change的deterministic convergence/archive最终处置。Current Knowledge provider可在实现、Review或Verification前后调用；若其reconcile/maintain改变delivery bytes，仍须重新observe并使旧Candidate与后续evidence失效。这些动作属于相应Project/Skill，不由Development Application执行。规划期间使用`pending`；只有OpenSpec专业流程已收敛时才能提交`converged`。Application会复用Task Record的Task-scoped Change read model，要求当前working copy为`available + archived`；retained baseline仍active不构成阻塞，调用方summary、路径与文件存在也不能替代该事实。OpenSpec归档路径、provenance、checkbox完成态和filesystem时间不属于plan target；只有Task Planning Identity resolver返回的新target才能使Planning Review stale。

检查通过后，向Development Application提交完整Change dispositions并调用`observe`形成Content Target。任一Change仍为`pending`时Application会在Content observation与Receipt写入前失败关闭；先完成Change-owned实现、current knowledge与deterministic convergence/archive，不能为了进入验证把pending伪装成stable。code-only Task提交空数组，明确`not-applicable`继续按原路径工作。观察结果必须只含逻辑selector、相对source path、observer capability与内容identity，不得保存本机路径。Content Target形成前，Receipt状态保持`planning`，不得虚构policy、Candidate或Result。

Candidate freeze后交付基线（Delivery Baseline）前进时，不要rebase或修改原Task worktree。先只读inspect原Task source snapshot、Task Context、policy与gates；Task Development是Content Target、Candidate、Verification、Completion Review、decision与handoff是否current/stale的唯一authority。原Task source与这些输入未变时，全部facts保持current，直接让Finish在run-owned隔离交付载体（Delivery Carrier）处理交付适配（Delivery Adaptation）；不得调用observe覆盖Content Target、重跑正式Verification或递增generation。

Finish的Git conflict只证明机械应用失败或需要语义判断，不证明任务贡献（Task Contribution）已改变。只有Agent确认任务行为、验收目标或原Task source/Task Contribution真实变化时，才调用observe并按本Skill重新Verification、Completion Review、handoff与freeze。无法判断时保持blocked，不交付或伪造复用evidence。

## Verification policy 与正式 Verification

根据 Task scope 和 Task Verification Application 返回的 current declarations，形成一份完整 policy：

- 选择当前稳定目标需要的已有 capabilities，并说明 required；
- 没有能力时记录 Project/Service coverage gap；
- applicability override 必须包含 Project、capability、required decision、scope、basis 和 source；
- 不在 Verification 阶段开发测试，也不复制 Project 测试 registry。

有效Project集合必须合并显式Project、Service所属Project与Change所属Project。只有并集为空时才使用仅工作区policy：空declarations、空capabilities、唯一`workspace` coverage gap与空overrides；Service或Change不能因省略`scope.projects`进入该分支。仅工作区Content Target变化后重新形成policy；Project集合或declaration变化时旧policy必须stale。

先在Task Context、Planning、Content Target与policy current时调用freeze形成或复用Candidate。再读取response-only`formalVerificationReadiness`：`ready`时把current Candidate identity/generation与Content Target作为显式lease交给`task-verification`；`blocked`只处理其中明确的Candidate输入漂移；`not-applicable`表示尚未到Candidate或已有matching Verification。readiness不进入Receipt、Result或新sidecar。

该预检只属于正式Task的Development → Formal Verification交接。开发中的focused/affected/unit/integration反馈、Task外transient`verification run`和Candidate CI不读取readiness。Current Knowledge不再是Formal Verification前的固定预检；它只需在handoff前形成绑定current Content Target的最小disposition。

然后针对current Candidate执行正式`task-verification`。Execution Record与Result必须绑定Candidate identity/generation、Content Target与declarations；policy中每个required capability都必须有从matching execution authority对账的passed/failed fact，每个policy gap都必须在Result中有对应coverage gap。仅工作区没有验证能力时记录空declarations、空capabilities、唯一workspace gap与`not-passed`，不得自动passed或提交claimed capability facts。

## Candidate、Completion 与决定

所有Change disposition非pending、每个`converged`由current working copy archived事实证明、planning disposition明确且Content Target与policy current后，即可调用Development Application freeze。freeze不修改内容、不运行命令，只创建或复用current Candidate；Verification、Completion与Current Knowledge都不进入Candidate identity，也不作为首次freeze前置。Change lifecycle、planning、Content、Task context或policy变化会使旧Candidate失效并在下一次freeze递增generation。

Candidate形成后，按实际工作需要形成matching Verification、用`task-review`执行Completion Review，并由Current Knowledge provider形成绑定current Content Target的最小disposition。`blocked`只用于会造成错误完成结论的冲突；`attention`保留portable follow-up但不阻止proceed/handoff。根据current gates记录：

- `blocked`：说明未获接受的风险或仍需处理的问题，不修改Task顶层status；
- `proceed`：必须绑定current Candidate。Verification not-passed、coverage gap或Completion changes-required时，每项风险都要绑定`verification|completion`、精确Result digest、scope、summary和用户授权source；跳过整个适用gate使用`gate`记录waiver，不伪造Result或混入风险列表。

只有current Candidate、三个current gates、非blocked且current的Knowledge disposition和合法proceed decision同时成立时生成正式handoff。Application append immutable snapshot；不得因后续Result刷新、Knowledge更新或新generation改写旧snapshot。承担Parent Contribution的Task必须同时提供上述Contribution Handoff。

## 交给任务收尾（Task Finish）

handoff完成后调用`task-finish`，由Agent选择自动Finish、直接Git、PR或其他已授权Delivery路径。所有路径都消费同一current snapshot；Buildr reconciliation必须把冻结handoff、Candidate、generation、Content Target与Task Contribution提交给Development Application并从真实remote target重建Delivery evidence。Task Finish不得收敛Change、生成Candidate、发起Verification/Completion Review、接受风险或修改Development Receipt。只有Development Application报告真实applicability stale时才回到本Skill；远端前进、自动carrier冲突或Buildr内部登记失败不自动使Development stale。

## 完成证据

报告planning snapshot identity与nodes/dispositions、Content Target identity、policy identity、Verification Result或waiver applicability、Candidate identity/generation、Completion Result或waiver applicability、decision、handoff identity，以及适用的Task Contribution/Delivery Baseline观察与Finish carrier equivalence。不得把Product Candidate verification误报成Task Candidate，也不得把commit/branch/worktree当Candidate。
