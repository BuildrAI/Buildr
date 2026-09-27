# 从讨论到交付

一次工作完成，意味着约定成果达到目标并到达约定位置。人表达目标、约束和判断，智能体（Agent）依据当前事实推进，Buildr 保存可查看、可接续的材料。纯调查可以止于解释，小改动可以直接实施，不需要每次走完固定流程。

![完整过程与角色职责](../../archify/flows/task-system.html)

图示表达一次较完整的工作；收尾、自举和清理是否需要执行，仍取决于实际成果与工作现场。

## 从目标形成可继续的工作

| 当前问题 | 要留下什么 |
| --- | --- |
| 要做成什么？ | 已确认目标、范围、限制与完成标准 |
| 如何推进，哪里需要决定？ | 实际进展、下一步、明确待处理事项及人的答复 |
| 怎样判断做到了？ | 实际成果、适用的审查（Review）与验证（Verification）、未覆盖范围 |
| 怎样结束本轮工作？ | 约定位置的交付、已有任务（Task）结果及可安全完成的善后 |

智能体（Agent）根据真实代码、资料、数据与环境选择方法。工作位置和变更方式见[任务分流](../../../services/buildr/resources/workspace/skills/buildr/task-triage/SKILL.md)，检查选择见[测试建设与使用](workspace-testing-and-verification-framework.md)。已有授权继续有效，出现新的业务取舍或扩大副作用时才需要新的决定。

正式任务（Task）保存目标、范围、关系、状态和结果摘要。当前工作节点、进展与下一步放在工作摘要（Work Context），不扩展为任务顶层状态。完整聊天和工具日志仍由会话系统保存，不必逐条复制。

这些材料各自回答不同的问题：任务记录（Task Record）说明“这项工作是什么”，工作摘要（Work Context）说明“现在到哪里”，变更材料解释“准备怎样改”，实际成果证明“做出了什么”。把它们区分开，才能在中断、交接或方案变化后核对同一目标，而不把一个完成状态当成所有工作的证明。

页面只能展示已经保存并关联的材料，不会自动把对话或 Git 提交整理成需求和方案。希望人在 Buildr 中接续工作时，智能体（Agent）需要及时保存目标和重要进展，并链接真实成果。小任务的方案可以写在目标说明里；采用 OpenSpec 时，任务（Task）关联对应变更，直接读取其中的提案、设计和实施清单，不另复制正文。

## OpenSpec 变更怎样推进

改变产品承诺时，智能体（Agent）结合用户目标、当前规范、实现和活跃变更判断范围。任务记录（Task Record）只关联变更；提案、设计、规范增量和实施清单由 OpenSpec 保存，不再复制一份规划快照。

工作位置遵循跨宿主的独立能力契约（Capability Contract），由已绑定提供者（Provider）创建、检查和清理。默认实现固定使用 `<workspace>/.worktrees/<task-id>`；新任务标识（Task ID）默认使用 `worktree-contract-consistency` 这类简短语义名称，不主动添加日期，已有标识及用户指定名称继续沿用。OpenSpec 归档日期只影响变更归档目录，不触发工作树（Worktree）或分支改名，也不代替交付核验和清理条件。

宿主原生工具不会因可用就成为已选实现，能力绑定（Capability Binding）变化也不自动转移旧资源归属。检查或清理前仍须核对创建归属、真实登记与证据兼容性；无法兼容时保留现场并说明具体冲突，不自动迁移、另建同任务副本或混用清理入口。依据见[工作树能力契约（Capability Contract）](../../../services/buildr/resources/workspace/skills/contracts/buildr/git-worktree-provider/v1.md)与[工作树技能（Skill）](../../../services/buildr/resources/workspace/skills/buildr/task-worktree/SKILL.md)。

1. 首次持久文件修改前，按任务分流创建或复用当前任务的工作树（Worktree）；只有用户明确要求时才在主开发分支修改，纯规划材料同样适用。
2. `openspec-propose` 创建变更并维护简要说明（Brief）、真实知识影响任务及已采用的 `.buildr/knowledge-impact.yml`。直接读取这些成果判断完整性及是否需要方案审查（Planning Review），不要求统一任务环境。
3. 实施前运行 `openspec validate <change> --strict` 和 `buildr openspec convergence preflight`。后者使用锁定的 OpenSpec 1.13.0 检查当前变更与相关规范冲突，不复制全项目做隔离验证，也不生成全局工作许可。
4. `openspec-apply-change` 在已确认的实际工作根完成变更所属清单，直接调用项目工具取得开发反馈；当前知识维护按授权执行 `assess/reconcile`，校准受影响的代码地图（Code Map）、技术图和解释文档。
5. 需要归档且全部清单闭合后，调用 `buildr openspec converge`，由锁定上游完成标准规范写入及归档。只同步规范时使用上游同步技能（Skill），保留变更，不调用归档命令。中断或恢复不确定时，用只读 `convergence inspect` 核对现场。
6. 归档成功后，重新观察代码、归档变更、当前规范、Git、审查（Review）、验证（Verification）及实际资源，按目标继续交付。归档本身不附带新的知识写入授权。

当前知识协作使用 `buildr.current-knowledge-maintenance/v3`。辅助记录缺失或陈旧时直接核对事实；非关键缺口和未授权建设仅影响相关动作，不引入额外研发聚合、候选代次或统一推进决定。只有内容或运行条件变化时才更新受影响验证，解释文档修改不要求重跑无关代码测试。实际方法见[OpenSpec 提案技能（Skill）](../../../services/buildr/resources/workspace/skills/openspec/openspec-propose/SKILL.md)和[开发变更规范](../../../openspec/specs/buildr-development-openspec/spec.md)。

## 人怎样看成果、作决定

Buildr Web 的“等我回应”显示已经明确登记的决定、验收或补充信息请求。人可以在网页或对话中答复；智能体（Agent）继续前重读该事项和成果，核对答复是否仍适用。保存答复不会自动执行下一步、完成任务（Task）或发布产品。

较大的界面变化可以先制作经用户授权的界面原型（UI Prototype），普通小改动直接实施。已有选择持续有效，不重复确认。原型可在任务（Task）相关材料中按页面和状态查看功能说明，或单独打开；它表达预计结果，不能代替真实数据接入与正式页面验收。实现见[原型阅读](../../../services/buildr-web/src/features/task/components/PrototypeTab.tsx)。

已有任务（Task）的原型默认归入可阅读位置，无需等到决定实施。有适用规范变更（OpenSpec Change）时保存在其真实工作副本，归档后仍从归档目录读取；没有关联变更时保存在主工作空间（Canonical Workspace）的 `.buildr/local/task-prototypes/<task-id>/`。任务“方案设计”和“单独查看”读取同一内容并显示来源；本机任务来源不伪造变更。[原型读取](../../../services/buildr/src/modules/task/change/application/change-application.ts)先确认任务存在，限制文件标记、体积、目录深度和数量，拒绝符号链接（Symbolic Link），一个来源不可读不阻断其他安全来源。读取不创建目录、文件或任务记录；本机目录独立于隔离工作树（Worktree），不会随 Git 提交交付，移交或长期保留时需要同时保全实际 HTML 与构建来源。归入仅表示成果可评审，不表示批准实施。

审查（Review）检查方案或成果的正确性，验证（Verification）记录实际执行的检查。二者都应指向明确内容，写清结论及未覆盖项；构建通过、测试通过、人的验收和实际交付是不同事实。

## 提交怎样关联到任务

有明确正式任务（Task）时，[Git 操作指引](../../../services/buildr/resources/workspace/skills/buildr/git-operations/SKILL.md)要求在实际提交说明（Commit Message）末尾写入一行 `Buildr-Task: <taskId>`，主题继续表达本次改动。同一任务可以产生多次提交；没有明确任务时省略尾注（Trailer），不为提交补建任务。普通正文提及任务编码、分支名或目录名都不作为归属证明。同值重复尾注按一个值读取，不同值或非法编码产生局部诊断。

[提交读取应用](../../../services/buildr/src/modules/task/commits/application/task-commits-application.ts)先核对任务存在，再从任务范围内的项目、服务、关联变更对应项目和已知任务工作树（Worktree）定位真实代码库（Repository）。没有项目、服务或关联变更的工作空间级任务（Workspace-only Task），只检查任务所属主工作空间（Canonical Workspace）根目录本身的 Git 代码库，不从当前工作目录或父目录猜测来源。查询检查本机分支、已有远端跟踪引用、标签与相关工作树 `HEAD` 当前可达的提交，因此包含尚未推送的本机提交；不自动抓取远端，不扫描任意目录。相同真实代码库中的同一完整哈希值（Hash）只计一次，结果带有读取时间、实际范围、上限与局部诊断。有界读取未完成时显示部分结果，不能据此断言没有提交或覆盖全部历史。

任务详情在“任务收尾”之后提供“提交记录”阅读标签，四个工作阶段保持原义。[提交记录组件](../../../services/buildr-web/src/features/task/components/TaskCommitRecords.tsx)显示主题、作者、时间与来源，展开可阅读、复制完整说明和完整哈希值（Hash）；任务编码保留在原始说明尾注中。命令 `buildr task commits <task-id> --target <canonical-workspace> --json` 与网页使用同一只读应用。读取不建立提交关联表，不写任务状态、审查或验证结论。

提交成功后先回读真实 Git 对象，再核对任务查询返回的代码库身份、完整哈希值（Hash）和说明；两侧一致才确认双向关联。查询失败不否定已经成功的提交，关联存在也不证明任务完成。旧提交缺少尾注时保持原历史；修改提交或变基（Rebase）后按当前可达对象重新读取，不承诺恢复已不可达或清理的对象。

## 收尾：把成果交到约定位置

用户明确要求“收尾”时，收尾方法（`task-finish`）指导智能体（Agent）完成当前范围内的实际交付、已有记录更新和安全善后。此指令已覆盖可核验的常规 Git 提交、集成与普通推送；强推、共享历史改写、远端删除、丢弃内容和语义冲突取舍仍需明确授权。

| 现场 | 怎样处理 |
| --- | --- |
| 有任务（Task），有 Git | 核对代码交付、保存已有任务结果、处理相关资源 |
| 有任务（Task），无 Git | 按业务系统或文件交付，保存已有任务结果 |
| 无任务（Task），有 Git | 按约定提交与推送，不为收尾补建记录 |
| 无任务（Task），无 Git | 交付成果本身，不制造提交或记录 |

写入前核对真实仓库、对象、归属、内容范围、目标和完整推送范围；写入后从实际系统回读。多仓库分别处理。需要部署才能达到约定目标时，部署仍是交付的一部分，不能只保存完成记录。

内容和相关运行条件未改变时，复用仍适用的验证结果；冲突处理、集成修改或已知问题影响行为时，才补相关检查。收尾本身不要求重跑完整测试、全局诊断或候选验证（Candidate Verification）。未检查的部分如实说明。

登记失败不撤销已经成立的交付，清理失败也不自动表示成果未交付；但必要成果尚未到位时，不能报告整个目标完成。当前没有统一收尾执行应用，也不从旧执行记录推断 `delivered`。

## 父任务怎样确认整体目标

父任务（Parent Task）组织一个整体目标，子任务（Child Task）承载可独立交付的成果。计划说明分工、依赖和验收标准；Buildr 保存关系与各自结果，不从子项数量推断完成比例，也不自动传播状态。

**普通完成入口**要求：直接子任务（Child Task）均已结束、总体验收覆盖整体目标与每个子项、指定父任务（Parent Task）有明确完成授权。已放弃项需要说明替代、删减或遗留处置，不能当作已经交付。

调用者先用 `task parent inspect` 读取当前目标、关系、`recordDigest` 与 `snapshotIdentity`，再提交完成摘要和 `parentCompletion`。应用在事务（Transaction）内重读；目标、关系或结果变化时拒绝旧观察，要求重新核对。成功只更新指定父任务（Parent Task），保存验收和授权依据，不执行 Git、发布或资源清理。

**网页组合结束入口**允许人明确处置每个尚未结束的直接子任务（Child Task）：

| 选择 | 实际结果 |
| --- | --- |
| 独立推进（`detach`） | 解除所属关系，保留原状态 |
| 完成（`complete`） | 按人的明确确认保存完成结果 |
| 放弃（`abandon`） | 保存放弃结果，不视为交付 |

所有选择和父项结果在同一数据库事务（Transaction）中保存。必须覆盖全部未结束子项，并核对父记录版本及父子观察身份。嵌套父任务（Parent Task）只能先在自身页面独立结束，或解除关系；外层不能递归代为验收。

网页明确提交是这次组合操作的授权依据，不代表智能体（Agent）可以自行批量关闭剩余工作。“完成这个子任务”也不能推导为完成整体目标。误完成后可用状态更正保留原结果与原因，再按当前目标继续；已经交付的独立成果不会被撤销。

[父任务完成时序图](../../archify/flows/task-parent-coordination.html)只展示普通完成入口，不包含网页组合结束。当前行为依据[任务规范](../../../openspec/specs/task-record/spec.md)、[父子观察](../../../services/buildr/src/modules/task/application/parent-coordination-application.ts)和[结果写入](../../../services/buildr/src/modules/task/application/task-command-application.ts)。旧父计划仅供历史展示，不参与当前完成判断。

## 资源清理、自举与发布分别判断

资源由创建者或明确所有者核对后清理。删除前确认归属、未保存内容和成果保留位置；不能证明安全时保留并说明。没有对应资源就不执行清理命令，不能把删除记录当作停止进程。

工作树（Worktree）可用 `worktree inspect|cleanup` 处理。清理时成对提供逐仓 `--expected-source <selector>=<完整源提交>` 和 `--delivered-ref <selector>=<完整交付提交>`；提供者检查源版本、未保存内容及保留分支中的交付提交，再删除工作副本与本地任务分支。提交存在或任务完成都不能单独证明业务成果等价。实现见[工作树管理](../../../services/buildr/src/modules/task/infrastructure/git-worktree-provider.ts)。

在 Buildr 开发自身的工作空间（Workspace）中，已交付改动若影响规则（Rule）、技能（Skill）、组件（Component）、命令（Command）或产品运行输入，由自举同步方法（`buildr-self-bootstrap-sync`）的唯一执行器完成适用更新和验证。任务编号可选，普通未安装自举组件的工作空间（Workspace）不触发。详细分支见[自举说明](../../archify/flows/task-self-bootstrap.md)。

正式发布继续独立核对版本、冻结源码、完整候选（Candidate）、唯一产物和授权，不能用任务完成记录替代。操作见[发布流程](../flows/open-source-release.md)。旧数据在版本升级中的保留范围属于[数据设计](buildr-data-design.md)，不是收尾清理许可。

更细的实现定位见[任务系统代码地图](../../code-map/task-system.md)。这些说明帮助判断工作是否完整，具体现场仍以实际成果与验证结果为准。
