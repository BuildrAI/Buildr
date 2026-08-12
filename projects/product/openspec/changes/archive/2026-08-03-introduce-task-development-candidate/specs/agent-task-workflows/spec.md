## MODIFIED Requirements

### Requirement: 内置场景化 Skills 引导产品工作流
Buildr MUST为依赖用户任务意图或工作流阶段的Buildr维护流程提供内置workspace Skills，并 MUST让Development与Finish保持相邻但独立的语义入口。

#### Scenario: Agent 需要任务分流指引
- **WHEN** 用户要求修bug、实现或调整功能、改需求、重构、优化、补文档、补测试、调整API、契约、权限、状态流、数据语义，或询问某项改动是否需要spec/change管理
- **THEN** Buildr MUST通过内置Skill提供任务意图分流能力
- **AND** 该Skill MUST帮助Agent先理解意图和影响范围，再选择后续处理方式

#### Scenario: Agent 需要 OpenSpec 工作流指引
- **WHEN** Agent需要探索、提案、实现、同步或归档OpenSpec Change
- **THEN** Buildr MUST依赖可用的`openspec-*` Skills匹配该意图
- **AND** Buildr MUST NOT要求Agent读取optional OpenSpec Rule来执行该工作流

#### Scenario: Agent 需要代码开发工作流指引
- **WHEN** 用户要求代码开发、构建、测试、多仓协作、隔离任务分支或长期任务上下文
- **THEN** Buildr MUST通过Task Environment及适用实现Skill提供执行边界
- **AND** 内容稳定后 MUST路由`task-development`完成Verification、Candidate、Completion Review与handoff

#### Scenario: Agent 需要 Git 操作指引
- **WHEN** 用户表达独立commit、push、merge、rebase、release或branch操作意图
- **THEN** Buildr MUST通过Git Ops Skill提供协作策略
- **AND** Git Ops MUST NOT接管Development Candidate或完整Task Finish

#### Scenario: Agent 需要完整任务收尾
- **WHEN** 用户对已有current Development handoff表达“收尾”或交付意图
- **THEN** Buildr MUST通过独立Task Finish Skill消费handoff并编排carrier、integration、retained与cleanup
- **AND** Finish MUST NOT编排OpenSpec、formal Verification、Review、Candidate generation或Development risk decision

### Requirement: 内置任务 Skills 按 capability contract 协作
Buildr内置任务Skills MUST依赖capability contracts而不是硬编码optional Skill identity。`task-development` MUST required消费Task Record、Task Environment、Task Review、Task Verification与current knowledge capabilities，并 MAY optional消费`buildr.task-asset-review/v3`；`task-finish` MUST required消费`buildr.task-development@1`与Task Environment，MUST不再消费Task Review、Task Verification、current knowledge或task-asset-review authority。

#### Scenario: Task Development使用required providers
- **WHEN** Buildr声明`task-development` builtin
- **THEN** manifest MUST声明`buildr.task-record/v1`、`buildr.task-environment/v1`、`buildr.task-review/v1`、`buildr.task-verification/v3`与`buildr.current-knowledge-maintenance/v2` required dependencies
- **AND** 任一required provider missing/ambiguous/blocked MUST使Development readiness fail closed

#### Scenario: Task Development使用optional asset review
- **WHEN** selected `buildr.task-asset-review/v3` provider ready且Task存在observation
- **THEN** Development MUST在形成Finish handoff前消费其finalize result
- **AND** provider缺失或没有observation MUST保持non-blocking degraded，不创建空observation

#### Scenario: Task Finish消费Development
- **WHEN** Buildr声明`task-finish` builtin
- **THEN** manifest MUST required依赖`buildr.task-development@1`与`buildr.task-environment/v1`
- **AND** MUST删除旧Task Review、Task Verification、current knowledge与task-asset-review dependencies

#### Scenario: provider替换
- **WHEN** compatible provider替换任一默认Skill
- **THEN** consumer MUST按capability identity与selected binding继续工作
- **AND** MUST NOT按Skill ID、目录或store path硬编码调用

#### Scenario: Task Finish 使用 optional v2 provider
- **WHEN** 旧runtime manifest仍把`buildr.task-asset-review/v2`声明为Task Finish optional dependency
- **THEN** P0.5 package切换 MUST从Task Finish移除该binding，并只允许Task Development optional消费`buildr.task-asset-review/v3`
- **AND** runtime MUST NOT同时保留旧Finish finalize route与新Development authority

#### Scenario: Optional provider 缺失
- **WHEN** Task Development的optional`buildr.task-asset-review/v3` provider不可用
- **THEN** Development readiness MUST保持non-blocking degraded
- **AND** 其他required providers与没有observation的正常handoff MUST不受影响

### Requirement: OpenSpec workflow 必须通过能力契约组合当前认知维护
Buildr MUST通过capability dependencies和OpenSpec Component-owned Skill Contributions将当前认知维护组合进外部OpenSpec workflow，并 MUST保持external `openspec-*` Skill源可独立升级。OpenSpec planning/apply/sync与Task Development MUST消费current knowledge capability；Task Finish MUST不再解释或收敛knowledge impact。

#### Scenario: Explore 使用可选术语治理
- **WHEN** installed `openspec-explore` consumer可解析`buildr.terminology-governance/v1`
- **THEN** Agent MUST在发现重要术语、别名或作用域冲突时读取selected provider并记录对齐结果
- **AND** provider缺失时consumer MUST保持degraded可用并显式标注未治理术语

#### Scenario: Planning 和实现 consumers 使用 required 当前认知维护
- **WHEN** Buildr声明`openspec-propose`、`openspec-update-change`、`openspec-apply-change`或`openspec-sync-specs` builtin consumers
- **THEN** 每个consumer MUST required依赖`buildr.current-knowledge-maintenance/v1`
- **AND** required provider未ready时consumer MUST按现有capability readiness fail closed

#### Scenario: Task Development使用required当前认知维护
- **WHEN** Buildr声明`task-development` builtin
- **THEN** manifest MUST将`buildr.current-knowledge-maintenance/v2`声明为required dependency
- **AND** Development MUST在stable Content Target与Candidate前消费selected provider的inspect/reconcile result

#### Scenario: Task Finish不再消费当前认知
- **WHEN** Buildr声明P0.5 `task-finish` builtin
- **THEN** manifest MUST不包含current knowledge dependency
- **AND** Finish MUST只消费Development handoff，不得读取Change knowledge impact

#### Scenario: Task Finish 使用 required 当前认知维护
- **WHEN** 旧runtime manifest仍把current knowledge声明为Task Finish required dependency
- **THEN** P0.5 package切换 MUST移除该Finish dependency，并由Task Development required消费`buildr.current-knowledge-maintenance/v2`
- **AND** runtime MUST NOT保留Finish与Development双重knowledge consumer

#### Scenario: Archive 保持纯归档职责
- **WHEN** Buildr声明`openspec-archive-change` builtin
- **THEN** archive consumer MUST NOT为归档后knowledge或glossary写入声明直接dependency
- **AND** archive MUST只移动已完成前置对齐的Change

#### Scenario: OpenSpec Component 更新或卸载
- **WHEN** Buildr更新或卸载OpenSpec Component并重新render runtime
- **THEN** Buildr-owned contributions MUST按Component lifecycle更新或移除
- **AND** external OpenSpec Skill source bytes MUST保持与受支持上游版本一致，binding readiness MUST由manifest/runtime evidence表达

### Requirement: Task Finish Skill 必须收窄为授权与单命令入口
Buildr MUST提供实现`buildr.task-finish/v1`的Task Finish Skill。Skill MUST解析用户交付意图、Task ID与execution context，先通过selected `buildr.task-development@1`确认current handoff，再披露carrier commit/integration/push/retained/cleanup授权与明确排除项。Receipt-bound Task MUST只调用一次canonical `buildr task finish run --task <task-id>`；normal path MUST NOT收敛Change、运行Review/Verification、生成Candidate、领取checkpoint、构造recovery JSON或从普通PATH选择runtime。

#### Scenario: 用户要求收尾
- **WHEN** 用户在canonical Task Environment中明确要求收尾且Development handoff current
- **THEN** Agent MUST披露Task、Candidate/handoff、目标分支、远端、常规副作用与未授权动作
- **AND** 没有待人工语义决定时 MUST只启动一次canonical Task Finish executor并消费最终结果

#### Scenario: Development handoff缺失
- **WHEN** Task Development Application报告missing、blocked或stale
- **THEN** Task Finish Skill MUST停止并路由`task-development`
- **AND** MUST NOT从Change、Git、Review或Verification facts自行拼装finish-ready Candidate

#### Scenario: Retained metadata-only 候选正式 handoff
- **WHEN** 用户在retained canonical Workspace对已完成且已验证的metadata-only任务要求收尾，且任务文件、目标分支和无关改动可精确区分
- **THEN** Task Finish Skill MAY将产品执行器标记不适用并披露精确任务文件/排除项/commit/push影响
- **AND** MUST只把明确Git单项动作交给selected `buildr.git-single-operation/v1` provider

#### Scenario: Retained handoff 无法证明文件隔离
- **WHEN** metadata-only候选的任务文件范围、验证identity、目标ref或Git provider readiness无法证明
- **THEN** Task Finish Skill MUST blocked并报告缺失输入/provider reason
- **AND** MUST NOT使用`git add -A`、stash、回滚、虚假Change或手写Git回退绕过边界

#### Scenario: 产品返回完整结果
- **WHEN** current result为complete
- **THEN** Skill MUST直接报告handoff/carrier/delivery/retained/cleanup与效率证据
- **AND** MUST NOT为确认已完成动作再次调用inspect或同等验证命令

### Requirement: Task Finish workflow 必须把产品缺陷退回研发
Task Finish workflow MUST把current Development handoff作为前置条件。任何内容漂移、产品缺陷、规范语义错误、审查遗漏、测试失败、目标竞争所需rebase或Candidate修复 MUST退出收尾并回到Task Development；Skill MUST NOT把修复、重新Verification、Review或Candidate generation描述为Finish恢复步骤。

#### Scenario: 最终保证发现产品缺陷
- **WHEN** Task Finish result返回`failureClass: upstream-candidate-defect`或`nextWorkflow: task-development`
- **THEN** Agent MUST明确说明current handoff不再finish-ready
- **AND** MUST结束当前Finish run并回到Development重新建立Content Target/gates/Candidate/handoff

#### Scenario: 用户要求在收尾中顺手修复
- **WHEN** 产品缺陷已被Task Finish发现，而用户没有明确要求继续研发修正
- **THEN** Agent MUST NOT在当前Finish run编辑实现或重跑formal Verification
- **AND** MUST请求或使用已有授权进入Development workflow

### Requirement: 任务资产审查不得扩展 Finish 执行器
Task asset review MUST保持独立Skill lifecycle。存在observation且finalize需要人工accept/reject时，Task Development MUST在形成Finish handoff前完成该决定；没有observation或provider确定性discard时 MUST不增加Development/Finish空action。Task Finish product run MUST NOT读取asset observation、隐藏推理或判断长期资产候选。

#### Scenario: 没有任务资产 observation
- **WHEN** Development准备handoff且当前Task没有observation
- **THEN** Development MUST继续既有gate判断
- **AND** MUST NOT创建空observation或asset-review checkpoint

#### Scenario: Observation 等待人工决定
- **WHEN** task-asset-review finalize返回`awaiting-human`
- **THEN** Development MUST在handoff前等待accept/reject
- **AND** 决定完成后才 MAY形成current handoff

### Requirement: 正式持久交付必须经过 Task Environment ready 门槛
Buildr task triage、OpenSpec propose contribution与已知正式执行入口 MUST在首次修改交付物、构建、测试或创建Task-owned持久资源前取得matching `ready` Environment Receipt。采用环境后，planning、实现、Content Target观察、formal Verification与Candidate准备 MUST只发生在receipt允许根。

#### Scenario: Triage 选择 Change Flow
- **WHEN** Task Record已建立且即将创建首份预计进入实现的OpenSpec artifact
- **THEN** Agent MUST先通过Task Environment准备或恢复实际执行位置
- **AND** 只有ready后才 MUST在允许根创建Change artifacts

#### Scenario: 直接命中 OpenSpec propose
- **WHEN** 用户意图直接命中installed `openspec-propose`且任务预计持久交付
- **THEN** contribution MUST在`openspec new change`前核对Task与ready Environment
- **AND** MUST通过`task-environment`而非直接调用Git provider

#### Scenario: Code-only 实现
- **WHEN** 正式Task不需要OpenSpec Change但即将修改、构建或测试
- **THEN** Agent MUST取得同样ready Environment
- **AND** MUST NOT因没有Change而跳过执行根、依赖与资源边界

#### Scenario: 只有 lifecycle metadata 写入
- **WHEN** 已有Task的Environment/Development/Review/Verification/Finish Skill只在canonical Workspace维护自己的receipt/result且不触发新环境效果
- **THEN** workflow MUST NOT为metadata写入重新准备已清理环境
- **AND** MUST保持各专业writer的canonical metadata authority

#### Scenario: Stable Content Target交给Task Verification
- **WHEN** Environment中的内容修改、Change convergence、current knowledge与受管生成资产已达到stable target
- **THEN** Task Development MUST观察完整Content Target并明确verification policy
- **AND** Task Verification MUST只绑定该Content Target、declarations、execution与evidence，不得拥有Candidate/policy/proceed

#### Scenario: Candidate 交给 Task Verification
- **WHEN** 旧consumer尝试把Candidate identity直接交给Task Verification
- **THEN** P0.5 workflow MUST拒绝该顺序，并先由Development观察stable Content Target、记录policy并完成formal Verification
- **AND** Task Verification MUST NOT接收、生成或持久化Candidate identity

### Requirement: 任务 Skills 必须消费新的 Environment capability topology
Buildr package/runtime capability graph MUST让`task-environment`提供`buildr.task-environment/v1`，让`task-worktree`只提供`buildr.git-worktree-provider/v1`，并让`task-development`required消费Environment、让`task-finish`通过Development handoff与Environment cleanup协作。Git provider MAY对无需Git的Environment降级。

#### Scenario: task-triage 进入正式执行
- **WHEN** task-triage已确认formal execution分支
- **THEN** 它 MUST optional消费`buildr.task-environment/v1`并在该分支要求provider ready
- **AND** 纯讨论、只读或Task外分支 MUST不因Environment provider缺失而阻塞

#### Scenario: Task Environment 选择 Git isolation
- **WHEN** receipt plan需要一个或多个Git worktrees
- **THEN** task-environment MUST解析selected `buildr.git-worktree-provider/v1`并只消费其Git evidence
- **AND** provider missing/ambiguous/blocked MUST使prepare blocked

#### Scenario: Task Development取得执行context
- **WHEN** Development观察Content Target或请求formal Verification
- **THEN** MUST通过selected `buildr.task-environment/v1`取得matching scopes/allowed roots
- **AND** MUST NOT依赖Git worktree Skill identity或手写execution roots

#### Scenario: Task Finish 清理环境
- **WHEN** Finish已交付equivalent carrier并进入cleanup
- **THEN** Finish MUST调用selected`buildr.task-environment/v1`交接delivery/cleanup eligibility
- **AND** MUST NOT直接扫描资源或调用Git provider cleanup

#### Scenario: provider 替换
- **WHEN** compatible internal providers替换默认Environment/worktree
- **THEN** consumers MUST按capability identity与binding继续工作
- **AND** MUST NOT根据Skill ID、目录名或旧receipt schema硬编码调用

### Requirement: task-verification Skill 必须作为语义验证入口
Buildr MUST交付`task-verification` Workspace Skill并通过selected `buildr.task-verification/v3` provider工作。Skill MUST理解Task Intent与Development提供的stable Content Target，读取Task scope内Project v2 declarations、选择适用已有能力、取得transient execution evidence、提炼portable facts，并只在完整结论形成后调用Task Verification Application record。

#### Scenario: 用户要求验证正式 Task
- **WHEN** 用户或Task Development提供正式Task、明确stable Content Target identity与policy decision
- **THEN** Agent MUST先inspect existing current Result/declarations
- **AND** stale、missing或policy要求额外能力时 MUST执行适用能力并形成完整replacement

#### Scenario: Development请求formal Verification
- **WHEN** Task Development提供正式Task、明确Content Target identity与policy decision
- **THEN** Agent MUST先inspect existing current Result/declarations
- **AND** stale、missing或policy要求额外能力时 MUST执行适用能力并形成完整replacement

#### Scenario: Finish请求Verification
- **WHEN** Task Finish已经开始消费Development handoff
- **THEN** task-verification MUST不再被Finish路由或调用
- **AND** 任何Verification需求 MUST返回Task Development重新建立stable target

#### Scenario: 普通一次性测试
- **WHEN** 用户只要求运行一条测试且没有正式Task/target identity
- **THEN** Skill MAY执行并报告transient facts
- **AND** MUST NOT创建空Task、伪Content Target或Task Verification Result

### Requirement: P0.4 workflow 不得抢占 Development 或其他专业 authority
`task-verification` MUST NOT创建Candidate/generation、改变Task Record status、决定verification policy或proceed/blocked、接受风险、实现缺失测试、替代Task Review/Environment/业务验收或执行Metadata Publication。P0.5 Task Development MUST独占这些consumer decisions并只通过Verification Application read model消费Result。

#### Scenario: 存在 coverage gap
- **WHEN** 当前Content Target缺少能证明所需事实的capability
- **THEN** Skill MUST将gap写入完整Result或会话报告
- **AND** MUST将“是否继续”留给Task Development，同时不得允许risk绕过not-passed事实

### Requirement: P0.3 不得把两种 Review 变成默认 Task 门禁
Planning与Completion MUST继续是两个可选current Result槽位；Task Record、Environment、Review Application自身 MUST不因缺失而失败。P0.5 Task Development MAY依据Task/Project policy把Planning和Completion设为Candidate/handoff gate，但 MUST只通过Task Review Application applicability判断，MUST不改变Review schema。

#### Scenario: 正式 Task 只有一种 Result
- **WHEN** Task只有Planning Result、只有Completion Result或两者都没有
- **THEN** Task Review/Task Record/Environment read path MUST正常工作
- **AND** Development MUST单独返回missing gate，不写skipped/not-applicable placeholder

#### Scenario: Review method 不满足未来政策
- **WHEN** Result target仍current但policy要求human或independent-agent而现有method为self
- **THEN** Development MUST单独判定gate不满足
- **AND** Task Review MUST NOT把policy mismatch持久化为target stale

## ADDED Requirements

### Requirement: task-development Skill 必须编排P0.5 authority顺序
Buildr MUST交付`task-development` Workspace Skill并提供`buildr.task-development@1`。Skill MUST依次收敛Change/current knowledge/生成资产、建立Planning gate、观察Content Target与policy、调用formal Verification、冻结Candidate、调用Completion Review、形成decision/handoff；它 MUST通过内部Application driver工作且 MUST NOT新增公共CLI或Local App projection。

#### Scenario: Change任务进入Candidate准备
- **WHEN** active Task包含0..N Change且实现已完成
- **THEN** Skill MUST在Content Target观察前完成适用Change sync/archive/current knowledge/runtime fixed point
- **AND** 任一内容mutation发生后 MUST重新观察target，不能复用先前Verification

#### Scenario: 无Change普通Workspace进入Candidate准备
- **WHEN** active Task没有OpenSpec且使用非Git普通Workspace
- **THEN** Skill MUST用同一Development Application完成Content Target、Verification、Candidate、Completion Review与handoff
- **AND** MUST NOT要求Product code、Service code、Git ref、Node/npm或OpenSpec executable

#### Scenario: runtime发现Development
- **WHEN** supported Agent runtime完成Buildr sync/render
- **THEN** runtime MUST发现`task-development` Skill、`buildr.task-development@1` contract与binding
- **AND** MUST不同时投射旧Finish-owned Candidate/Verification路由
