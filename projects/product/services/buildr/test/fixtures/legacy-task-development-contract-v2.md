---
schemaVersion: buildr.capability-contract/v1
id: buildr.task-development
version: 2
---

# 任务研发（Task Development）

## Purpose

维护正式 Task 自身选择的研发过程，维护唯一 Development Receipt、可选 planning facts、Content Target、verification policy、Task Candidate generation、专业 gate/disposition、推进决定与不可变 handoff。Task Development 是研发聚合事实 authority；它不是 Task Core、artifact/Result内容 writer、测试执行器、Git交付器或通用状态机。

## Consumer Obligations

选择Buildr-managed Development与正式Result的consumer必须提供active Task ID、canonical Workspace、matching ready Environment与完整Change disposition；code-only Task显式提供空Change列表。直接编辑、构建或有界测试不消费本能力，也不产生Development Receipt、Content Target、Verification、Candidate或handoff。进入本能力后，首个proposal、design或实现动作必须调用`begin`建立current planning snapshot；`begin|planning`显式提交完整`planning`整值。

Planning node可以不存在、`not-applicable`或由用户/业务授权明确`waived`。`current|stale`节点必须绑定专业authority、portable reference与content identity；`waived`必须保存精确summary和authorization source。consumer不得把waiver伪造成Review/Verification Result。

内容、测试开发与Change收敛完成后才能调用`observe`建立stable Content Target；Current Knowledge可在实现、Review或Verification前后形成，但任何会改变delivery bytes的reconcile/maintain都要求重新observe。任一关联Change仍为`pending`时Application必须在Content Target observation与Receipt写入前失败关闭。verification policy必须来自current Task scope与Task Verification declarations；有效Project集合是显式Project、Service所属Project与Change所属Project的确定性并集。只有该并集为空的真正仅工作区Task才可使用空declarations、空capabilities、唯一`workspace` coverage gap与空overrides；其他Task继续要求完整非空declarations。正式Verification Result只能由`buildr.task-verification@3` provider从matching execution authority reconciliation形成。Completion Result只能由`buildr.task-review@1` provider记录。负向current Result的风险接受必须绑定精确Result digest；跳过整个适用gate必须通过`gate`记录目标、summary与明确授权source。

consumer不得直接读写Workspace SQLite Development current slot或旧`.buildr/tasks/<task-id>/development.yml`，不得伪造planning/content/Result applicability、Candidate、decision或handoff，也不得把Git HEAD、branch、worktree、Environment path、Agent session或时间当作Candidate identity。


## Minimum Guarantees

- Development Application只能通过Task Record、Environment、Review与Verification Applications/ports取得专业事实；不得直接读取其stores。
- Development Application接收`converged`时必须复用Task Record的Task-scoped Change read model，并以当前working copy的`available + archived` lifecycle证明；不得回退到retained baseline、路径扫描、文件存在或调用方summary。后续inspect、freeze、decision、handoff与carrier currentness必须重验该事实，漂移时使Task Context、Candidate与handoff stale或blocked。
- 新写入Receipt使用closed`buildr.task-development-receipt/v3`，保存Task、Environment逻辑引用、Task context、planning current snapshot、可空Content Target、policy、current Candidate/generation、可空Current Knowledge disposition、最小gates/dispositions、decision与append-only handoffs；旧父计划、贡献绑定、父验收及贡献交接只在历史记录中保留和解码，新研发不要求它们；v1/v2只读归一化为absent新增facts，不backfill、不迁移。
- 内部driver的`discover` action只接受`observe|policy`目标，并从current Task、ready Environment、Development Receipt与Task Verification read model返回`buildr.task-development-current-input/v1` closed `inputJson`。stable Content Target进入正式验证时，consumer可以按有效Project完整提交closed Formal Plan documents；Task Verification Application必须校验Plan、target、declaration和capability后投影selected policy输入与response-only not-selected摘要。该投影不写Receipt、applicability、Task或专业Result；`observe|policy` mutation仍必须在写入前按同一Application重新校验current facts、identity与scope。无Plan的declaration默认发现保持合法降级路径。
- provider只读取Workspace SQLite中的合法v2 current Receipt；旧File Store中的v1/v2 Receipt均保持inert，不读取、不迁移、不双写。
- Receipt不保存artifact/Result正文、diff、inventory、stdout/stderr、timing、绝对路径、资源handle、聊天、隐藏推理、完整history/revision/CAS/锁/租约。
- planning snapshot只保存按id排序的最小nodes与aggregate identity；没有实际节点不得创建空artifact或Result。
- Content Target只由ready Environment中原Task source snapshot的deliverable bytes形成；控制metadata、绝对路径、Git载体、Node/npm、OpenSpec与特定测试框架不进入identity。
- policy identity只绑定current declarations、selected capabilities、coverage gaps与明确overrides；Task Verification不拥有policy。仅工作区policy的空集合与workspace gap仍必须形成稳定identity；其Content Target改变时旧policy stale，Task新增Project/Service/Project-bound Change时必须改用完整Project declarations。
- current专业Result、`not-applicable`和明确`waived`是不同gate事实。stale/incomplete Result不得被waiver或风险接受变成current。
- Candidate closed shape继续只绑定generation、Content Target、Task Context与policy identity；Task Context、Content Target、policy或Candidate前planning disposition变化必须清除current Candidate，下一次freeze递增generation。Verification、Completion、Current Knowledge与专业Result identity不得进入Candidate，也不得仅因其更新递增generation。
- Current Knowledge `knowledge` action只保存current Content Target identity、`aligned|not-applicable|attention|blocked`、portable summary、source identities与bounded unresolved items。多Project Task必须提交按Project排序且精确覆盖有效Project集合的最小dispositions，Application从该集合确定性聚合顶层status/source/unresolved facts；单Project与仅工作区Task兼容旧聚合输入。`blocked`阻止proceed/handoff，`attention`保留在handoff但不得阻止完成。Application不解释knowledge正文或固定调用顺序。
- handoff snapshot绑定Candidate、Change dispositions、Current Knowledge disposition、全部current gate/disposition、proceed decision与精确风险/waiver授权；已写snapshot append-only immutable。
- Development Application必须把唯一current Receipt事务保存到Workspace SQLite；该Receipt不进入Git或跨机器同步，旧YAML不读取、不迁移、不双写。
- Development Application必须从已保存Task Context、Planning、Content Target、policy、Candidate与Verification gate派生response-only Formal Verification readiness；它不得进入Receipt、SQLite新slot、Candidate identity、Current Knowledge或专业Result。Candidate未到达或已有matching Verification报告`not-applicable`，Candidate输入漂移报告`blocked`，current Candidate已就绪且Verification缺失报告`ready`并允许consumer交接显式Candidate lease。
- 旧研发快照的handoff equivalence查询只读；只有显式查询该历史等价能力时才提交handoff、Candidate、generation与Content Target identity，独立收尾不调用或要求此能力。Application只有在四项全部等于`observed.currentHandoff`时才能返回`equivalent`，不得从历史handoffs选择旧identity。交付能力不得修改Development Receipt，也不得读取、解释或执行Change convergence/archive。

## Effects and Authorization

普通Development授权只覆盖current Receipt整值写入和读取。`begin|planning`只登记专业authority引用；不创建或修改proposal、design、Review/Verification Result。实现、测试、current knowledge、Change convergence、Result record、外部副作用、Git transition与Environment cleanup分别由对应能力授权。`waived`必须来自用户或具备业务授权的明确source，并限制到精确node/gate target。

所有写入操作必须提交各自closed input的完整整值；字段omission不得表示清空、保留、patch或推断。

## Result Evidence

Application operation result使用`buildr.task-development-operation-result/v1`，返回operation、status、Task ID、Receipt read model、response-only receipt digest、planning/content/policy/Candidate/gate/handoff applicability、response-only Formal Verification readiness、精确effects、diagnostic与next actions。内部driver可以显式返回同一次Application result的`buildr.task-development-driver-compact/v1` response projection；该投影只保留current identities/applicability、readiness与同源effects、diagnostic、next actions，不追加Application action、Workspace观察或持久化，也不替代完整Result与Receipt authority。Receipt中的专业Result只保存digest、target、outcome与current snapshot；waiver只保存target、summary与source。

Next actions只按本次已保存Receipt/applicability提供建议性方向；Content Target current但policy missing/stale时，默认先指向Task Verification形成Formal Plan、完成必要Environment prepare并派生policy，policy current后才建议freeze。该顺序保持recommended，不自动prepare、写policy、freeze或run，也不阻止无关开发、focused feedback和其他合法路径。consumer仍须读取当前阶段的selected专业provider和授权后决定是否执行。timing、调用次数及其他效率指标不得进入建议判断、gate、Task状态、Candidate或自动skip/advance。


父子管理依据任务结果与真实成果进行总体验收，独立于本研发能力，不补造旧候选、交接或收尾运行。

## Decision Points

Task/Environment非current、planning node证据不完整、waiver无授权、Change pending、Content Target缺失或declaration/policy stale时不得freeze；Verification、Completion与Current Knowledge缺失不阻止首次freeze。Change pending另外不得调用`observe`创建stable Content Target。Candidate形成后，Formal Verification readiness为`ready`时consumer把显式Candidate lease交给Task Verification；Result必须从matching Execution Record reconciliation形成。仅工作区matching`not-passed`Result保持Candidate current，但proceed/handoff仍必须对`workspace`gap绑定精确Result digest与明确风险授权。Completion未得到current专业Result、合法not-applicable或明确waived，Current Knowledge缺失/stale/blocked，或Verification policy facts不完整时不得proceed/handoff；attention不阻止完成。Delivery Baseline前进或Finish Git conflict不改变Development applicability；只有原Task source、Task Context、planning/policy等真实Candidate input变化才重建Candidate。无法判断时保持blocked。

## Allowed Variations

Project可以定义自己的planning node kind、专业authority与技术栈，并采用Git、tarball、安装包或其他Delivery Carrier。Provider实现可以调整内部action名称和Buildr Web布局；唯一Receipt、Workspace-local current snapshot、明确waiver、专业writer隔离、Candidate shape、研发事实与交付动作的隔离边界不可省略。

父子协调写动作已退役，旧父计划、绑定、验收及交接字段仅保留历史读取。独立研发不要求贡献交接；父任务完成授权与总体验收由任务记录入口保护。
