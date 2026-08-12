## MODIFIED Requirements

### Requirement: Task Environment Application 必须提供唯一确定性操作边界
Buildr MUST 由共享 Task Environment Application 实现 `prepare`、live `inspect`、saved-current read、`resource register`、`resource release` 与 `cleanup`，并 MUST 让 CLI、Skill、Local App、Preview 和 Finish 复用对应 Application action，而不是复制 Environment current reader/writer 或环境判断。公共 CLI MUST 只开放 `buildr task environment prepare|inspect|cleanup <task-id>`；`prepare` MUST 幂等承担首次准备与恢复，资源登记/释放 MUST 只供已知产品 provider内部调用。live `inspect` MUST只读观察matching current对应的当前机器dependency facts；saved-current read MUST只读取Workspace SQLite current，不执行Environment probe或回填projection。

#### Scenario: Agent 准备或恢复环境
- **WHEN** Agent运行`buildr task environment prepare <task-id>`
- **THEN** CLI MUST只把结构化参数交给Application，并返回当前`ready / blocked`结果
- **AND** 已存在matching Environment current row时 MUST从同一环境幂等恢复，不得创建第二份环境或要求单独`restore`命令

#### Scenario: CLI只读检查环境
- **WHEN** CLI `inspect`请求当前Task Environment
- **THEN** Application MUST读取current并只读观察当前dependency declaration、manifest、lockfile、prepared identity与node_modules事实
- **AND** MUST不写Receipt、执行npm、创建目录、启动/停止资源或执行cleanup

#### Scenario: Local App读取保存事实
- **WHEN** Local App GET或其他saved-current consumer请求Environment read model
- **THEN** 调用方 MUST通过Application saved-current read读取最近一次正式生命周期动作保存的数据
- **AND** MUST不直接解析Receipt文件、Git evidence、探测文件系统、形成新的ready结论或在GET中写入

#### Scenario: 人或产品模块只读检查环境
- **WHEN** CLI `inspect`、Local App或其他产品模块请求当前Task Environment read model
- **THEN** CLI `inspect` MUST通过Application执行零写入live observation，Local App和其他saved-current consumer MUST通过Application只读SQLite current
- **AND** 任一读取方 MUST不直接解析Environment Receipt文件、手写ready/cleanup结论或在GET中补写projection

#### Scenario: 产品模块登记持久资源
- **WHEN** Preview或其他已登记provider创建/释放Task-owned持久资源
- **THEN** 产品模块 MUST直接调用Application `resource register/release`
- **AND** 根帮助、Task Environment topic help与公共command registry MUST NOT暴露这两个内部action

#### Scenario: CLI 执行 cleanup
- **WHEN** 调用方运行`buildr task environment cleanup <task-id>`
- **THEN** Application MUST要求并验证Finish handoff或明确abandon authorization，再编排已知providers
- **AND** CLI MUST NOT接受任意cleanup shell、完整Receipt或caller-authored next state

### Requirement: Environment Receipt 必须是唯一环境 authority
Buildr MUST 在Workspace SQLite的`task_environment_current`中按`task_id`唯一维护经过Domain校验的`buildr.task-environment-receipt/v3` Environment Receipt，并 MUST由Task Environment Application独占写入。该current row MUST独占`ready / blocked`、恢复、执行位置、Runtime/CLI/projection、逐dependency-root current facts、scope聚合、Task-owned动态资源和cleanup结果；Git或其他provider evidence MUST NOT竞争这些事实。旧Receipt v2 MUST只兼容读取，并且active v2不得在需要多root声明时继续作为live ready证据；`.buildr/tasks/<task-id>/environment.json`不得成为authority、fallback、双写源或读取输入。

#### Scenario: 首次准备环境
- **WHEN** Task Environment为有效正式Task首次执行`prepare`
- **THEN** Buildr MUST在任何外部环境effect前以事务创建最小`task_environment_current` row
- **AND** 后续每个成功或失败步骤 MUST更新同一row，而不是创建第二份阶段记录

#### Scenario: Receipt保存dependency roots
- **WHEN** Environment writer形成或更新v3 current
- **THEN** payload MUST逐root保存owner scope/Service、root、manager、manifest、lockfile、current/prepared identities、required、status、observedAt与最小diagnostic
- **AND** scope `dependencies` MUST只保存同一root facts形成的聚合probe，不复制root对象

#### Scenario: v2 active Receipt被读取
- **WHEN** current row仍是v2且当前声明要求一个或多个无法由旧单probe证明的root
- **THEN** live inspect MUST返回blocked legacy diagnostic且零写入
- **AND** 只有显式prepare MAY观察、恢复并原子写入v3

#### Scenario: Environment Receipt 与 Task Record 共存
- **WHEN** `.buildr/tasks/<task-id>/`已包含历史`environment.json`或其他专业记录
- **THEN** Environment writer MUST只更新SQLite current row
- **AND** MUST NOT在正常action中读取、更新、删除、移动或回滚任何sibling file

#### Scenario: Receipt 进入 Git 候选
- **WHEN** Git status、初始化或package verification检查Workspace的`.buildr/tasks/`目录
- **THEN** 根`.gitignore` MUST保持`/.buildr/tasks/`整体排除
- **AND** Buildr MUST NOT stage、commit、push或声明SQLite Environment current row或历史Environment file为portable owner

#### Scenario: Receipt 内容边界
- **WHEN** Environment writer形成或更新current row
- **THEN** receipt payload MUST只保存恢复、真实探测、资源归属和清理所需的本机事实、identity与最小诊断
- **AND** MUST NOT保存Agent session、任务计划、完整验证结果、凭证、任意cleanup shell、`node_modules`内容、完整命令输出或“本次安装”临时标志

#### Scenario: 精确写入失败
- **WHEN** Environment结果校验、SQLite transaction、migration或writer provenance检查失败
- **THEN** Buildr MUST rollback当前Environment mutation并保留最后一份有效current row
- **AND** MUST保留历史`environment.json` bytes，不得用失败输入覆盖或删除它

### Requirement: Environment prepare 必须确定性准备并真实探测执行基础
Task Environment MUST从canonical Workspace、Project、Service、Task scope、Project Task Environment dependency declaration与现有runtime/command authority解析准备计划，并 MUST依次准备执行位置、适用Runtime、Workspace CLI、逐dependency-root依赖和workspace-scoped runtime projection。每个npm root MUST使用自己的manifest、lockfile、worktree-local`node_modules`与Workspace Foundation绝对npm executable；`ready` MUST来自实际执行根的最小真实probe，任一required root或scope未通过时 MUST返回blocked。

#### Scenario: 全部执行基础通过
- **WHEN** 每个required scope的执行根/provider identity、Runtime、CLI、已声明dependency roots和projection probe均成功
- **THEN** Task Environment MUST写入`ready`、最新facts fingerprint与明确execution binding
- **AND** result MUST返回实际workdir、允许执行根、稳定controller、执行CLI identity与dependency-root facts

#### Scenario: 准备中途失败
- **WHEN** checkout、Runtime、CLI、任一required dependency root或projection的准备失败
- **THEN** Task Environment MUST保留已创建且可归属的资源并写入`blocked`、失败步骤和next action
- **AND** 后续`prepare` MUST从同一receipt幂等恢复或清理，不得创建平行环境

#### Scenario: Buildr 自举 Node 依赖缺失
- **WHEN** 自举task checkout的Buildr dependency root含受支持Node lockfile，但其worktree-local `node_modules`或candidate CLI probe未就绪
- **THEN** stable controller MUST使用receipt绑定的Workspace Node/npm在该声明root确定性执行`npm ci`
- **AND** MUST NOT复用、链接或复制retained/peer checkout的`node_modules`；package manager下载缓存 MAY共享

#### Scenario: lockfile 与依赖仍匹配
- **WHEN** prepare/restore发现每个required root的manifest、lockfile prepared identity、依赖probe与candidate CLI probe仍匹配receipt
- **THEN** Task Environment MUST复用现有依赖结果而不重复安装
- **AND** MUST更新最新探测时间而不伪造新的preparation effect

#### Scenario: 两个required roots首次准备
- **WHEN** fresh task worktree中的`buildr`与`buildr-web` root均没有`node_modules`
- **THEN** prepare MUST分别在两个声明root执行`npm ci`并返回两个可归因effects
- **AND** 只有两个root及其他required foundations全部ready后Environment才能ready

#### Scenario: 部分依赖缺失
- **WHEN** 保存事实证明`buildr` root identities仍匹配但`buildr-web/node_modules`缺失
- **THEN** live inspect MUST只读返回blocked并指出`service:product/buildr-web`
- **AND** 后续prepare MUST只对`buildr-web`执行安装

#### Scenario: lockfile或manifest漂移
- **WHEN** 任一root当前manifest/lockfile identity与prepared identity不同
- **THEN** live inspect MUST零写入返回blocked drift diagnostic
- **AND** prepare MUST只重新安装漂移root并保存新的prepared identities

#### Scenario: 所有root仍匹配
- **WHEN** 每个required root的manifest、lockfile、prepared identities与本地node_modules均匹配
- **THEN** prepare MUST复用root且不重复执行npm ci
- **AND** result MUST不伪造dependency-root-prepared effect

#### Scenario: npm ci失败
- **WHEN** 某required root的npm ci退出非零
- **THEN** Receipt与result MUST保留该root、退出诊断和恢复next action，并把Environment整体标记blocked
- **AND** 其他root的成功事实 MUST保留但不得冒充整体成功

#### Scenario: 不支持的依赖准备
- **WHEN** 当前声明要求不受支持manager或authority无法确定root/manifest/lockfile
- **THEN** Task Environment MUST返回blocked并指出缺失authority/adapter
- **AND** MUST NOT扫描文件系统、使用ambient PATH编译器或拼装任意安装命令

#### Scenario: 自举 stable controller
- **WHEN** Buildr在自己的task worktree中开发候选Task Environment、CLI或runtime
- **THEN** Environment mutation MUST由retained Workspace Foundation的稳定controller执行
- **AND** worktree候选CLI MUST只作为Development/Verification对象，不得创建、认领或清理自己的Environment Receipt

### Requirement: Environment restore 必须按 Task ID 串行复核真实事实
Task Environment MUST通过canonical Task ID从Workspace SQLite恢复同一份Environment Receipt，并 MUST重新探测执行根、provider、Runtime/CLI、声明式dependency roots、projection与动态资源。恢复 MUST NOT按cwd、branch、相同HEAD、Agent session或旧文件猜测ownership；第一版 MUST按同一Task单一active writer处理，发现可见并发或漂移时fail closed。

#### Scenario: 新 Agent session 恢复 active Task
- **WHEN** Task Manager已按Task ID恢复active Task顶层事实，随后请求Environment restore
- **THEN** Task Environment MUST定位`task_environment_current`并返回同一环境identity
- **AND** MUST在返回ready前重新执行最小真实probe

#### Scenario: 从 task worktree 内恢复
- **WHEN** 请求cwd位于已登记worktree，但调用方提供匹配Task ID和canonical Workspace
- **THEN** Environment MUST通过SQLite Receipt与provider evidence核对membership后返回执行binding
- **AND** MUST NOT把cwd或分支名本身当作ownership证明

#### Scenario: receipt 与实际环境漂移
- **WHEN** execution root、provider checkout、Runtime/CLI、声明式dependency roots、projection或资源事实不再匹配
- **THEN** Environment MUST返回`blocked`、精确差异和可确定的恢复/清理动作
- **AND** live inspect MUST保持零写入，prepare MUST只恢复可归因的漂移根，二者均 MUST NOT创建第二份checkout或沿用旧`ready`

#### Scenario: receipt与dependency root漂移
- **WHEN**声明plan、dependency root路径、manifest/lockfile identity或node_modules不再匹配保存事实
- **THEN** live inspect MUST返回blocked、精确root差异和prepare恢复动作
- **AND** MUST NOT写入Receipt、静默改plan、创建第二份checkout或沿用旧ready

#### Scenario: prepare恢复dependency root漂移
- **WHEN**调用方在matching active Environment上重新执行prepare
- **THEN**Application MUST只准备缺失或漂移的required roots并更新同一current row
- **AND** MUST保留其他current root、provider与resource ownership事实

#### Scenario: 同一 Task 出现其他 writer 效果
- **WHEN** Agent观察到receipt/resource已不同于其读取依据，或同一Task正由其他writer推进
- **THEN** 当前Environment mutation MUST停止并返回blocked
- **AND** MUST NOT自动merge、覆盖或宣称锁/CAS/租约保证
