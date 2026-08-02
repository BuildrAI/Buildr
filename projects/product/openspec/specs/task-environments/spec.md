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
Buildr MUST 由共享 Task Environment Application 实现 `prepare`、`inspect`、`resource register`、`resource release` 与 `cleanup`，并 MUST 让 CLI、Skill、Local App、Preview 和 Finish 复用该 Application，而不是复制 receipt reader/writer 或环境判断。公共 CLI MUST 只开放 `buildr task environment prepare|inspect|cleanup <task-id>`；`prepare` MUST 幂等承担首次准备与恢复，资源登记/释放 MUST 只供已知产品 provider 内部调用。

#### Scenario: Agent 准备或恢复环境
- **WHEN** Agent 运行 `buildr task environment prepare <task-id>`
- **THEN** CLI MUST 只把结构化参数交给 Application，并返回当前 `ready / blocked` 结果
- **AND** 已存在 matching Receipt 时 MUST 从同一环境幂等恢复，不得创建第二份环境或要求单独 `restore` 命令

#### Scenario: 人或产品模块只读检查环境
- **WHEN** CLI `inspect`、Local App 或其他产品模块请求当前 Task Environment read model
- **THEN** 调用方 MUST 使用 Application `inspect` 对当前机器做有界只读复核
- **AND** MUST NOT 直接解析 Environment Receipt、Git evidence 或自行形成 ready/cleanup 结论

#### Scenario: 产品模块登记持久资源
- **WHEN** Preview 或其他已登记 provider 创建/释放 Task-owned 持久资源
- **THEN** 产品模块 MUST 直接调用 Application `resource register/release`
- **AND** 根帮助、Task Environment topic help 与公共 command registry MUST NOT 暴露这两个内部 action

#### Scenario: CLI 执行 cleanup
- **WHEN** 调用方运行 `buildr task environment cleanup <task-id>`
- **THEN** Application MUST 要求并验证 Finish handoff 或明确 abandon authorization，再编排已知 providers
- **AND** CLI MUST NOT 接受任意 cleanup shell、完整 Receipt 或 caller-authored next state

### Requirement: Environment Receipt 必须是唯一环境 authority
Buildr MUST 在 `<canonical-workspace>/.buildr/tasks/<task-id>/environment.json` 维护唯一 `buildr.task-environment-receipt/v2` Environment Receipt，并 MUST 由 Task Environment Application 独占写入。Receipt MUST 独占 `ready / blocked`、恢复、执行位置、执行基础、runtime projection identity、Task-owned 动态资源和 cleanup 结果；Git 或其他 provider evidence MUST NOT 竞争这些事实。

#### Scenario: 首次准备环境
- **WHEN** Task Environment 为有效正式 Task 首次执行 `prepare`
- **THEN** Buildr MUST 在任何外部环境 effect 前创建最小 Environment Receipt
- **AND** 后续每个成功或失败步骤 MUST 更新同一份 receipt，而不是创建第二份阶段记录

#### Scenario: Environment Receipt 与 Task Record 共存
- **WHEN** `.buildr/tasks/<task-id>/` 已包含 `task.yml` 或其他专业记录
- **THEN** Environment writer MUST 只创建或替换 `environment.json`
- **AND** MUST NOT 读取后回填、删除、移动或回滚 sibling 文件

#### Scenario: Receipt 进入 Git 候选
- **WHEN** Git status 或 package verification 检查 Workspace 本机环境记录
- **THEN** `/.buildr/tasks/*/environment.json` MUST 被精确忽略
- **AND** Task Record 与其他可移植专业记录 MUST NOT 因该规则被整体忽略

#### Scenario: Receipt 内容边界
- **WHEN** Environment writer 形成或更新 receipt
- **THEN** receipt MUST 只保存恢复、真实探测、资源归属和清理所需的本机事实、identity 与最小诊断
- **AND** MUST NOT 保存 Agent session、任务计划、开发进度、完整验证结果、凭证、任意 cleanup shell、`node_modules` 内容或 runtime 生成文件副本

#### Scenario: 精确写入失败
- **WHEN** 环境结果校验、临时写入或同目录原子替换失败
- **THEN** Buildr MUST 保留原 `environment.json` bytes 与全部 sibling 文件
- **AND** MUST 只清理可证明属于本次失败写入的临时文件

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
Buildr MUST 以 `buildr.git-worktree-provider/v1` 表达 Git worktree provider，并 MUST 让默认 `task-worktree` provider 只拥有 repository plan、checkout、branch、HEAD、remote、clean、worktree registration 和 Git cleanup effects。provider evidence MUST 使用 `buildr.git-worktree-evidence/v1`；它 MUST NOT 判断或保存 Task Environment 的 runtime/CLI/依赖、总 `ready`、恢复、动态资源、Agent session 或总 cleanup 结论。

#### Scenario: 创建默认单仓 worktree
- **WHEN** Task Environment 为 Workspace root 选择 Git worktree provider
- **THEN** provider MUST 在 `.worktrees/<task-id>` 创建或复用 root repository worktree
- **AND** MUST 返回可复核的 repository、checkout、branch、HEAD、clean 与 registration evidence

#### Scenario: 创建显式多 repo worktrees
- **WHEN** Task Environment 提供一个或多个显式 Project/Service selectors
- **THEN** provider MUST 从 canonical registries 与实际 Git boundaries 解析 source path、remote 和 integration branch
- **AND** MUST 将每个 nested worktree 放在环境 checkout 内对应的 canonical `source.path`
- **AND** MUST NOT 自动包含全部 repositories、按 remote URL 猜范围或把独立 repository 合并成共享 index

#### Scenario: repository plan 存在冲突
- **WHEN** selector 无效、remote/branch identity 冲突、目标被父 repository 跟踪、路径越界、已有未知文件或被其他 worktree 占用
- **THEN** provider MUST 在任何 `git worktree add` 前 fail closed
- **AND** MUST 返回失败 selector、声明/实际 identity 与未执行 effects

#### Scenario: 多 repo 创建中途失败
- **WHEN** 完整预检通过后一个 nested worktree 创建失败
- **THEN** provider MUST 保留已成功创建的 checkouts 和分支并返回逐 repository evidence
- **AND** Task Environment MUST 在同一 Environment Receipt 中记录 `blocked`，相同 plan 重试 MUST 幂等复用匹配 checkouts

#### Scenario: provider 被直接检查
- **WHEN** 调用方执行 provider-level worktree inspect
- **THEN** 结果 MUST 只报告当前 Git evidence 和本次 effects
- **AND** MUST NOT 返回或暗示 Environment `ready`、execution binding、runtime projection、依赖或 session adoption

#### Scenario: provider 执行清理
- **WHEN** Task Environment 提供匹配 evidence 的正常交付或明确放弃清理授权
- **THEN** provider MUST 只删除精确 Task-owned worktrees/本地分支/evidence，并保留其他任务和远端 refs
- **AND** identity、ownership 或授权不匹配时 MUST 零删除失败

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
Task Environment MUST 独占 Task 级环境 cleanup 编排和结果。正常完成时，它 MUST 只在 Task Finish 提供每个工作范围的已交付 identity 与清理资格后停止资源、调用 provider cleanup 并解除占用；明确放弃时，它 MAY 在上层已经处置关联 Change/保留事实且 ownership 可证明后清理 Task-owned dirty 资源。Task Environment MUST NOT 执行 commit、merge、push、远端删除、交付判断或 Retrospective。

#### Scenario: 正常完成后清理
- **WHEN** Finish handoff 证明全部工作范围已交付且可清理，资源与 provider evidence 均匹配
- **THEN** Task Environment MUST 按资源依赖顺序停止动态资源，再调用各 scope provider cleanup 并解除共享根占用
- **AND** Environment Receipt MUST 保留 removed/retained resources、provider results 与最终 cleanup status

#### Scenario: Finish 请求清理但资源仍阻塞
- **WHEN** 任一 Preview/process/container 仍运行、provider identity 不匹配、worktree dirty/未集成或其他 Task 仍占用资源
- **THEN** cleanup MUST 返回 `blocked` 并保留所有仍用于恢复的环境内容
- **AND** Finish MUST 只恢复 cleanup，不得重跑 prepare、verify 或 deliver

#### Scenario: 用户明确放弃独占 dirty worktree
- **WHEN** 上层提供明确 abandon authorization，关联 Change/保留事实已处置，且 provider evidence 证明 dirty worktree 全部属于该 Task
- **THEN** Task Environment MAY 请求 provider 删除该 Task-owned checkout、未共享本地分支与资源
- **AND** MUST 记录放弃授权和实际 removed evidence，不要求第二次普通 cleanup 确认

#### Scenario: 放弃共享根但 ownership 不清
- **WHEN** 非 Git/shared execution root 混有来源不明或其他 Task 改动
- **THEN** Task Environment MUST 保留该内容并返回 `blocked` 或明确 retained result
- **AND** MUST NOT 因 Task 已放弃而清空、回滚或删除整个共享根

#### Scenario: 清理其他并行任务
- **WHEN** 同一 Workspace/Git common-dir 还存在其他 Task receipts、worktrees、previews、ports 或 branches
- **THEN** cleanup MUST 只操作当前 Environment Receipt 精确登记且 provider 已证明 ownership 的资源
- **AND** 其他任务的文件、进程、refs、evidence 与 receipts MUST 保持不变

#### Scenario: 清理成功后的最小留痕
- **WHEN** 全部适用资源已删除或按明确决定安全保留
- **THEN** Buildr MUST 在原 `environment.json` 保留 Task/Workspace identity、完成时间、最终 status 与最小处置摘要
- **AND** MUST NOT 删除 Task Record、Development/Review/Verification/Finish Result 或 Retrospective

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
Task Environment mutation MUST 由 canonical retained Workspace 的可信 Environment Manager 执行。当前 manager 若来自 Git checkout，其实际实现输入 `bin/`、`src/`、`package/`、`package.json`、`package-lock.json` MUST 没有 staged、unstaged 或 untracked 变化；clean probe MUST 排除 `.buildr/`。Receipt `controller.identity` MAY 作为创建该 Receipt 的 Buildr 实现指纹或兼容诊断，但 MUST NOT 成为 ready、resource ownership、Verification applicability 或 Task checkout 等价性的匹配门槛，也 MUST NOT 在 retained manager 升级时自动改写为 lifecycle generation。

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

#### Scenario: candidate 只读检查自己的 Environment
- **WHEN** task worktree 中的 candidate Buildr 使用匹配 Task ID 与 canonical Workspace 请求只读 `inspect`
- **THEN** Application MAY 返回当前 Task checkout/provider/foundation/resource probe
- **AND** candidate Buildr MUST NOT 因该读取而创建、恢复、认领、释放或清理自己的 Environment

#### Scenario: Environment Manager 不可信
- **WHEN** mutation 入口来自 candidate linked worktree、Receipt 登记外的 sourceRoot/adapter、dirty Git source 或无法取得可信 Git clean evidence
- **THEN** `prepare`、resource register/release 与 `cleanup` MUST 在对应持久效果前 fail closed
- **AND** MUST 保留原 Receipt、Task checkout、provider evidence 与动态资源
