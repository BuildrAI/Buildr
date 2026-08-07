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

### Requirement: Task Environment Application 必须提供唯一确定性操作边界
Buildr MUST 由共享 Task Environment Application 实现 `prepare`、`inspect`、`resource register`、`resource release` 与 `cleanup`，并 MUST 让 CLI、Skill、Local App、Preview 和 Finish 复用该 Application，而不是复制 Environment current reader/writer 或环境判断。公共 CLI MUST 只开放 `buildr task environment prepare|inspect|cleanup <task-id>`；`prepare` MUST 幂等承担首次准备与恢复，资源登记/释放 MUST 只供已知产品 provider 内部调用。`inspect` MUST 读取 Workspace SQLite 中的 Environment current row，不得在读取时解析 `environment.json`、执行 Environment probe 或回填 lifecycle projection。

#### Scenario: Agent 准备或恢复环境
- **WHEN** Agent 运行 `buildr task environment prepare <task-id>`
- **THEN** CLI MUST 只把结构化参数交给 Application，并返回当前 `ready / blocked` 结果
- **AND** 已存在 matching Environment current row 时 MUST 从同一环境幂等恢复，不得创建第二份环境或要求单独 `restore` 命令

#### Scenario: 人或产品模块只读检查环境
- **WHEN** CLI `inspect`、Local App 或其他产品模块请求当前 Task Environment read model
- **THEN** 调用方 MUST 使用 Application `inspect` 从 `task_environment_current` 读取最近一次正式生命周期动作保存的 current 数据
- **AND** MUST NOT 直接解析 Environment Receipt 文件、Git evidence、自行形成 ready/cleanup 结论或在 GET 中补写 projection

#### Scenario: 产品模块登记持久资源
- **WHEN** Preview 或其他已登记 provider 创建/释放 Task-owned 持久资源
- **THEN** 产品模块 MUST 直接调用 Application `resource register/release`
- **AND** 根帮助、Task Environment topic help 与公共 command registry MUST NOT 暴露这两个内部 action

#### Scenario: CLI 执行 cleanup
- **WHEN** 调用方运行 `buildr task environment cleanup <task-id>`
- **THEN** Application MUST 要求并验证 Finish handoff 或明确 abandon authorization，再编排已知 providers
- **AND** CLI MUST NOT 接受任意 cleanup shell、完整 Receipt 或 caller-authored next state

### Requirement: Environment Receipt 必须是唯一环境 authority
Buildr MUST 在 Workspace SQLite 的 `task_environment_current` 中按 `task_id` 唯一维护经过 Domain 校验的 `buildr.task-environment-receipt/v2` Environment Receipt，并 MUST 由 Task Environment Application 独占写入。该 current row MUST 独占 `ready / blocked`、恢复、执行位置、执行基础、runtime projection identity、Task-owned 动态资源和 cleanup 结果；Git 或其他 provider evidence MUST NOT 竞争这些事实。`.buildr/tasks/<task-id>/environment.json` 不得再作为正常 runtime 的 authority、fallback、双写源或读取输入。

#### Scenario: 首次准备环境
- **WHEN** Task Environment 为有效正式 Task 首次执行 `prepare`
- **THEN** Buildr MUST 在任何外部环境 effect 前以事务创建最小 `task_environment_current` row
- **AND** 后续每个成功或失败步骤 MUST 更新同一 row，而不是创建第二份阶段记录

#### Scenario: Environment Receipt 与 Task Record 共存
- **WHEN** `.buildr/tasks/<task-id>/` 已包含历史 `environment.json` 或其他专业记录
- **THEN** Environment writer MUST 只更新 SQLite current row 与对应 lifecycle projection
- **AND** MUST NOT 在正常 action 中读取、更新、删除、移动或回滚任何 sibling file

#### Scenario: Receipt 进入 Git 候选
- **WHEN** Git status、初始化或 package verification 检查 Workspace 的 `.buildr/tasks/` 目录
- **THEN** 根 `.gitignore` MUST 保持 `/.buildr/tasks/` 整体排除
- **AND** Buildr MUST NOT stage、commit、push或声明 SQLite Environment current row 或历史 Environment file 为 portable owner

#### Scenario: Receipt 内容边界
- **WHEN** Environment writer 形成或更新 current row
- **THEN** receipt payload MUST 只保存恢复、真实探测、资源归属和清理所需的本机事实、identity 与最小诊断
- **AND** MUST NOT 保存 Agent session、任务计划、开发进度、完整验证结果、凭证、任意 cleanup shell、`node_modules` 内容或 runtime 生成文件副本

#### Scenario: 精确写入失败
- **WHEN** Environment 结果校验、SQLite transaction、migration 或 writer provenance 检查失败
- **THEN** Buildr MUST rollback 当前 Environment mutation 并保留最后一份有效 current row
- **AND** MUST 保留历史 `environment.json` bytes，不得用失败输入覆盖或删除它

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

### Requirement: Environment prepare 必须确定性准备并真实探测执行基础
Task Environment MUST 从 canonical Workspace、Project、Service 与现有 runtime/command authority 解析准备计划，并 MUST 依次准备执行位置、适用 Runtime、Workspace CLI、依赖和 workspace-scoped runtime projection。`ready` MUST 来自实际执行根的最小真实 probe；事实缺失、冲突或任一 required scope 未通过时 MUST 返回 `blocked`，不得让 Agent 按惯例猜测安装或修复动作。

#### Scenario: 全部执行基础通过
- **WHEN** 每个 required scope 的执行根/provider identity、Runtime、CLI、lockfile/依赖和 projection probe 均成功
- **THEN** Task Environment MUST 写入 `ready`、最新 facts fingerprint 与明确 execution binding
- **AND** result MUST 返回实际 workdir、允许执行根、稳定 controller 与执行 CLI identity

#### Scenario: 准备中途失败
- **WHEN** checkout、Runtime、CLI、依赖或 projection 的任一步失败
- **THEN** Task Environment MUST 保留已创建且可归属的资源并写入 `blocked`、失败步骤和 next action
- **AND** 后续 `prepare` MUST 从同一 receipt 幂等恢复或清理，不得创建平行环境

#### Scenario: Buildr 自举 Node 依赖缺失
- **WHEN** 自举 task checkout 含受支持的 Node lockfile，但自己的 `node_modules` 或候选 CLI probe 未就绪
- **THEN** stable controller MUST 使用 receipt 绑定的 Workspace Node/npm 在该 checkout 的 lockfile 目录确定性执行 `npm ci`
- **AND** MUST NOT 复用、链接或复制 retained/peer checkout 的 `node_modules`；package manager 下载缓存 MAY 共享

#### Scenario: lockfile 与依赖仍匹配
- **WHEN** restore 发现 Runtime、lockfile identity、依赖 probe 与候选 CLI probe 均仍匹配 receipt
- **THEN** Task Environment MUST 复用现有依赖结果而不重复安装
- **AND** MUST 更新最新探测时间而不伪造新的 preparation effect

#### Scenario: 不支持的依赖准备
- **WHEN** 当前 authority 无法确定某个 required scope 的 Runtime、package manager、lockfile 或受支持 preparation adapter
- **THEN** Task Environment MUST 返回 `blocked` 并指出缺失的权威事实/adapter
- **AND** MUST NOT 从文件名以外的惯例拼装或执行任意安装命令

#### Scenario: 自举 stable controller
- **WHEN** Buildr 在自己的 task worktree 中开发候选 Task Environment、CLI 或 runtime
- **THEN** 环境的 prepare/restore/resource/cleanup MUST 由 retained Workspace Foundation 的稳定 controller 执行
- **AND** worktree 内候选 CLI MUST 只作为 Development/Verification 对象，不得创建、认领或清理自己的 Environment Receipt

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

### Requirement: Environment restore 必须按 Task ID 串行复核真实事实
Task Environment MUST 通过 canonical Task ID 恢复同一份 Environment Receipt，并 MUST 重新探测执行根、provider、Runtime/CLI、依赖、projection 与动态资源。恢复 MUST NOT 按 cwd、branch、相同 HEAD 或 Agent session 猜测 ownership；第一版 MUST 按同一 Task 单一 active writer 处理，发现可见并发或漂移时 fail closed。

#### Scenario: 新 Agent session 恢复 active Task
- **WHEN** Task Manager 已按 Task ID 恢复 active Task 顶层事实，随后请求 Environment restore
- **THEN** Task Environment MUST 定位 canonical `environment.json` 并返回同一环境 identity
- **AND** MUST 在返回 `ready` 前重新执行最小真实 probe

#### Scenario: 从 task worktree 内恢复
- **WHEN** 请求 cwd 位于已登记 worktree，但调用方提供匹配 Task ID 和 canonical Workspace
- **THEN** Environment MUST 通过 receipt/provider evidence 核对 membership 后返回执行 binding
- **AND** MUST NOT 把 cwd 或分支名本身当作 ownership 证明

#### Scenario: receipt 与实际环境漂移
- **WHEN** execution root、provider checkout、Runtime/CLI、lockfile/依赖、projection 或资源事实不再匹配
- **THEN** Environment MUST 返回 `blocked`、精确差异和可确定的恢复/清理动作
- **AND** MUST NOT 静默改写 plan、创建第二份 checkout 或沿用旧 `ready`

#### Scenario: 同一 Task 出现其他 writer 效果
- **WHEN** Agent 观察到 receipt/资源已不同于其读取依据，或同一 Task 正由其他 writer 推进
- **THEN** 当前 Environment mutation MUST 停止并返回 `blocked`
- **AND** MUST NOT 自动 merge、覆盖或宣称锁/CAS/租约保证

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
- **THEN** Buildr MUST在原`environment.json`保留Task/Workspace identity、完成时间、最终status与最小处置摘要
- **AND** MUST NOT删除Task Record、Development/Review/Verification/Finish Result或Retrospective

### Requirement: P0.2 必须原子切换旧 environment authority
P0.2 MUST 在同一 Change 中交付新的 Task Environment authority、窄 Git provider、一次性旧数据迁移和全部 consumer/routing 切换，并 MUST 删除 `buildr.task-worktree-lifecycle@1/@2`、旧 worktree environment writer、session adoption 与其他竞争 `ready / restore / cleanup` 的 mutation path。旧 v1 读取 MUST 与正常 routing 隔离、只服务于一次性迁移，MUST NOT 写回 v1、形成双写/双路由或保留 permanent legacy inspect/cleanup adapter。

#### Scenario: 迁移真实活跃旧环境
- **WHEN** 正式 Task Record 存在、旧 v1 receipt 与实际 registered worktree 的 Task/Workspace/repository/branch/path identity 全部匹配，且没有冲突 v2 receipt
- **THEN** retained stable controller MUST 写入新的 Environment Receipt 和 Git provider evidence，并重新探测真实基础
- **AND** 只在新记录成功复核后才 MUST 删除对应旧 receipt/adoption state

#### Scenario: 旧 receipt 含 session/runtime 总结
- **WHEN** v1 receipt 包含 adoption、session evidence、runtime expectation 或旧 `ready` 结论
- **THEN** migrator MUST 只复制能从当前实际环境重新证明的 provider/基础 identity
- **AND** MUST NOT 把旧 session evidence 或总 `ready` 结论直接写入 v2 Environment Receipt

#### Scenario: 活跃 worktree 没有正式 Task
- **WHEN** 旧 v1 receipt 对应 identity-matching live worktree，但没有正式 Task Record
- **THEN** migrator MUST 只生成或复核窄 Git provider evidence，MUST NOT 创建 Task 或 v2 Environment Receipt
- **AND** evidence 成功复核后 MUST 删除旧 environment receipt，使该 worktree 只剩 Git provider 事实

#### Scenario: 陈旧 receipt 没有真实资源
- **WHEN** 旧 v1 receipt 对应的 worktree、持久资源与其他可证明 ownership 事实均已不存在
- **THEN** migrator MUST 在记录无资源 evidence 后删除旧 receipt
- **AND** MUST NOT 创建 Task、v2 Environment Receipt、Git checkout 或永久兼容状态

#### Scenario: 旧数据 identity 冲突
- **WHEN** 旧 receipt、Task、Workspace、repository、branch、path 或 live resource ownership 任一冲突或无法确定
- **THEN** Buildr MUST 原样保留旧 bytes 与真实资源，并阻止该 Workspace 宣告 P0.2 authority 生效
- **AND** MUST 返回精确冲突和人工解决 next action，不得回退到旧 writer/routing

#### Scenario: canonical routing 检查
- **WHEN** package、doctor、runtime 与 help verification 检查 P0.2 候选
- **THEN** `task-environment` MUST 是 `buildr.task-environment/v1` selected provider，`task-worktree` MUST 只提供 `buildr.git-worktree-provider/v1`
- **AND** MUST 不存在旧 contract binding、直接 consumer edge、`worktree context/adopt`、environment-shaped worktree JSON/help、第二个 Environment writer 或正常 routing 可达的 legacy adapter

#### Scenario: 根层旧 contract 与 binding 退休
- **WHEN** canonical `sync` 发现根层仍有 `buildr.task-worktree-lifecycle@1/@2` contract、binding 或文件
- **THEN** package replacement MUST 先核对 capability/version、provider、目标路径和文件 integrity，再在同一 source mutation 中删除全部匹配旧资产
- **AND** 任一 identity 或文件漂移 MUST 在首次退休 mutation 前阻断，保留旧 manifest 与文件，不得只删一部分

### Requirement: Task checkout/provider evidence 必须是 Environment 的源码版本基础
Task Environment MUST 以 Receipt scopes、实际 execution roots 与适用 provider evidence 表达 Task 的源码版本基础。对于 Git task checkout，start point、branch、HEAD、checkout/registration/clean evidence MUST 决定该 Task 当前源码位置；retained Workspace 或 retained Buildr 的后续前进 MUST NOT 自动更新、失效或重写该基础。

#### Scenario: retained Workspace 从 M1 前进到 M2
- **WHEN** Environment Receipt 登记的 Task checkout 仍位于 M1，而 canonical retained Workspace 与 Buildr 已正常前进到 M2
- **THEN** `inspect` 与 `prepare` MUST 继续描述并探测 M1 Task checkout 的 provider、Runtime/CLI、依赖、projection 与资源事实
- **AND** MUST NOT 仅因 retained controller content identity 不同而报告 Environment broken、改写 lifecycle generation 或使 Review/Verification evidence 失效

#### Scenario: Task 尚未选择吸收 M2
- **WHEN** 用户、Task Development 或 Finish 尚未明确执行更新 Task checkout 的 Git 操作
- **THEN** Task Environment MUST NOT fetch、rebase、merge、reset 或自动同步 Task 源码
- **AND** MUST 保留原 start point、branch、HEAD 与 execution root evidence

#### Scenario: Task 显式更新到 M2
- **WHEN** Task Development/Finish 通过显式 Git 操作改变 Task checkout 或 Candidate identity
- **THEN** Task Environment MUST 在下一次 `prepare`/`inspect` 中按新的 checkout、provider、CLI、依赖、projection 与资源事实重新判断 ready
- **AND** Review/Verification MUST 按新的 Candidate/target identity独立判断 evidence applicability

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
- **WHEN** 安装版 Local App 或其他只读产品消费者以 canonical Workspace 与 matching Task ID 调用 `inspect`，且其 product sourceRoot/adapter 不同于 Receipt controller
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

### Requirement: 自举 Task Validation Workspace 必须隔离候选 Structured Store
自举 Task Environment MUST 为 candidate runtime 的 migration、CLI、HTTP 和 Local App 验证提供 receipt-bound Task Validation Workspace 与独立 Workspace Structured Store。候选验证产生的 schema、ledger、Task 和测试数据 MUST 只存在于该验证边界；真实 Task lifecycle metadata MUST 继续由 receipt-pinned retained controller 写入 canonical Workspace。Environment cleanup 或 abandon MUST 只回收精确 Task-owned validation resources。

#### Scenario: candidate 验证 Task 功能
- **WHEN** candidate Buildr 在其 Task Validation Workspace 中创建 Task、运行 migration 或执行本地 smoke 测试
- **THEN** candidate MUST 使用验证 Workspace 的独立 Structured Store
- **AND** canonical Task Record、Development、Review、Verification、Retrospective、Environment 与 Finish state MUST 不受候选测试数据影响

#### Scenario: candidate Local App 启动 smoke
- **WHEN** Task Environment 为候选 Local App 启动验证服务
- **THEN** 服务 MUST 绑定 Task Validation Workspace，并将端口/进程作为 Task-owned resource 登记
- **AND** retained Local App MUST 继续绑定 canonical Workspace，且两者不得共享数据 store identity

#### Scenario: 清理 validation Workspace
- **WHEN** self-bootstrap Task 正常 cleanup 或按明确 abandon authorization cleanup
- **THEN** Environment MUST 只删除可证明属于该 Task Validation Workspace 的 store、sidecar 与服务资源
- **AND** MUST NOT 对 canonical Workspace database 执行 schema rollback、ledger rewrite 或数据删除

### Requirement: 真实 Task 写入必须使用 receipt-pinned retained controller
在 self-bootstrap topology 中，任何会改变 canonical Task lifecycle/structured data 的操作 MUST 使用 matching Environment Receipt 绑定的 retained controller executable 与 identity；调用方 MUST NOT 从候选 worktree cwd、shell PATH 或 candidate CLI 推断写入 authority。

#### Scenario: worktree 中请求真实 Task 更新
- **WHEN** Agent 或候选测试上下文需要创建、更新或记录 canonical Task lifecycle facts
- **THEN** dispatch MUST 调用 receipt-pinned retained controller
- **AND** candidate runtime MUST 只作为被测对象或 validation Workspace writer，不得成为 canonical writer

### Requirement: Environment current store 必须支持一次性受控迁移
Buildr MUST 通过连续 SQLite migration 建立 `task_environment_current`，并 MUST 提供由 retained controller 执行的一次性受控 importer，将合法 v2 `environment.json` 导入对应 Task current row。导入完成后新 runtime MUST 不读取、更新、删除或双写旧文件；迁移冲突、损坏、identity 不匹配或 ownership 不明时 MUST fail closed。没有 matching Task Record 的历史文件 MUST 标记为 inert legacy，不导入、不删除且不阻塞其他合法 Task 的导入。

#### Scenario: 合法旧 receipt 导入
- **WHEN** 旧 `environment.json` 是普通文件，Task Record 存在，receipt schema、Task ID 和 Workspace root 全部匹配
- **THEN** importer MUST 在单一 SQLite transaction 中写入 normalized current row并记录 migration effect
- **AND** 后续 `inspect`、`prepare`、resource action 与 `cleanup` MUST 只使用 SQLite current row

#### Scenario: 旧 receipt 导入冲突
- **WHEN** 旧文件不是普通文件、JSON/schema 无效或 identity/ownership 无法证明
- **THEN** importer MUST 保留原文件与已有 SQLite 数据并返回稳定 blocked diagnostic
- **AND** MUST NOT 删除、覆盖、双写或让旧文件继续作为正常 runtime fallback

#### Scenario: 孤立旧 receipt 保持 inert
- **WHEN** 旧文件没有 matching Task Record
- **THEN** importer MUST 将其标记为 inert legacy，不导入或删除，也不得阻塞其他合法 Task 的导入

#### Scenario: Candidate importer 与 retained store
- **WHEN** candidate runtime 在 Task Validation Workspace 验证 importer 或 migration
- **THEN** candidate MUST 只写自己的 validation store
- **AND** MUST NOT 导入、修改或删除 retained canonical Workspace 的 Environment current row 或历史文件
