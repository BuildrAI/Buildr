# task-environments Specification

## Purpose
定义 Buildr 如何以 canonical task environment 隔离单仓与多仓任务的源码、运行上下文、验证身份和安全清理边界。
## Requirements

### Requirement: 正式 Task 必须先取得 ready Task Environment
Buildr MUST 只为已经存在的正式 Task 建立任务环境（Task Environment），并 MUST 在该 Task 首次修改交付物、构建、测试或创建 Task-owned 持久资源前返回真实 `ready` 的环境结果。Task Environment MUST NOT 把环境事实写入 Task Record，也 MUST NOT 成为 Task 外单次操作的强制入口。

#### Scenario: 正式 Task 首次进入持久交付
- **WHEN** active Task 即将修改交付物、执行构建/测试或启动持久资源
- **THEN** Agent MUST 先通过 selected `buildr.task-environment/v1` provider 准备或恢复环境
- **AND** 环境未返回 `ready` 时 MUST NOT 开始对应持久效果

#### Scenario: Task Record 不存在
- **WHEN** 调用方请求为未知 Task ID 创建 Environment Receipt
- **THEN** Task Environment MUST 返回 `blocked` 和创建/恢复 Task Record 的 next action
- **AND** MUST NOT 创建 checkout、依赖、runtime projection、资源或 Environment Receipt

#### Scenario: Task 外有界操作
- **WHEN** Agent 只执行单次测试、临时服务、API 调用或其他不形成正式 Task 的有界操作
- **THEN** Task Environment MUST NOT 自动创建 Task 或 Environment Receipt
- **AND** Agent MUST 按当前用户意图在本次操作中停止或披露临时资源

#### Scenario: 清理后维护 Task 元数据
- **WHEN** Task Environment 已完成清理，而生命周期 Skill 仍需在 canonical Workspace 写入 Receipt、Result 或复盘材料
- **THEN** 该 metadata-only 写入 MUST NOT 要求重新准备已清理的 Task Environment
- **AND** MUST NOT 把 canonical metadata root 误报为新的执行环境

### Requirement: Task Environment 必须记录实际执行位置而非固定 mode
Task Environment MUST 记录每个工作范围的实际执行根、任务验证工作区根、共享/占用和 cleanup 事实，并 MUST NOT 用 `in-place / dedicated` 等顶层 mode 代替真实资源。Git MUST NOT 是 Environment Receipt 或 `ready` 的前提；需要 Git 隔离时才 MUST 调用所选 Git worktree provider。

#### Scenario: 使用共享执行根
- **WHEN** 有效工作范围不使用 Git worktree 或其他独占 provider
- **THEN** Environment Receipt MUST 登记实际共享执行根、Task scope、占用和清理责任，但 MUST NOT 在没有 provider evidence 时声称掌握精确文件归属或可自动回滚源码
- **AND** 同一共享执行根 MUST NOT 同时被两个范围重叠的修改型 Task 占用

#### Scenario: 使用 task worktree
- **WHEN** Git 工作范围需要隔离且 selected provider 成功准备 `.worktrees/<task-id>`
- **THEN** Receipt MAY 将该目录同时登记为 checkout、执行根和任务验证工作区根
- **AND** Buildr MUST 明确该目录不是主 Workspace、retained Workspace、Agent runtime 或“开发 Workspace”

#### Scenario: 非 Git Workspace
- **WHEN** canonical Workspace 或某个工作范围没有 Git boundary
- **THEN** Task Environment MUST 仍能登记和探测该范围的实际执行根
- **AND** MUST 如实说明缺少 worktree 物理隔离与 Git 历史恢复能力

#### Scenario: 共享执行根存在冲突占用或来源不明改动
- **WHEN** prepare/restore 发现另一个 active Environment 的范围重叠，或 cleanup 无法通过 provider evidence 证明共享源码改动归属
- **THEN** 重叠占用 MUST 返回 `blocked`；cleanup MUST 保留共享源码并返回明确 retained result，只解除当前 Task 的 Environment 占用
- **AND** MUST NOT 接管、暂存、覆盖、回滚或扩大清理范围

### Requirement: Git worktree provider 必须只返回窄 Git evidence
Buildr MUST以`buildr.git-worktree-provider/v1`表达Git worktree provider，并 MUST让默认`task-worktree` provider只拥有repository plan、checkout、branch、HEAD、remote、clean、worktree registration、由Task Environment提交的确定性integrated evidence与Git cleanup effects。provider evidence MUST使用`buildr.git-worktree-evidence/v1`；它 MUST NOT判断或保存Task Environment的runtime/CLI/依赖、总`ready`、恢复、动态资源、Agent session或总cleanup结论。正常交付的integrated evidence MAY是Task branch对delivery ref的ancestor，也 MAY是Finish提供且provider能独立复算的Task Contribution equivalence；两者都 MUST绑定精确Task checkout/source snapshot、baseline、carrier与target ref，不能由调用方claimed outcome替代。

#### Scenario: 创建默认单仓 worktree
- **WHEN** Task Environment为Workspace root选择Git worktree provider
- **THEN** provider MUST在`.worktrees/<task-id>`创建或复用root repository worktree
- **AND** MUST返回可复核的repository、checkout、branch、HEAD、clean与registration evidence

#### Scenario: 创建显式多 repo worktrees
- **WHEN** Task Environment提供一个或多个显式Project/Service selectors
- **THEN** provider MUST从canonical registries与实际Git boundaries解析source path、remote和integration branch
- **AND** MUST将每个nested worktree放在环境checkout内对应的canonical `source.path`
- **AND** MUST NOT自动包含全部repositories、按remote URL猜范围或把独立repository合并成共享index

#### Scenario: repository plan 存在冲突
- **WHEN** selector无效、remote/branch identity冲突、目标被父repository跟踪、路径越界、已有未知文件或被其他worktree占用
- **THEN** provider MUST在任何`git worktree add`前fail closed
- **AND** MUST返回失败selector、声明/实际identity与未执行effects

#### Scenario: 多 repo 创建中途失败
- **WHEN** 完整预检通过后一个nested worktree创建失败
- **THEN** provider MUST保留已成功创建的checkouts和分支并返回逐repository evidence
- **AND** Task Environment MUST在同一Environment Receipt中记录`blocked`，相同plan重试 MUST幂等复用匹配checkouts

#### Scenario: provider 被直接检查
- **WHEN** 调用方执行provider-level worktree inspect
- **THEN** 结果 MUST只报告当前Git evidence和本次effects
- **AND** MUST NOT返回或暗示Environment `ready`、execution binding、runtime projection、依赖或session adoption

#### Scenario: ancestor关系证明正常集成
- **WHEN** Task Environment提供matching evidence、delivery ref包含Task branch HEAD且worktree没有source drift
- **THEN** provider MUST按现有ancestor integrated evidence执行精确cleanup
- **AND** MUST保留其他任务与远端refs

#### Scenario: 等价任务贡献证明正常集成
- **WHEN** Task branch因隔离carrier re-application不是delivery ref祖先，但Task Environment提供source snapshot、原任务基线、Delivery Baseline、carrier/target ref与Task Contribution identity
- **THEN** provider MUST从当前Task worktree与Git objects独立复算原/应用后delta identities，并只在完全相等且target等于carrier时视为integrated
- **AND** MUST NOT修改Task worktree/branch、使用路径无重叠推断语义安全或信任caller claimed equivalence

#### Scenario: provider 执行清理
- **WHEN** Task Environment提供匹配evidence的正常交付或明确放弃清理授权
- **THEN** provider MUST只删除精确Task-owned worktrees/本地分支/evidence，并保留其他任务和远端refs
- **AND** identity、ownership、贡献等价或授权不匹配时 MUST零删除失败

### Requirement: Task Validation Workspace 必须隔离候选 runtime 投射
Task Environment MUST 允许候选 Rule、Skill、contract、CLI 和 runtime 只投射到 receipt 绑定的任务验证工作区（Task Validation Workspace），并 MUST 在写入前阻止候选 source 更新 retained Workspace、另一个 task worktree 或验证根之外的共享用户 runtime。Environment Receipt MUST 记录 runtime source/projection identity 与 projection probe，但 MUST NOT 保存或声称真实 Agent session adoption evidence。

#### Scenario: 候选投射自身任务验证工作区
- **WHEN** Buildr 自举候选从 task checkout 向同一 receipt 登记的验证工作区执行 sync/render
- **THEN** 产品 MUST 允许 workspace-scoped runtime 和验证根内隔离模拟 user destination
- **AND** Environment Receipt MUST 更新 source/projection identity 与 projection ready 事实

#### Scenario: 候选尝试更新 retained runtime
- **WHEN** candidate source 把 retained Workspace、peer task worktree 或验证根外共享 user runtime 作为投射目标
- **THEN** 产品 MUST 在任何写入前 fail closed
- **AND** MUST 报告 candidate source、允许验证根与越界 target

#### Scenario: projection 已就绪但 session 未证明
- **WHEN** runtime 文件与 projection identity 已通过检查，但没有真实 Agent host/session evidence
- **THEN** Environment `ready` MAY 保持有效并报告 session consumption unknown/not-applicable
- **AND** MUST NOT 创建 adoption receipt、要求普通 workflow 新开 session 或把 projection 冒充为实际采用

#### Scenario: 专项验收需要 Agent session
- **WHEN** 变更影响 Agent runtime discovery/loading/activation 且 P0.4 验收明确要求 session proof
- **THEN** Task Environment MUST 只向 Task Verification 提供 environment/source/projection identity
- **AND** 实际 session evidence 与结论 MUST 由 Verification Result 持有，不得写回 Environment Receipt

### Requirement: Task-owned 持久资源必须立即登记并由 provider 清理
正式 Task 中会跨有界操作持续存在、需要最终清理或影响并发的 Preview、dev server、端口、容器、临时数据库等资源 MUST 在创建成功后立即通过 Task Environment 登记。资源条目与 provider owner MUST 绑定 Task ID、canonical Workspace、Environment root、resource ID、工作范围、已知 provider、provider identity、非敏感 cleanup handle 与真实 probe；MUST NOT 使用 retained Buildr controller content identity 作为 ownership 条件，Receipt MUST NOT 接受任意 cleanup 命令。

#### Scenario: 成功启动持久资源
- **WHEN** 已登记 provider 启动一个健康的 Task-owned 持久资源
- **THEN** 创建者 MUST 在报告 start 成功前调用 Environment `resource register`
- **AND** receipt MUST 返回可核验的 resource identity、owner、scope、provider 和 cleanup responsibility

#### Scenario: 资源登记失败
- **WHEN** 资源已经创建但 Environment Receipt 更新失败、owner 不匹配或 scope 不允许
- **THEN** 创建者 MUST 立即调用原 provider 停止/释放刚创建的资源并证明回收
- **AND** MUST NOT 向调用方报告资源已由 Task Environment 管理

#### Scenario: retained Buildr 升级后停止已有 Preview
- **WHEN** Preview owner 与 Receipt resource 的 Task、Workspace、Environment root、resource ID、provider identity/handle 全部匹配，但当前 retained Buildr content identity 已变化
- **THEN** provider MUST 允许已授权的 probe、stop 与 cleanup继续按 resource ownership 执行
- **AND** MUST NOT 因旧 owner 中缺少或包含不同 `controllerIdentity` 而拒绝、接管或改写资源

#### Scenario: 一次性命令正常结束
- **WHEN** 构建、测试或其他有界进程已经正常结束且不留下持久资源
- **THEN** Task Environment MUST NOT 为该进程创建动态资源条目
- **AND** Verification evidence MUST 继续由 Task Verification 自己维护

#### Scenario: cleanup handle 请求任意命令
- **WHEN** 调用方尝试把 shell 文本、凭证或未知 provider 写入 resource cleanup 字段
- **THEN** Environment writer MUST 拒绝整个 mutation 并保持原 receipt
- **AND** MUST 只允许产品已登记 provider 的结构化 identity/handle

### Requirement: Task Environment 必须统一编排安全 cleanup
Task Environment MUST独占Task级环境cleanup编排和结果。正常完成时，它 MUST只在Task Finish提供每个工作范围的已交付identity与清理资格后停止资源、调用provider cleanup并解除占用；对于隔离Delivery Carrier，Environment MUST把bounded Task Contribution proof交给Git provider复核，而不是要求Finish改写原Task branch以制造ancestor关系。明确放弃时，它 MAY在上层已经处置关联Change/保留事实且ownership可证明后清理Task-owned dirty资源。Task Environment MUST NOT执行commit、merge、push、远端删除、语义交付判断或Retrospective。

#### Scenario: 正常完成后清理
- **WHEN** Finish handoff证明全部工作范围已交付且可清理，资源与provider evidence均匹配
- **THEN** Task Environment MUST按资源依赖顺序停止动态资源，再调用各scope provider cleanup并解除共享根占用
- **AND** Environment Receipt MUST保留removed/retained resources、provider results与最终cleanup status

#### Scenario: 隔离carrier交付后清理原Task worktree
- **WHEN** Finish提供可独立复算的Task Contribution proof，target ref等于carrier，且当前Task source snapshot未漂移
- **THEN** Environment MUST允许Git provider以该等价proof确认integrated并清理原Task worktree/branch
- **AND** MUST不要求原Task branch成为target祖先或修改Candidate generation

#### Scenario: Finish 请求清理但资源仍阻塞
- **WHEN** 任一Preview/process/container仍运行、provider identity不匹配、worktree source drift、integrated/contribution proof不成立或其他Task仍占用资源
- **THEN** cleanup MUST返回`blocked`并保留所有仍用于恢复的环境与carrier内容
- **AND** Finish MUST只恢复cleanup，不得重跑prepare、verify或deliver

#### Scenario: 用户明确放弃独占 dirty worktree
- **WHEN** 上层提供明确abandon authorization，关联Change/保留事实已处置，且provider evidence证明dirty worktree全部属于该Task
- **THEN** Task Environment MAY请求provider删除该Task-owned checkout、未共享本地分支与资源
- **AND** MUST记录放弃授权和实际removed evidence，不要求第二次普通cleanup确认

#### Scenario: 放弃共享根但 ownership 不清
- **WHEN** 非Git/shared execution root混有来源不明或其他Task改动
- **THEN** Task Environment MUST保留该内容并返回`blocked`或明确retained result
- **AND** MUST NOT因Task已放弃而清空、回滚或删除整个共享根

#### Scenario: 清理其他并行任务
- **WHEN** 同一Workspace/Git common-dir还存在其他Task receipts、worktrees、previews、ports或branches
- **THEN** cleanup MUST只操作当前Environment Receipt精确登记且provider已证明ownership的资源
- **AND** 其他任务的文件、进程、refs、evidence与receipts MUST保持不变

#### Scenario: 清理成功后的最小留痕
- **WHEN** 全部适用资源已删除或按明确决定安全保留
- **THEN** Buildr MUST在 `task_environment_current` 保留Task/Workspace identity、完成时间、最终status与最小处置摘要
- **AND** MUST NOT删除Task Record、Development/Review/Verification/Finish Result或Retrospective

### Requirement: Task checkout/provider evidence 必须是 Environment 的源码版本基础
Task Environment MUST以Receipt scopes、actual execution roots和provider evidence表达Task源码版本基础。retained Workspace后续前进 MUST不自动更新或重写Task checkout；`prepare/inspect` MUST按该checkout中的current Plan inputs、outputs、CLI、projection和资源事实判断ready。

#### Scenario: retained Workspace 从 M1 前进到 M2
- **WHEN** Task checkout仍在M1而retained Workspace前进到M2
- **THEN** Environment MUST继续观察M1的provider和Preparation facts
- **AND** MUST不因controller content identity不同自动使Plan、Review或Verification失效

#### Scenario: Task 尚未选择吸收 M2
- **WHEN** 没有显式Git operation改变Task checkout
- **THEN** Task Environment MUST不fetch、rebase、merge、reset或同步源码
- **AND** MUST保留原start point、HEAD与execution roots

#### Scenario: Task 显式更新到 M2
- **WHEN** 显式Git operation改变Task checkout
- **THEN** 下一次prepare/inspect MUST按新checkout的Plan inputs、outputs、CLI和projection重新判断ready
- **AND** Review/Verification MUST独立判断其target applicability

### Requirement: Retained Environment Manager 必须可信但不得成为源码版本 authority
Task Environment mutation MUST 由 canonical retained Workspace 的可信 Environment Manager 执行。当前 manager 若来自 Git checkout，其实际实现输入 `bin/`、`src/`、`package/`、`package.json`、`package-lock.json` MUST 没有 staged、unstaged 或 untracked 变化；clean probe MUST 排除 `.buildr/`。只读 `inspect` 在已从 canonical Task persistence 取得 matching Environment Receipt 后，MUST 使用 Receipt 登记的 controller 对当前机器执行既有 provider、foundation 与 resource probe，而 MUST NOT 要求只读调用方的 product sourceRoot/adapter 成为 Environment Manager。Receipt `controller.identity` MAY 作为创建该 Receipt 的 Buildr 实现指纹或兼容诊断，但 MUST NOT 成为 ready、resource ownership、Verification applicability 或 Task checkout 等价性的匹配门槛，也 MUST NOT 在 retained manager 升级时自动改写为 lifecycle generation。

#### Scenario: 首次 prepare 遇到 dirty Git manager
- **WHEN** Git-backed retained manager 的任一实现输入存在 staged、unstaged 或 untracked 变化，且 Task 尚无 Environment Receipt
- **THEN** `prepare` MUST 返回 blocked manager-dirty diagnostic 与空 effects
- **AND** MUST NOT 创建或更新 Environment Receipt、worktree/provider evidence、依赖或 runtime projection

#### Scenario: 只有 `.buildr/` lifecycle metadata 变化
- **WHEN** retained manager 的实现输入 Git clean，但 canonical Workspace 的 `.buildr/tasks/**` 或其他 `.buildr/` 内容发生变化
- **THEN** manager clean probe 与创建指纹计算 MUST 保持不受影响
- **AND** Environment 操作 MAY 继续执行其既有 authorization 与真实 probe

#### Scenario: Receipt 创建后的 manager content identity 改变
- **WHEN** 当前 clean retained manager 的 sourceRoot/adapter 仍可信，但 content identity 与 Receipt 创建指纹不同
- **THEN** `inspect`、`prepare`、resource mutation 与已授权 `cleanup` MUST NOT 因该差异阻断或自动更新 `controller.identity`
- **AND** result MUST NOT 返回 controller handoff、rebind 或 generation-transition effect

#### Scenario: 非 manager 的安装版读取 matching Environment
- **WHEN** 安装版 Buildr Web 或其他只读产品消费者以 canonical Workspace 与 matching Task ID 调用 `inspect`，且其 product sourceRoot/adapter 不同于 Receipt controller
- **THEN** Application MUST 仅使用 Receipt controller 对已登记 Environment 执行当前机器的有界只读 probe，并按 probe 返回 ready 或 blocked read model
- **AND** MUST NOT 因调用方不是 retained manager 而拒绝读取、写入/更新 Receipt，或授予任何 mutation authorization

#### Scenario: candidate 只读检查自己的 Environment
- **WHEN** task worktree 中的 candidate Buildr 使用匹配 Task ID 与 canonical Workspace 请求只读 `inspect`
- **THEN** Application MAY 返回当前 Task checkout/provider/foundation/resource probe
- **AND** candidate Buildr MUST NOT 因该读取而创建、恢复、认领、释放或清理自己的 Environment

#### Scenario: Environment Manager 不可信
- **WHEN** mutation 入口来自 candidate linked worktree、Receipt 登记外的 sourceRoot/adapter、dirty Git source 或无法取得可信 Git clean evidence
- **THEN** `prepare`、resource register/release 与 `cleanup` MUST 在对应持久效果前 fail closed
- **AND** MUST 保留原 Receipt、Task checkout、provider evidence 与动态资源

### Requirement: 真实 Task 写入必须使用 receipt-pinned retained controller
在 self-bootstrap topology 中，任何会改变 canonical Task lifecycle/structured data 的操作 MUST 使用 matching Environment Receipt 绑定的 retained controller executable 与 identity；调用方 MUST NOT 从候选 worktree cwd、shell PATH 或 candidate CLI 推断写入 authority。

#### Scenario: worktree 中请求真实 Task 更新
- **WHEN** Agent 或候选测试上下文需要创建、更新或记录 canonical Task lifecycle facts
- **THEN** dispatch MUST 调用 receipt-pinned retained controller
- **AND** candidate runtime MUST 只作为被测对象或 validation Workspace writer，不得成为 canonical writer

### Requirement: Task Finish SQLite completion 必须与 Environment cleanup 幂等交接
Task Environment MUST继续独占Task级资源cleanup；Task Finish MUST在调用Environment cleanup前，将已交付scope identities、carrier/contribution proof与`cleanup_pending` checkpoint持久化到Workspace SQLite。Environment cleanup成功后，Finish MUST以Environment Receipt的current identity恢复并完成自身transient cleanup与terminal transaction，MUST NOT让Environment写Finish表或让Finish直接删除Environment-owned资源。

#### Scenario: cleanup 前进程退出
- **WHEN** Finish已经持久化`cleanup_pending`但尚未调用Environment provider
- **THEN** resume MUST复用同一delivery evidence并调用Task Environment cleanup
- **AND** MUST NOT重跑prepare、verify、deliver或重新push

#### Scenario: Environment cleanup blocked
- **WHEN** Environment因资源运行、identity漂移、ownership不明或其他Task占用而返回blocked
- **THEN** Finish MUST保留SQLite current run、精确Environment next action与恢复所需transient data
- **AND** terminal completion与Task Record completed MUST均不得成立

#### Scenario: Environment 已 cleaned 后进程退出
- **WHEN** Environment Receipt已证明同一Task/run cleanup成功，但Finish尚未清理自己的transient data或提交terminal Result
- **THEN** resume MUST复用Environment结果并只继续Finish-owned剩余动作
- **AND** Environment MUST NOT再次停止资源或调用provider cleanup

#### Scenario: Finish terminal transaction 完成
- **WHEN** Environment cleanup与Finish-owned transient cleanup均成功，且receipt/run identity匹配
- **THEN** Finish MUST提交compact completion并完成Task Record terminal transition
- **AND** Environment Receipt最小留痕 MUST继续存在，不得被Finish SQLite retention删除

### Requirement: Environment Receipt 必须以 Plan 事实作为唯一环境 authority
Buildr MUST在Workspace SQLite `task_environment_current`中按`task_id`唯一维护经过Domain校验的`buildr.task-environment-receipt/v4`。同一current row MUST独占Plan、逐Service/Step current与prepared facts、scope聚合、`ready / blocked`、执行位置、Runtime/CLI/projection、动态资源、恢复和cleanup；Git/provider evidence与Task Record MUST不竞争这些事实。旧Receipt v2/v3 MUST只兼容读取并在active状态要求显式Agent Plan升级。

#### Scenario: 首次准备环境
- **WHEN** 有效Task首次执行prepare
- **THEN** Buildr MUST在外部Environment effect前创建最小current row
- **AND** 后续成功或失败步骤 MUST更新同一row

#### Scenario: Receipt 保存 Plan 和逐步事实
- **WHEN** writer形成v4 current
- **THEN** payload MUST保存规范化Plan/identity、逐Service聚合和逐Step resolved executable、input/output current/prepared facts、required、status、observedAt与最小diagnostic
- **AND** scope `preparation` MUST只保存同一Step facts的聚合probe

#### Scenario: v2 或 v3 active Receipt 被读取
- **WHEN** current仍是legacy schema且没有Agent登记的v1 Plan
- **THEN** live inspect MUST零写入返回blocked legacy diagnostic
- **AND** 只有Plan record或携带Plan的prepare MAY原子升级v4，不得从npm roots自动合成Plan

#### Scenario: Environment Receipt 与 Task Record 共存
- **WHEN** Workspace还存在历史Environment files或其他专业记录
- **THEN** Environment writer MUST只更新SQLite current row
- **AND** MUST不在正常action中读取、更新、删除、移动或回滚任何sibling file

#### Scenario: Receipt 进入 Git 候选
- **WHEN** Git status、初始化或package verification检查Workspace本地Task目录
- **THEN** SQLite current与历史Environment files MUST保持本机排除
- **AND** Buildr MUST不stage、commit、push或声明它们为portable owner

#### Scenario: Receipt 内容边界
- **WHEN** writer形成或更新current
- **THEN** payload MUST只保存环境恢复、真实探测、资源归属和cleanup所需的本机事实
- **AND** MUST不保存Agent session、通用Task计划、Verification Result、凭证、任意shell/env、完整输出或一次性执行标志

#### Scenario: 精确写入失败
- **WHEN** Domain校验、SQLite事务或writer provenance失败
- **THEN** Buildr MUST rollback当前mutation并保留最后一份有效current
- **AND** MUST不修改Task Record或legacy files

### Requirement: Environment prepare 必须按 Agent Plan 确定性准备并真实探测执行基础
Task Environment MUST从canonical Task scope、matching current、Agent登记的Preparation Plan和现有runtime/command authority准备execution roots、Runtime、逐Preparation Step、Workspace CLI与runtime projection。核心 MUST不根据package manager类型选择行为；`ready` MUST来自全部required scope、Service和Step的当前真实facts。

#### Scenario: 全部执行基础通过
- **WHEN** provider/Runtime、每个required Step输出、CLI与projection均ready
- **THEN** Environment MUST写入ready并返回实际execution binding、Plan identity及逐Service/Step facts
- **AND** MUST不返回dependency-root或package-manager专用事实

#### Scenario: 两个 Service 首次准备
- **WHEN** Agent Plan为两个Task-scoped Service分别声明required steps且fresh worktree尚无outputs
- **THEN** prepare MUST按Plan顺序分别执行并返回两个可归因`preparation-step-executed` effects
- **AND** 只有两个Service和其他required foundations均ready后Environment才能ready

#### Scenario: 部分输出缺失
- **WHEN** 一个Service Step identities仍匹配但另一个required Step output缺失
- **THEN** live inspect MUST零写入返回blocked并指出Service/Step
- **AND** 后续prepare MUST只重跑缺失Step

#### Scenario: executable 或 input 漂移
- **WHEN** 当前executable/input identity与prepared identity不同
- **THEN** inspect MUST返回drifted且不执行命令
- **AND** prepare MUST只重跑对应Step并保存新prepared identities

#### Scenario: 所有 Step 仍匹配
- **WHEN** Plan、executable/input prepared identities和outputs全部匹配
- **THEN** prepare MUST复用结果且不重复执行命令
- **AND** MUST不伪造`preparation-step-executed` effect

#### Scenario: required Step 失败
- **WHEN** 某required command退出非零、超时或执行后output不满足声明
- **THEN** Receipt与result MUST保存具体Service/Step、退出或output诊断并使Environment blocked
- **AND** 其他Step成功事实 MUST保留但不得冒充整体成功

#### Scenario: 自举 stable controller
- **WHEN** Buildr在自己的Task worktree中开发候选Task Environment
- **THEN** Environment mutation MUST由retained稳定controller执行Agent Plan
- **AND** candidate CLI MUST不认领或清理自己的Environment

### Requirement: Environment 恢复必须按 Task ID 串行复核 Plan 与真实事实
Task Environment MUST通过canonical Task ID从Workspace SQLite恢复同一Receipt，并 MUST重新探测execution roots、provider、Runtime/CLI、current Plan、Preparation Steps、projection与动态资源。恢复 MUST不按cwd、branch、相同HEAD、Agent session或Project技术栈文件猜测ownership；同一Task保持单一active writer。

#### Scenario: 新 Agent session 恢复 active Task
- **WHEN** Agent按Task ID恢复active Task后请求prepare或inspect
- **THEN** Environment MUST定位同一current与Plan identity
- **AND** MUST在返回ready前重新观察required facts

#### Scenario: 从 task worktree 内恢复
- **WHEN** 请求cwd位于已登记worktree且调用方提供matching Task ID与canonical Workspace
- **THEN** Environment MUST通过SQLite Receipt与provider evidence核对membership
- **AND** MUST不把cwd或branch本身当作ownership证明

#### Scenario: receipt 与实际环境漂移
- **WHEN** execution root、provider、Plan、executable/input、output、projection或资源不再匹配
- **THEN** inspect MUST零写入返回blocked与精确差异
- **AND** prepare MUST只恢复可归因Step，不得创建第二份checkout或沿用旧ready

#### Scenario: Plan 被替换
- **WHEN** Agent record新的Plan identity
- **THEN** Application MUST使旧Step results失效并保留同一current row
- **AND** MUST等待后续prepare执行新Plan

#### Scenario: prepare 恢复 Step 漂移
- **WHEN** 调用方在matching active Environment上重新执行prepare
- **THEN** Application MUST只执行缺失或漂移的required Steps并更新同一current row
- **AND** MUST保留其他current Step、provider与resource ownership事实

#### Scenario: 同一 Task 出现其他 writer 效果
- **WHEN** current已不同于mutation读取依据
- **THEN** mutation MUST停止并返回blocked
- **AND** MUST不自动merge、覆盖或宣称锁/CAS/租约保证

### Requirement: Environment Receipt必须审计Declaration到Step事实
新Task Environment writer MUST保存closed `buildr.task-environment-receipt/v5`，并在同一Receipt中表达Preparation Declaration、Task scope、Recipe、Step及其聚合状态。每个required Declaration、Recipe与Step均ready时Environment才 MUST返回ready；任一missing、drifted或failed MUST使整体blocked。

#### Scenario: 两个依赖根均fresh
- **WHEN** Product Task worktree中`buildr`与`buildr-web`准备outputs均不存在
- **THEN** prepare MUST分别执行两个Recipe Step并保存两个effect
- **AND** 全部成功后Receipt MUST返回ready

#### Scenario: 只有buildr-web缺失
- **WHEN** `buildr` Step仍current而`buildr-web` output缺失
- **THEN** inspect MUST只读报告对应Recipe/Step missing且不创建目录
- **AND** prepare MUST只执行`buildr-web` Step

#### Scenario: 声明或输入漂移
- **WHEN** Preparation Declaration、Recipe、executable或Step input identity与prepared identity不同
- **THEN** inspect MUST只读返回blocked/stale diagnostic
- **AND** prepare MUST只在current Plan来源重新确认后恢复受影响Step

#### Scenario: Step失败
- **WHEN** required Recipe Step以非零状态退出
- **THEN** Environment MUST整体blocked并保留其他成功事实
- **AND** diagnostic MUST包含scope、Recipe、Step、退出信息与next action

### Requirement: 旧Plan与Receipt只读兼容
Task Environment reader MUST能够只读展示`buildr.task-environment-plan/v1`与Receipt v4为legacy；新prepare writer MUST只生成Plan v2与Receipt v5，且 MUST不从旧Step推断Declaration或Recipe identity。

#### Scenario: v4 current请求prepare
- **WHEN** current只有legacy v4且调用方未提交Selection Request
- **THEN** prepare MUST返回blocked并要求显式选择Recipe或task-inline Plan
- **AND** MUST保留旧current值，不自动升级

### Requirement: Task Environment Application 必须为 Buildr Web 提供唯一确定性操作边界
Buildr MUST由共享Task Environment Application实现Plan `record/inspect`、Environment `prepare`、live `inspect`、saved-current read、`resource register/release`与`cleanup`，并 MUST让CLI、Skill、Buildr Web、Preview和Finish复用对应Application action。`prepare` MUST幂等承担首次准备与恢复；live `inspect` MUST只读观察matching current的Plan、executable/input identity和output facts；saved-current read MUST只读取Workspace SQLite current。

#### Scenario: Agent 准备或恢复环境
- **WHEN** Agent运行`buildr task environment prepare <task-id>`并可选提供Plan
- **THEN** CLI MUST只把结构化参数交给Application并返回当前`ready / blocked`结果
- **AND** 已有matching current时 MUST从同一环境恢复，不得创建第二份环境或单独restore命令

#### Scenario: CLI只读检查环境
- **WHEN** CLI `inspect`请求当前Task Environment
- **THEN** Application MUST只读比较current Plan、resolved executable/input identities和expected outputs
- **AND** MUST不写Receipt、执行Plan command、创建目录、启动/停止资源或cleanup

#### Scenario: Buildr Web读取保存事实
- **WHEN** Buildr Web GET请求Environment read model
- **THEN** Application MUST只读取最近一次正式lifecycle action保存的SQLite current
- **AND** MUST不探测文件系统、执行Plan或形成新的ready结论

#### Scenario: 人或产品模块只读检查环境
- **WHEN** CLI `inspect`、Buildr Web或其他产品模块请求当前Task Environment read model
- **THEN** CLI `inspect` MUST执行零写入live observation，其他saved-current consumer MUST只读取SQLite current
- **AND** 任一读取方 MUST不直接解析Receipt文件、手写ready/cleanup结论或在GET中补写projection

#### Scenario: 产品模块登记持久资源
- **WHEN** 已登记provider创建或释放Task-owned持久资源
- **THEN** 产品模块 MUST直接调用Application `resource register/release`
- **AND** 公共CLI MUST不暴露这两个内部action

#### Scenario: CLI 执行 cleanup
- **WHEN** 调用方运行`cleanup`
- **THEN** Application MUST验证Finish handoff或明确abandon authorization再编排providers
- **AND** CLI MUST不接受任意cleanup shell、完整Receipt或caller-authored next state

### Requirement: 自举 Task Validation Workspace 必须隔离候选 Buildr Web Structured Store
自举 Task Environment MUST 为 candidate runtime 的 migration、CLI、HTTP 和 Buildr Web 验证提供 receipt-bound Task Validation Workspace 与独立 Workspace Structured Store。候选验证产生的 schema、ledger、Task 和测试数据 MUST 只存在于该验证边界；真实 Task lifecycle metadata MUST 继续由 receipt-pinned retained controller 写入 canonical Workspace。Environment cleanup 或 abandon MUST 只回收精确 Task-owned validation resources。

#### Scenario: candidate 验证 Task 功能
- **WHEN** candidate Buildr 在其 Task Validation Workspace 中创建 Task、运行 migration 或执行本地 smoke 测试
- **THEN** candidate MUST 使用验证 Workspace 的独立 Structured Store
- **AND** canonical Task Record、Development、Review、Verification、Retrospective、Environment 与 Finish state MUST 不受候选测试数据影响

#### Scenario: candidate Buildr Web 启动 smoke
- **WHEN** Task Environment 为候选 Buildr Web 启动验证服务
- **THEN** 服务 MUST 绑定 Task Validation Workspace，并将端口/进程作为 Task-owned resource 登记
- **AND** retained Buildr Web MUST 继续绑定 canonical Workspace，且两者不得共享数据 store identity

#### Scenario: 清理 validation Workspace
- **WHEN** self-bootstrap Task 正常 cleanup 或按明确 abandon authorization cleanup
- **THEN** Environment MUST 只删除可证明属于该 Task Validation Workspace 的 store、sidecar 与服务资源
- **AND** MUST NOT 对 canonical Workspace database 执行 schema rollback、ledger rewrite 或数据删除

### Requirement: inspect 与 Buildr Web saved GET 必须保持不同只读语义
CLI Environment `inspect` MUST只读观察saved Plan绑定的声明、Recipe、executable、inputs与outputs；Buildr Web GET MUST只读取SQLite current。两者 MUST不执行Step、不创建或修复outputs、不替换Plan或Receipt。

#### Scenario: Buildr Web刷新Environment Tab
- **WHEN** 用户刷新Environment Tab
- **THEN** 页面 MUST展示最近保存的Declaration、Recipe、scope与Step状态
- **AND** GET MUST不打开Project声明或文件系统形成新结论
