# Buildr 任务生命周期架构讨论稿

> Roadmap 草稿，不代表当前产品事实或已批准方案。本文同时作为初步的额外交付跟踪文档；只有已经实现、验证、集成并投射到 retained runtime 的内容才标记为“已交付并生效”。

## 核心原则

> 人负责表达意图并保有最终决策权；Agent 负责理解、判断和研发；Buildr 提供宽而薄的流程支持、确定性边界与证据。能够稳定固化的记录动作、校验、状态转换和路由约束应进入产品功能，不依赖 Agent 每次重新推理。

## 阅读约定

本文保留稳定英文标识，面向人的说明优先使用中文。下表只解释本 Roadmap 的目标术语，不代表这些能力已经实现，也不提前替换当前规范术语表（canonical glossary）或规范（specs）：

| 中文名称 | 稳定英文标识 | 本文含义 |
|---|---|---|
| 正式任务 | Task | 准备产生持久交付变更并完成闭环的执行单元 |
| 任务记录 | Task Record | 任务身份、意图、业务范围、Change 引用和顶层结果的最小事实来源；当前保存在 Workspace Structured Store |
| 任务管理器 | Task Manager / `task-manager` | Agent 创建、读取、更新和结束 Task Record 的薄 Skill；不管理任务环境或专业阶段 |
| 任务记录应用 | Task Record Application | Task Record 的唯一产品 writer；同时服务 Task Manager/CLI 与 Local App |
| 任务环境 / 环境回执 | Task Environment / Environment Receipt | 可执行、可核验、可清理的任务环境及其本机控制记录 |
| 保留工作区 Buildr 环境管理器 | Retained Buildr Environment Manager | 从 canonical retained Workspace 提供受信 Buildr 执行入口，管理 Task Environment；现有 `controller` 只是内部字段名，不是产品实体 |
| 任务研发 / 研发回执 | Task Development / Development Receipt | 从环境就绪到形成不可变研发交接的唯一研发编排事实 |
| 内容目标 | Content Target | 实现与契约收敛后供 Formal Verification 绑定的稳定内容身份；排除控制 metadata 与 carrier identity |
| 任务候选 / 候选代次 | Task Candidate / generation | Verification 完成后由 Development 冻结的交付身份，以及顺序递增的交接代次 |
| 研发交接 | Development Handoff | Task Development 保存的不可变快照；绑定当前 Candidate、Change 处置、门禁、推进决定与风险接受，供 Task Finish 消费 |
| 任务审查 / 审查结果 | Task Review / Review Result | 对方案和完成候选的专业审查及轻量证据 |
| 任务验证 / 验证结果 | Task Verification / Verification Result | 现有验证能力声明、transient execution、Task-scoped current 事实结果与派生适用性；不拥有推进决定 |
| 交付载体 | Delivery Carrier | 承载 Candidate 相同内容的 commit/tree 或非 Git 持久位置；不改变 Content Target/Candidate identity |
| 任务收尾 | Task Finish | 消费当前研发交接，完成内容等价载体交付、retained 激活与环境清理；不拥有研发事实 |
| 父任务 / 子任务 | Parent Task / Child Task | Task Record 内的直接协调层级；一个 Task 至多一个 Parent，可有多个直接 Children |
| 协调任务 | Coordinating Task | 通过 Parent/Child 组织直接子 Task 的普通 Task；没有独立状态机或自动传播 |
| 结构化任务看板 | Structured Task Board | 仅作为后续评估方向；只有 Parent/Child 无法覆盖真实协调需求时才考虑独立 Domain |
| 任务复盘 | Task Retrospective | 任务终态后的非阻塞复盘和未来改进候选 |
| 工作区本地数据存储 | Workspace Local Data Store / `.buildr/` | Workspace File Store 与本机 SQLite Workspace Structured Store 的总边界；源码 clean、发布和本地数据分别处理 |
| 交付目标前进 | Target Advancement | Candidate 交付期间目标分支或目标位置出现了更新；不是 Task Environment 自动更新事件 |
| 生命周期权威 | lifecycle authority | 对某类生命周期事实拥有唯一写入和最终解释责任的模块 |
| OpenSpec 变更 | OpenSpec Change | 可选的正式需求和契约变更承载，不是任务身份 |

## 系统与任务主线

```mermaid
flowchart TB
    W["Workspace Foundation<br/>长期共享基础"]
    T["Task Triage<br/>按需"]
    S["task-manager Skill<br/>Agent 入口"]
    L["Local App<br/>人的 Task 入口"]
    M["Task Record Application<br/>Task Record"]
    E["Task Environment<br/>首次 ready 门槛"]
    D["Task Development"]
    F["Task Finish"]
    X["Task 终态<br/>complete / abandon"]

    T -. "确认正式持久交付" .-> S
    S --> M
    L --> M
    M -->|"稳定 Task ID"| E
    E -->|"ready；首个正式研发动作"| D
    D -. "扩展环境" .-> E
    D -->|"不可变研发交接"| F
    F -. "upstream Candidate defect" .-> D
    D -. "明确放弃" .-> E
    F -. "交付后请求清理" .-> E
    D -->|"环境已处置"| X
    F -->|"交付与环境处置完成"| X
    X -. "产品化终态动作" .-> M

    W -. "支撑" .-> T
    W -. "支撑" .-> M
    W -. "支撑" .-> E
    W -. "支撑" .-> D
    W -. "支撑" .-> F

    R["Task Review<br/>Planning / Completion"] <--> D
    V["Task Verification"] <--> D
    F -. "执行具体 Git Operation" .-> G["Git Operations<br/>Git 行为约定"]
    G -. "Git evidence" .-> F
    A["Task Retrospective"] -. "读取 Task ID 与各模块事实" .-> X
    P["Coordinating Task<br/>Parent / Children"] <--> M
```

主线图表示会形成持久交付变更和 Candidate 的正式 Task。Task Record Application 只维护 Task Record；`task-manager`/CLI 只接收 Task Record 内容，Local App 则在同一 Task 详情中组合各模块的只读投影。当前一级视图固定为“概览、研发、证据、环境”：研发调用 Task Development reader，证据连续展示 Review 与 Verification，环境调用 Task Environment reader；这些专业内容都不写入 Task Record。已经创建 Task、但在产生交付变更前确认无需修改时，可以直接 `complete --no-change`，不虚构专业记录。

## 系统基础

| 模块 | 核心目的 | 状态 |
|---|---|---|
| Workspace Foundation | 为人和 Agent 提供跨任务共享的工作基础 | 已确认 |

## 任务主线模块

| 模块 | 核心目的 | 状态 |
|---|---|---|
| Task Manager / Task Record / Local App | 通过共享 Application 创建、展示和维护正式 Task 的最小顶层记录 | P0.1 已交付并生效（2026-08-01） |
| Task Triage | 判断任务应走什么路径 | 已确认；P0.1 接入 Task Manager |
| Task Environment | 建立并维护可执行、可核验、可清理的任务环境 | P0.2 已交付并生效（2026-08-02） |
| Task Verification | 声明现有验证能力、执行显式能力并维护 current Task Verification Result | P0.4 已交付并生效（2026-08-03） |
| Task Development | 从首个正式研发动作到Finish handoff维护可选planning nodes、Content Target、正式Verification、Task Candidate、推进决定与不可变研发交接 | P0.5 已交付并生效（2026-08-04）；v2全研发周期authority与Local App只读投影已补齐 |
| Task Finish | 消费研发交接，为当前 Product 执行内容等价载体交付、retained 激活与 Task Environment 清理 | P0.5 已收窄为 handoff adapter；P0.8 第一阶段收敛现有交付边界，后续只按真实需求扩展路径 |

## 辅助与横切能力

| 能力 | 作用 |
|---|---|
| Task Review | 通过 Planning Review 与 Completion Review 分别审阅方案和完成候选 |
| Task Verification | 对明确 target 执行适用的已声明能力，维护 current Result，并按 target/declaration identity 派生适用性 |
| Git Operations | 定义单项 Git 行为、安全默认值、硬边界和最小 evidence；不负责流程编排 |
| Parent Task | 让一个普通 Task 管理直接子 Task；只表达协调层级，不传播状态、结果或专业动作 |
| Structured Task Board 评估 | Parent/Child 无法覆盖非 Task 规划项、多协调者成员关系、显式依赖、稳定排序/分组或跨 Task 决策记录时，再评估独立 Domain |
| Task Retrospective | 在任务中按高价值线索持续观察，并在任务终态后形成面向未来工作的复盘结论与改进候选 |
| Local App | P0.1 提供 Task 最小列表、详情和受控管理；P0.2/P0.3/P0.4 交付环境、审查与验证 reader；P0.5a 将一级视图收敛为“概览、研发、证据、环境”并增加 Development 只读投影；Parent Task Change 增加层级展示、导航和维护；后续按真实缺口补充专业投影 |

## Workspace Foundation

### 定位

> Workspace Foundation 是任务生命周期之外、由 Buildr 持续建设的共享工作基础。

它帮助人和 Agent 回答四个问题：

| 问题 | Foundation 提供的内容 |
|---|---|
| 我在哪里？ | Workspace、Project、Service 的范围、身份与关系 |
| 现在是什么？ | 当前事实及其权威来源 |
| 应该怎么做？ | 规则、方法与工作约束 |
| 可以用什么？ | Agent 能力、工具与跨任务功能模块 |

### 组织与运行关系

```mermaid
flowchart TB
    W["Workspace"] --> P["Project"]
    P --> S["Service"]
    T["Task / Change State"] -. "关联，不构成第四层" .-> P
    T -. "关联" .-> S

    W --> F["Foundation Source<br/>事实、方法、身份与能力"]
    R["Workspace Agent Runtime<br/>Agent 实际使用的规则与能力"]
    F --> H["Human Interface<br/>Docs / App / CLI"]
    F --> M["跨 Task 功能模块"]
    F -->|"Sync / Render"| R

    R -->|"保留工作区环境管理入口"| E["Task Environment"]
    E --> C["Candidate Source / Runtime"]
    C --> TF["Task Finish"]
    TF --> F
```

### 核心边界

- Foundation 是长期系统基础，不是任务步骤；不单独建设 Skill、CLI 或状态机，也不要求每个任务执行完整 preflight。
- `Workspace → Project → Service` 是稳定组织骨架；Task 可以关联多个 Project、Service，并按需关联 `0..N` 个 OpenSpec Change，不构成第四级目录层。P0.1 的 Change 引用只保存 `project/change` 并在当前 Task Record 内去重，不提前建立跨 Task ownership。
- Foundation 组织长期共享的事实、方法和发现入口，不接管所有代码、数据库、网页或用户输入。
- 人和 Agent 共用同一 Source Authority；Agent Runtime 是实际运行面，但不是第二份事实源。
- Task Environment 由保留工作区 Buildr 环境管理器执行准备、恢复、资源登记和清理。task worktree/branch 中的 Rule、Skill、contract、功能模块和 package 都是候选变更，可以在隔离目标测试；只有实现完成并集成到 retained checkout 后，才从 retained Product source sync/render 对应 Agent runtime 并确认生效。
- 当前 P0.5 Task Finish adapter 只消费研发交接；自举 Product 交付进入 retained source 后执行适用的 sync、Doctor 与 CLI install，再请求 Environment cleanup。通用 Development contract 不因此依赖 Product、Git 或 runtime 常量。
- Foundation 可以提供跨 Task、跨 Change 的功能模块；具体状态由对应模块管理。
- Buildr 保证身份、结构、边界和投射，不裁决业务事实，也不替 Agent 构造完整 Task Context。

## Task Triage

### 定位

> Task Triage 是新任务的语义分流入口；Task Manager 是正式 Task Record 的管理入口。二者不能互相代替。

```mermaid
flowchart LR
    A["用户任务"] --> B{"Agent 判断<br/>Triage 是否适用"}
    B -- "路径已经明确" --> C["直接进入专业能力"]
    B -- "需要分流" --> D["Task Triage"]
    D --> E["Explore"]
    D --> F["Within Contract"]
    D --> G["Current Fact Maintenance"]
    D --> H["Change Flow"]
    D --> I["Blocked"]
    F -. "进入正式执行" .-> M["Task Manager"]
    H -. "创建 Change 前" .-> M
```

### 语义入口

| 入口 | 含义 |
|---|---|
| Explore | 目标或范围尚未收敛，继续讨论 |
| Within Contract | 在已有契约内实现、修复或优化 |
| Current Fact Maintenance | 让 Knowledge 等说明追上已经成立的事实 |
| Change Flow | 改变外部行为或长期契约 |
| Blocked | authority、授权或关键语义存在冲突 |

### 职责边界

Task Triage 只负责核对任务事实、识别治理 Project 与已知影响面、选择语义入口并给出下一动作。它仍由 Agent 进行语义判断，不持久化任务状态，也不准备环境、执行验证、维护看板或编排收尾。

当 Triage 已确认工作即将进入正式持久交付时，它必须先通过 selected `buildr.task-record/v1` provider 创建或恢复 Task Record，再进入 Environment 或 OpenSpec/实现写入。路径已经明确而不需要重新 Triage 的正式执行，同样先确保 Task Record 存在。Task Manager provider 不 ready 时只阻塞首次交付写入，不抹去已确认的语义结论。

纯讨论、只读探索、单次测试、临时服务、API 调用和已有 Task lifecycle metadata 维护不创建新 Task Record。Triage 不把 Agent host task/thread id、worktree 名称或未来 Change 名称当作 Task ID。

### 建设形态

Task Triage 继续保持 **Skill-only**，不建设自己的 CLI、receipt 或状态机；P0.1 只为它增加对 Task Record capability 的条件依赖。Task Manager 和 Task Environment 都是独立能力，分别拥有顶层记录与环境事实。

## Task Environment

### 定位

> Task Environment 在正式 Task 进入持久交付变更前，建立并核验可归属、按需隔离、可执行、可核验、可清理的环境，并通过同一份 Environment Receipt 维护其完整生命周期。

当前 Workspace 本身也是一种 environment；没有创建 worktree 不等于没有环境。正式 Task 修改交付物，或在研发中构建、测试、启动 Task-owned 持久进程前，必须先取得 `ready` 的 Environment Receipt。各生命周期 Skill 在 canonical Workspace 维护 Receipt、Result 和复盘记录属于 Workspace 任务元数据写入，不要求为写记录重新激活已经清理的 Task Environment。

Task Environment 只管理已经存在的正式 Task，不是所有 Agent 本地操作的强制入口。Task 外的单次测试、临时启动服务、调用 API 等操作由 Agent 直接执行；临时资源在当前操作中按用户意图停止或保留，不创建 Task 或 Environment Receipt。用户要求保留的 Task 外进程必须如实披露当前事实和清理方式，但第一版不承诺跨 Agent session 自动恢复管理；以后确有需要时再单独设计 Workspace 级运行资源管理能力。

Task Environment 不是只执行一次的线性阶段：生命周期图中的节点表示首次 `ready` 门槛，Skill 与 receipt 继续服务于 Development、Verification 和 Finish。

### 生命周期

| 时点 | Task Environment 的动作 |
|---|---|
| 首次进入持久交付变更 | 以 Task ID 创建 receipt，再准备执行根、Runtime / CLI、依赖等适用资源，完成最小真实探测后返回 `ready` 或 `blocked` |
| Development / Verification | 正式 Task 新增相关 repo，或登记 Local App Preview、dev server 等动态资源 |
| 跨 Agent session 恢复 | 通过 Task ID 串行找回同一份 receipt，重新执行最小环境探测；不得按 cwd 或 branch 猜测，也不得把恢复理解为多窗口并发推进 |
| Finish / 明确放弃 | 根据同一份 receipt 清理资源并解除占用；未清理完成时保留现场 |

Task Triage 是可选上游。无论是否经过 Triage，正式 Task 首次修改交付物或创建 Task-owned 环境效果前的 `ready` receipt 才是硬门槛；Task 外临时操作不套用此门禁。

### Environment Receipt

每个 Task ID 只维护一份 Environment Receipt。它是 Workspace 本机状态中的动态资源清单和控制记录，由 Task Environment Application 独占写入，使用 `buildr.task-environment-receipt/v2` 并保存在 canonical Workspace 的 `.buildr/tasks/<task-id>/environment.json`，该文件不进入 Git；同一 Workspace 的共享执行根、task worktree 和不同 Agent session 必须能解析到同一份记录。不同 Task 不共用 receipt 或 Task-owned 资源归属；它们只有在实际使用同一执行根、Git repository 或其他共享写入面时才产生共享边界。文件写入遵守下文统一的“最低文件写入纪律”。Receipt 不是 Source Authority 或 Task Context，也不代替对真实环境的核验。

Task Environment Receipt 是 Task 级环境事实的唯一汇总入口。长期保留的 Git 证据使用新的窄 `buildr.git-worktree-evidence/v1`，只记录 repository、checkout、branch、HEAD、clean 和 Git effects，并由 Git worktree provider 维护。旧 worktree-centric v1 receipt 只用于一次性迁移输入：匹配正式 Task 的活跃环境转换为 v2 Receipt 与窄 Git evidence；无 Task 的 live worktree 只保留窄 Git evidence；无真实资源的陈旧 receipt 删除；identity/ownership 冲突则原样保留并阻止 authority 切换。旧 receipt 不作为永久兼容 reader 或第二套 authority 留下。

| 信息 | 最小内容 |
|---|---|
| Task 绑定 | Task ID、canonical Workspace identity / root |
| 执行位置 | 每个工作范围的 Project / Service 引用、执行根或任务验证 Workspace 根、共享与占用事实、清理责任；Git 仓库按需记录 checkout、branch / HEAD 等 Git 事实 |
| 执行基础 | 保留工作区 Buildr 环境管理器 identity、适用的语言 Runtime（如 Node）、Workspace CLI、workspace-scoped Agent runtime 的 source/projection identity、package manager / lockfile、依赖就绪结果及最小事实指纹 |
| 动态资源 | Local App Preview、dev server、端口、容器、临时数据库等持久资源及其清理信息 |
| 最新结果 | `ready` / `blocked`、失败原因和最终清理结果 |

Receipt 不保存 Agent session 上下文、任务计划、开发进度、完整测试结果、runtime 生成文件副本、`node_modules` 内容或凭证。它只登记完成恢复、真实探测和清理所需的 runtime source/projection identity 与本机事实；实际行为验证属于 Task Verification。环境管理器 fingerprint 只证明执行环境动作的 Buildr source/CLI 与最近一次成功核验的管理入口一致，不是 Task source baseline、Candidate identity 或 retained target revision，也不因自身变化自动要求任务吸收 retained Workspace 的新代码。

只有正式 Task 中会持续存在、需要 Task Environment 清理或影响并发的资源才登记；正常退出的一次性进程和验证结果不登记。正式 Task 的资源创建者必须立即通过 Task Environment 写入 receipt，登记失败时清理刚创建的资源。

### 环境准备

- Task Environment 根据当前 Workspace、Project、Service 的权威事实准备环境；事实缺失或冲突时返回 `blocked`，不按惯例猜测，也不新增通用 environment 声明。
- Git 不是 Environment Receipt 或 `ready` 的前提。没有 Git 的 Workspace 或工作范围仍使用 Task Environment，只是不具备 Git worktree 提供的物理隔离和历史恢复能力。
- Git 仓库需要隔离时，可使用 Git worktree provider 创建、复用、检查和删除 worktree；provider 只返回路径、repository、branch、HEAD、clean 等 Git evidence。是否采用 worktree 由当前 Workspace 事实和任务需要决定，不由 Task Environment 硬编码。
- 自举 Workspace 使用 Git worktree provider 时，`.worktrees/` 是多个任务环境的容器；每个 `.worktrees/<task-id>` 是该 Task 的 checkout 与执行根，也可作为**任务验证工作区（Task Validation Workspace）**根。workspace-scoped Agent runtime 可以投射在这个根下面，用于独立验证候选能力；worktree 不是主 Workspace、retained Workspace、canonical metadata authority、Agent runtime 本身，也不称为“开发 Workspace”。
- 适用的 Runtime、Workspace 所需 CLI 和依赖由 Task Environment 在实际执行根中准备并登记。Node 项目的每个 task worktree 根据自己的 lockfile 独立准备 `node_modules`；只共享 package manager 下载缓存，不复用或链接其他 checkout 的 `node_modules`。
- Buildr 自举任务使用 Workspace Foundation 提供的保留工作区 Buildr 环境管理器创建、恢复和清理环境；worktree 内的 Buildr CLI 是 Development / Verification 的候选对象，不能负责创建、认领或清理自己的环境。环境 ready 后，候选 CLI 可以把候选 runtime 投射到 receipt 绑定的自身任务验证 Workspace，也可以在验证 Workspace 内使用隔离的模拟用户目录测试 user destination；但不能写入 retained Workspace、另一个 Task 的 worktree 或验证 Workspace 外的共享用户 runtime。模拟投射不等于真实 Agent runtime 已生效。
- `ready` 必须来自实际执行根中的最小真实探测，核验执行位置、适用的 Runtime / CLI 和依赖是否满足运行需要；Git 仓库再核验 checkout identity。`ready` 表示环境已知且可执行，不承诺已经物理隔离，也不代替项目测试。
- 当本次变更会改变 Agent runtime 的发现、加载或行为时，文件已渲染只证明 projection ready；需要真实采用证据时，应从该任务验证 Workspace 启动独立 Agent session，再由 Task Verification 绑定 source/projection/environment identity 记录结果。P0.2 只准备和恢复环境，不把该验证结论写进 Environment Receipt。
- Local App Preview 不是首次 `ready` 的前置条件。正式 Task 在 Development / Verification 中按需启动后，立即登记到 receipt，供后续清理。

### 来源基线与环境管理器 identity

- Task Environment 的实际来源基线是每个工作范围的 checkout/provider evidence，包括 start point、branch、HEAD、执行根及真实 Runtime、CLI、依赖和 projection probes；它不是保留工作区环境管理器的 fingerprint。
- retained target 或 canonical Workspace 前进，不会单独使 Task Environment 失效，也不会触发 Environment fetch、rebase、sync 或改写任务 checkout。Task 是否吸收新目标内容，由 Task Development 或 Task Finish 在 Git 交付边界显式决定；完成更新后再由 `prepare` 复核已经变化的 checkout 和执行基础。
- 环境管理器 source/CLI 发生变化时，`prepare` 可以在真实 probes 通过后刷新其执行 identity；这只确认后续环境动作使用哪个受信管理入口，不改写任务来源基线，也不自动废弃 Review / Verification evidence。变化是否影响某份 evidence，仍由对应 Result 的目标 identity 与适用性规则判断。具体 fingerprint 轮换协议由 Task Environment 的后续窄修正确定，不在 P0.3 建立通用漂移状态机。

### 隔离与并发

- 第一版假设同一 Task 同一时刻只有一个 active writer，不支持多个 Agent session、窗口或进程在彼此无感知时并发推进同一 Task。更换窗口或 Agent 只允许按 Task ID 串行恢复，不为尚未支持的同 Task 并发预先建设锁、CAS 或通用调度器。
- Agent 发现同一 Task 正由其他 writer 推进，或 Environment Receipt 已不同于自己读取时的事实，必须停止环境写入并返回 `blocked`，不得静默覆盖。这个最小失败边界不把 Task Environment 扩展成 Task Record 或通用并发协调模块。
- 不定义 `in-place`、`dedicated` 等顶层 mode；receipt 记录实际资源、执行位置、共享和清理事实，Buildr 从中判断隔离与并发边界。
- Worktree 等独占执行根可以提供确定性隔离。没有创建 worktree 或其他隔离环境时，同一个主 Workspace 执行根默认只允许一个修改型 Task 占用；只读工作不占用。没有 Git 的 Workspace 仍可以通过不同执行根并发多个 Task，但同一共享执行根不提供足够安全的并发写入边界。
- Git worktree 的隔离范围主要是工作树与 index；Git object/ref、端口、进程、容器、用户级 Skill/runtime、凭证和外部服务仍可能共享。Task Environment 必须按真实资源登记和协调，不能把不同目录等同于完整系统隔离。
- Buildr 的最小保证是让 Agent 看见 active receipts、共享执行根、已知占用与清理责任，并在需要时登记 Task-owned 写入范围。Agent 必须结合这些记录和真实文件系统维护各 Task 的修改边界与冲突。
- 共享执行根的占用跟随 Task receipt，不跟随 Agent session。session 结束、崩溃或超时不会自动释放；只有 Task 完成、明确放弃或迁移，且相关范围可安全复用时才解除。
- 使用共享执行根不以整个目录 clean 作为绝对前提，但 Agent 不得接管、暂存、覆盖或清理来源不明的既有改动。范围重叠或归属不清时先分析真实影响；涉及语义、授权、重大风险或无法安全恢复的决定时交给用户，无法证明归属时不得执行破坏性清理。
- 第一版不建设共享执行根的通用文件 write-set。Environment cleanup 只确定性停止已登记资源并解除占用；没有 provider evidence 能证明源码归属时保留共享源码，并在结果中明确标记 retained，不把“未删除”误报成自动回滚。

### 多 repo 扩展

- 一个 Task ID 仍使用一份 receipt，可以包含同一 canonical Workspace 管理的多个 repo 和执行目录。
- Development 只读看到新 repo 时不立即登记；一旦确认它属于当前 Task，必须先交给 Task Environment。Task Environment 根据实际事实选择适用的 environment provider，或登记已有共享执行根，并在写入、构建或测试前更新原 receipt。
- 一份 receipt 不跨多个独立 Buildr Workspace。需要进入另一个 Workspace 时，拆分为另一个 Task ID / receipt 并显式交接。

### 失败与清理

- 环境准备中途失败时，保留同一份 receipt，记录已创建资源和失败原因并返回 `blocked`；后续仍由 Task Environment 重试或清理。
- 正常完成时，Task Finish 完成适用的 Git 或非 Git 交付，并把交付结果与执行环境已可安全清理的事实交给 Task Environment；Task Environment 不执行交付动作，Task Finish 也不直接删除 worktree 或清理其他环境资源。
- Task Environment 按 receipt 编排清理，各资源 provider 执行具体动作。用户明确放弃 Task、且结束编排者已经处置需要保留的交付事实与关联 Change 后，可以不经过 Finish 直接清理该 Task 独占的环境，包括 dirty worktree，不再要求二次确认。
- 用户明确放弃 Task 本身构成清理 Task-owned 改动的授权。只有 Environment Receipt、Git evidence 或其他可靠事实能证明归属时，才可以清理共享执行根中的对应改动；没有 Git 时尤其不能假设能自动回滚源码。来源不明、混有其他 Task 改动或 ownership 无法证明时返回 `blocked`，不得扩大范围全部丢弃。
- 清理成功后只在原 Environment Receipt 中保留最小清理结果。
- Task Environment 不触发、不写入也不清理 Task Retrospective。它只返回环境处置事实；正常完成或放弃路径的结束编排者在 Task 到达稳定终态后另行请求最终复盘。

### 建设形态

第一版采用 **共享 Task Environment Application + 薄公共 CLI + Task Environment Skill**。Application 是唯一 Environment writer，确定性实现 `prepare`、`inspect`、内部资源登记/释放和 `cleanup`；公共 CLI 只开放 `buildr task environment prepare|inspect|cleanup <task-id>`，Skill 负责按任务意图调用它们。交接契约只定义 Task ID、`ready / blocked / unavailable / cleaned`、环境引用、资源处置和 cleanup 结果等跨模块必要事实。现在不建设独立 Task Core、通用状态机、锁、CAS、租约或环境调度器，也不把内部资源动作公开为 CLI。

## Workspace 中的 Task 记录

### Task ID

Task ID 是正式 Task 生命周期中人可读、稳定且在当前 Workspace 内唯一的主标识。正式 Task 是准备产生持久交付变更并完成交付闭环的执行单元，不等于普通对话、临时操作、Agent host task/thread 或 OpenSpec Change。

- 纯讨论、只读探索、单次测试、临时服务、API 调用和 Board 中尚未进入执行的规划不创建 Task ID。
- Environment Receipt、Development Receipt、Review Result、Verification Result、Task Finish run/result、Retrospective、worktree 和任务分支都使用同一个 Task ID，但各自维护自己的事实；P0.5 不新增 Finish Receipt。
- 一个 Task 可以关联 `0..N` 个已存在 OpenSpec Change；P0.1 只用 `project/change` 消除跨 Project 同名歧义并在当前记录内去重，不扫描其他 Task Records，也不声明跨 Task 唯一 ownership。
- Task ID 一旦创建就不因标题或意图微调而改名。Task Record 可保存一个直接 `parentTaskId` 并派生直接 `childTaskIds`；它不保存执行者 identity、通用关系图或依赖。
- Task Record Application 是唯一逻辑 writer；`task-manager`/CLI 与 Local App 只是客户端。第一版不支持多人协同编辑、自动合并、锁或租约；Local App 的陈旧页面只用不持久化的 `recordDigest` fail closed。

### Task Manager 与最小 Task Record

Task Record Application 是 Task Record 的唯一 writer。`task-manager` 是 Agent 创建、读取、更新和结束 Task Record 的 Skill；Local App 是人的列表、详情和受控管理入口。两者调用同一 Application，Task Manager 不是 Task Core、总调度器或专业记录索引，Local App 也不在 Web 层另建 writer。

每个 Task ID 在 canonical Workspace 的 `.buildr/local/workspace.sqlite` 中维护一份规范化记录。以下 YAML 只是 `buildr.task-record/v1` 逻辑模型的可读表达，不是磁盘文件：

```yaml
schemaVersion: buildr.task-record/v1
taskId: introduce-task-record
title: 建立任务记录基础
intent: 为正式 Task 建立稳定、最小、可恢复的顶层记录
scope:
  projects:
    - product
  services:
    - project: product
      service: buildr
changes:
  - project: product
    change: introduce-task-record
parentTaskId: null
childTaskIds: []
status: active
result: null
createdAt: 2026-08-01T10:00:00.000Z
updatedAt: 2026-08-01T10:00:00.000Z
```

| v1 保留 | 理由 |
|---|---|
| `schemaVersion` | 防止未来 writer 静默改写未知格式 |
| `taskId`、`title`、`intent` | 恢复 Task identity 与顶层目标 |
| Project/Service scope | 表达业务影响面并由 registry 校验 |
| `project/change` references | 表达 `0..N` 个真实 Change 并消除同名歧义 |
| `parentTaskId`、`childTaskIds` | 表达至多一个直接 Parent 与按 ID 排序的直接 Children；Children 由关系表派生 |
| `active / completed / abandoned` 与 result | 表达最小顶层处置；completed 可标记 `noChange` |
| `createdAt / updatedAt` | 基础审计和排序，由产品生成 |

当前明确不保存 `revision`、`recordDigest`、`workspaceId`、执行者、通用 Task relations、依赖、blocker、富文本 Overview，以及任何 Environment、Development、Review、Verification、Git、Finish、独立 Board 或 Retrospective 内容与引用。Parent/Child 只表达协调层级，不自动完成/放弃、不聚合状态或 Result，也不触发任何专业动作。Local App 直接投影这份关系及各专业 reader，不要求 Task Record 复制索引。

Task Manager 不读取 Environment Receipt，也不提供结构化字段记录 worktree、branch、runtime、CLI、依赖、进程、端口、资源、凭证、完整日志或专业 record revision。从 task environment 调用时，上游只向它提供已经确认的 canonical Workspace target；v1 不对 title/intent/result 做启发式文本扫描。

P0.2 保留 Task Record 的 closed-schema 和领域校验，但把“Change 是否存在于 retained Project”的位置判断替换为共享的**任务范围 Change 引用解析器（Task-scoped Change Reference Resolver）**。解析器只接收 canonical Workspace、Task ID 与 `project/change`，先读取匹配 Task Environment 的 Project 执行根，再回退 retained Project；它不是新的 authority，也不保存路径或来源到 Task Record。全局 Change 列表仍只索引 retained Project。

### 产品动作与客户端边界

通过 Agent 工作时，Agent 负责理解用户意图、判断是否已经形成正式 Task，并提供 title、intent、业务 scope 与真实 Change 引用；人也可以在 Local App 直接表达这些顶层事实。Buildr Application 对所有客户端固化以下动作：

- `create`：生成 active record、默认值和系统时间；可选择一个已存在且 active 的直接 Parent；
- `inspect`：只读返回最新记录；
- `update`：只对 active Task 应用明确的 title/intent/scope/change set/add/remove，并可设置、重挂或清除 Parent；
- `complete`：写入 completed、summary 与 `noChange: true|false`；
- `abandon`：写入 abandoned 与 reason。

Agent 不直接编辑 YAML，不提交完整 next-state document，也不推理系统字段和合法状态转换；Local App 同样不解析/render YAML 或自行实现状态迁移。终态不可重开或继续修改。

关系写入拒绝不存在或 terminal Parent、自引用和任何祖先循环。Parent 后续进入终态时既有关系仍可读，Child 仍可独立更新和结束；Parent/Child 的 complete、abandon、Verification、Finish、cleanup 和 Result 都互不传播。Application read model 只返回直接 Parent 与直接 Children 摘要，不递归展开整棵树。

### P0.1 Local App

P0.1 把“任务”加入 Workspace 核心导航，提供：

- `/workspaces/:workspaceId/tasks`：SQLite 轻量 Task 列表，默认 active，支持关键词、Project、Service、status 与直接 Child 筛选；
- `/workspaces/:workspaceId/tasks/:taskId`：单 Task stored-state 详情，不在首屏解析专业 currentness；
- 编辑 active Task 的 title/intent/scope/Change references；正式 Task 只由 Agent/Task Manager 创建，Local App 不提供 create route；
- 编辑 active Task 时可选择、重挂或清除 Parent；候选在操作字段时按需读取，列表显示层级摘要，详情可在 Parent 与直接 Children 间导航；
- 明确确认后 complete 或 abandon，完成时明确选择是否 no-change；terminal Task 只读。

Local App 通过 Workspace-scoped API 调用 Task Record Application，继续只接受已登记 `workspaceId`，拒绝 `target/root/path`、未知字段和不可信写请求。完成/放弃确认必须说明“只更新顶层 Task 状态，不执行 Finish、Git、Verification 或 Environment cleanup”。P0.1 不显示专业阶段卡片、不建设 Board、不做批量操作或语义比较。

Application read model 返回当前逻辑记录的 `recordDigest`；Local App mutation 必须携带页面读取到的摘要。摘要变化时在同一数据库事务内返回冲突并要求刷新，不覆盖、不自动合并。`recordDigest` 不持久化，也不是通用协同编辑协议。

### P0.2 Local App 环境页签

P0.2 在既有 Task 详情中增加独立、只读的“环境”页签。页面通过 Workspace-scoped API 调用 Task Environment Application `inspect`，展示当前机器的 `observedAt`、receipt 可用性、`ready / blocked / drift / unavailable`、scope/root、Runtime/CLI/依赖、runtime projection identity、Git provider evidence、动态资源与 cleanup 摘要。打开页签、页面重新获得焦点或手动刷新时执行一次有界 probe；首版不增加 WebSocket、后台持续轮询或 prepare/cleanup 按钮。

HTTP/Web 层只接收已登记的 `workspaceId` 与真实 Task ID，拒绝 `target/root/path` 和 receipt bytes，不直接解析 Environment Receipt，也不从 branch/worktree 名猜测环境。Environment 暂不可用时仍展示 Task Record，并明确显示本机不可用或下一动作；任何环境事实都不复制到 Task Record。

### P0.5a Local App 研发与证据视图

P0.5a 不增加第五个模块页签，而把任务详情一级信息架构固定为“概览、研发、证据、环境”。“研发”通过 Workspace-scoped、no-store 的只读 API 调用 Task Development Application `inspect`，展示 `missing / developing / candidate-current / handoff-current / unknown` 的中文结论、最小输入适用性、候选代次、三个门禁、保存的推进决定、风险和最近一次研发交接；页面不打开SQLite或读取旧YAML，不重新推导 currentness，也不提供 Development writer。

“证据”不增加二级导航，连续放置审查结果与验证结果两个独立区块；打开视图时分别调用 Task Review 与 Task Verification reader，任一 loading/diagnostic 不隐藏另一方。Environment 已清理或当前观察失败时，Development reader 返回 `unknown`；页面保留已保存候选、决定与最近交接，并明确说明历史事实当前无法实时复核，不把它显示为 current、stale 或 failed。首版不展示日志、diff、完整 Result、全部交接历史、后台轮询或写操作。

### 主 Workspace 存放边界

Task Record 与后续专业记录都属于 canonical Workspace，但每类记录有自己的唯一 writer。Task Record 进入本机 Structured Store，专业记录仍保留在 File Store：

```text
.buildr/
├── local/
│   └── workspace.sqlite
├── tasks/
│   └── <task-id>/
│       ├── environment.json
│       ├── development.*
│       ├── verification.*
│       ├── reviews/
│       │   ├── planning.*
│       │   └── completion.*
│       └── finish.*
└── retrospectives/
    └── <task-id>.*
```

Task Record Application只维护SQLite中的Task表及规范化关系表；Task Manager/CLI与Local App只调用Application。Task Development、Verification与Review分别通过自己的Application和SQLite repository独占专业current records；进入同一个数据库不等于合并Domain、writer或状态机。Task Environment、Finish、Board与Retrospective继续独占自己的专业记录。linked task worktree不是Structured Store authority，不能创建或修改canonical Workspace数据库。

`.buildr/`作为**Workspace Local Data Store**处理：Structured Store承载Task Record及Development、Verification、Planning/Completion Review全部current records；File Store只继续承载Environment、Finish、日志等各owner明确保留的本机运行/交付事实。`.buildr/local/`整体忽略且不发布、不同步；Task current records不进入Git。未来组织协作由Buildr Server/Cloud承担，本任务不设计其schema、API或同步协议。

### 首版 SQLite 写入纪律

第一版只保留低成本、确定性的文件安全：

- closed schema 和字段级校验由产品实现；
- Task Record repository只拥有`tasks`及其Project、Service、Change关系表；三个专业repositories只拥有各自current tables，业务判断不下沉到SQL；
- schema 由有序、带 checksum 的 SQL migration assets 建立；版本缺口、漂移、未知更新版本或完整性失败均 fail closed；
- 每个 create/update/terminal mutation 在单个 SQLite transaction 中完成，foreign keys 和 closed domain constraints 同时生效；
- Local App mutation 以不持久化的 `recordDigest` 拒绝已经陈旧的页面；
- mutation失败必须rollback，保留最后一份有效逻辑记录和所有其他current slots；
- `completed / abandoned` 不得回到 `active`。

SQLite transaction 防止半写关系记录；`recordDigest` 只拒绝可证明陈旧的页面。Task Record 不把 revision 写入 schema，不加入租约、自动合并或多人协同编辑。

### 无变更结束

正式 Task 创建后，如果在产生交付变更前确认无需修改，可以执行 `complete --no-change --summary <text>`：

- Task Record 如实保存 completed、summary 和 `noChange: true`；
- 没有 Environment 时不补造 receipt；
- 不创建 Development、Candidate、Review、Verification 或 Finish 占位记录；
- 如果已经创建或修改交付物，就不再使用 no-change，继续正常交付或明确 abandon。

### Git 与Task本地数据边界

Task Record及全部专业current records明确属于local-only Structured Store，不执行Git add、commit、push或同步。Git只负责产品源码和用户或其他consumer明确选择的普通Git内容；Task是否已经共享不写入任何Task current record。旧YAML存在时保持inert，不读取、不迁移、不双写，也不作为Git metadata继续维护。

## Parent Task 与协调投影

### 当前方向

> 优先让一个普通 Task 通过 Parent/Child 关系管理直接子 Task，并由 Local App 动态投影协调视图；当前不创建独立 Board Domain。

协调 Task 仍是普通 Task Record，使用同一 Task ID、状态和生命周期。它可以有多个直接 Children，也可以自身作为另一个 Task 的 Child，从而形成多层树。每个 Child 至多一个直接 Parent；关系只存在于同一 canonical Workspace。

Task Record Application 是关系的唯一 writer。SQLite 直接使用 nullable `tasks.parent_task_id` self-reference foreign key 表达标准一对多层级，并通过 `tasks(parent_task_id, task_id)` 索引查询直接 Children；不增加独立关系表，也不建设通用 relation/edge 图。写入必须拒绝不存在或 terminal Parent、自引用和任何祖先循环；读取只返回直接 Parent 和直接 Children，调用方按需逐层导航。

### 生命周期独立性

- Parent/Child 只表达“由谁协调哪些直接 Task”，不表达依赖、先后顺序、资源锁或交付包含关系。
- Parent complete/abandon 不自动改变 Children；Child complete/abandon 也不自动改变 Parent。
- Parent 不汇总 Child status/result，不替 Child 执行 Development、Review、Verification、Finish、publication 或 cleanup。
- Parent 后续进入终态时既有关系继续可读；terminal Parent 不能接收新 Child，terminal Child 不能再重挂或清除 Parent。
- 是否可以结束协调 Task 由人或 Agent 根据目标判断；Buildr 不根据 Children 状态自动推导。

### Local App

Local App 编辑 active Task 时可选择、重挂或清除 Parent；候选只在操作 Parent 字段时通过 SQLite query projection 延迟读取当前 Workspace 的 active Task 并排除自身。任务列表显示 Parent 和查询派生的直接 Child 数量，详情显示 Parent 与直接 Children 的真实标题和状态，并支持双向导航。页面不创建 Task、不递归加载整棵树、不把 Child 状态合成为 Parent 健康度，也不新增 Board writer。

Task 外的临时测试、服务和 API 操作没有 Task ID，因此不进入层级投影。需要纳入持续协调时，先创建正式 Task，再建立 Parent 关系。

### 何时重新评估独立 Board Domain

只有出现经过实际使用验证、且无法由协调 Task + Parent/Child + dynamic projection 覆盖的需求时，才创建新的有限探索。候选信号包括：

- 需要长期保存尚未 Task 化的规划项；
- 一个 Task 必须同时属于多个协调对象；
- 需要独立于 Parent/Child 的显式依赖及可消费条件；
- 需要稳定排序、泳道、分组或跨 Task 决策记录；
- 需要 Server/Cloud 下的组织级多人协作 authority。

在这些信号出现前，不创建 Board ID、Board 状态机、`.buildr/boards/**`、Board writer、Board Skill 或独立数据库表。旧静态任务看板能力不作为新 authority；后续若清退其生成链，应以单独窄 Change 处理，不与 Parent Task 混合。

## Task Development

### 定位

> 对形成交付变更的正式 Task，Task Development 是从 ready Environment 到不可变研发交接（Development Handoff）的必经薄层；它拥有 Development Receipt、Content Target、verification policy、Task Candidate/generation、推进决定与研发交接。

Task Triage 可以按需使用，但任何会修改交付物的 Task 一旦进入实际研发，都必须先取得 `ready` 的 Environment Receipt，再进入 Task Development。纯讨论和只读探索不进入，也不创建 Development Receipt。

Task Development 不规定统一的分析、计划、编码或测试步骤。Agent 根据具体任务和人在过程中的实时指令选择方法、调用专业能力并推进实现；Task Development 只保证 Task Intent 不被静默改变、Formal Verification 在 Candidate freeze 之前完成、检查点与风险不被吞掉、关键交接事实可恢复。它不替 Agent 制定方案、实现或修复问题，也不承担提交、集成、推送和环境清理。

使用 OpenSpec Change 时，关联 Change 的创建、更新、重新对齐、current knowledge 收敛、canonical specs 同步和归档都在稳定 Content Target 形成前由 Task Development 完成。一个 Task 可以关联 `0..N` 个 Change；代码、文档、配置或非 Git Task 没有 Change 时仍走同一条主线。研发交接的 Candidate 必须绑定所有关联 Change 的最终处置 identity；Task Finish 不创建、更新、同步或归档 Change。

### 研发主循环

| 时点 | Task Development 的动作 |
|---|---|
| 进入实际研发 | 核对 Task ID 和 `ready` Environment Receipt，创建 Development Receipt |
| 方案形成 | 对提案、方案、设计、计划及实际涉及的同类规划载体执行 Planning Review |
| 实现与修复 | Agent 在已对齐 Task Intent 内自主推进；新增 repo 或持久资源时调用 Task Environment 扩展原 Environment Receipt |
| 稳定 Content Target | 完成实现、开发期反馈、Change/current knowledge 收敛与候选 runtime 投射，观察排除 control metadata/carrier identity 的稳定内容 identity |
| Formal Verification | 固定 verification policy，对稳定 Content Target 执行正式验证并发布完整 current Verification Result；`not-passed` 或 gap 保持事实 |
| Candidate 与 Completion | Verification 事实完整后冻结 Task Candidate，再对 Candidate 执行 Completion Review |
| 准备研发交接 | 根据三个 gates 和精确 scoped 风险接受形成 `proceed / blocked`；只有 `proceed` 才追加不可变研发交接 |
| Finish 返回 Development | 只有 Development Application 报告原 Task source/context/policy/gates/handoff 真实 stale 时，Finish 终止当前 run 并把下一 workflow 指回 Development；Delivery Adaptation 与 target race 保留同一 Candidate/handoff 并按产品 exact token 恢复 |
| 用户明确放弃 | 记录放弃决定，不再要求 Candidate 或补做检查点；存在关联 OpenSpec Change 时，先按实际能力完成并记录每个 Change 的最终处置，再请求 Task Environment 清理 Task-owned 环境与改动；环境完成处置或被明确保留后，才形成 `abandoned` 终态并请求最终复盘 |

### Task Intent 与 Agent 自主权

Task Intent 是人与 Agent 当前已对齐的统一目标、范围和预期结果，可以只是一句话，也可以关联 `0..N` 个 OpenSpec Change。多个 Change 可以对应不同阶段或 Project，但必须共同服务同一个 Task Intent。当前 Task Intent 的唯一 authority 是 Workspace Structured Store 中的 Task Record；Development Receipt 不维护第二份可独立变化的当前 Intent，只保存本次读取的 intent/scope/change identity 与处置快照。Task Record 这些字段变化后，Development 必须重新观察 Content Target、重建 policy、执行 Formal Verification 并形成新 Candidate。

- Agent 可以自主修复不改变 Task Intent 的实现缺陷、逻辑问题、代码质量问题和测试问题，无需逐项询问用户。
- Candidate 已 handoff 给 Finish 后，普通 Finish 授权不包含重新修改内容形成新 Candidate；只有用户再次明确授权，或当前 Task 已有 Goal 级持续授权时，Agent 才能返回 Development 继续修复。
- 如果发现需要改变目标、需求、验收、范围或其他既有共识，Agent 必须停止相关实现、解释偏差并与用户重新对齐，不能让实现静默反向定义 Task Intent。
- 使用 OpenSpec Change 时，重新对齐后必须先更新仍 active 的 Change；原 Change 已归档时，在同一 Task 中创建并关联新的 Change，表达新的共识。随后执行 Planning Review 并继续实现，完成实现后也由 Development 收敛全部关联 Change，再形成 Candidate。
- Task Intent 改变后，原 Planning Review 不再有效；Verification Result 只有在新目标 identity 与 Project declarations 仍精确匹配时才可能 current，Completion Review 和未来 Candidate evidence 则由各自 authority 按实际影响判断并如实记录。
- Intent 变化是否仍属于同一 Task，由 Agent 先分析并说明影响，用户最终判断。决定创建新 Task 时，重新判断 Triage 与 Environment，并使用新的 Task ID 和 Receipts。

### Development Receipt

每个Task ID只有一份current Development Receipt，由Task Development Application唯一读写并事务保存到canonical Workspace SQLite。它是Workspace本地事实，不进入Git，也不因创建Receipt自动进入Candidate或源码commit。跨Agent session通过Task ID恢复；Task Finish只通过Application读取current handoff，不回写或改写研发事实。

| 信息 | 最小内容 |
|---|---|
| schema 与绑定 | `schemaVersion`、`taskId`、Environment Receipt schema 的逻辑引用；不复制本机路径与资源事实 |
| Task context | 当前 Intent/scope identity，以及完整 OpenSpec Change 引用与处置；没有 Change 时列表为空 |
| Content Target | 稳定交付内容 identity 与范围；排除 `.buildr/**`、`.git/**`、worktree/branch/commit/runtime/session identity |
| verification policy | declarations、capabilities、coverage gaps、Task-scoped overrides 与独立 policy identity |
| generation / Candidate | 只由 Development 创建的当前代次，以及绑定 Content Target、Task context 与 policy 的 Candidate |
| gates / decision | Planning、Verification、Completion Result 引用、适用性、`proceed / blocked` 与绑定精确 Result digest/scope 的风险接受 |
| handoffs | 每个正式 handoff generation 的最小不可变快照；旧快照保留但不再 current |
| 时间 | `createdAt` 与 `updatedAt` |

Receipt只在这些交接事实变化时更新，不保存研发流水、普通进度、思考过程、聊天摘要、完整方案正文、代码diff、测试输出或Review明细。Candidate变化时更新current identity，并引用对应专业能力对current evidence适用性的最新判断；失效结果不得继续显示为当前Candidate已通过。current Result仍可按各自规则事务覆盖，但一旦某generation已经正式handoff，它的最小交接快照只能保留、不能改写或删除；后续generation追加自己的快照，不建设完整Result历史库。

完成或放弃后只保留最小最终记录和已经正式handoff的不可变快照，当前不设计TTL、归档或自动回收策略。Task current records不通过主Workspace Git共享；需要团队协作时再由独立Buildr Cloud/Server authority设计。具体业务字段由Task Development Domain确定，repository遵守最小transaction纪律。

### 检查点

P0.5 Task Development 内置三类检查点；Result 仍由各自专业 Application 拥有，Development 只决定何时消费以及能否推进：

| 检查点 | 核心问题 | 时点边界 |
|---|---|---|
| Planning Review | 当前提案、方案、设计、计划等是否正确、完整且可实施 | 方案形成后、真正开始实现前至少执行一次；OpenSpec 在 `apply` 前执行 |
| Task Verification | 稳定 Content Target 的验证事实是否完整、current，声明与 policy facts 是否精确匹配 | Candidate freeze 之前执行；开发期测试反馈不能替代 Formal Verification |
| Completion Review | 方案、实际实现、Verification evidence 及相关事实整体是否仍符合 Task Intent | handoff 前必须存在一份仍适用于 current Candidate 的结果 |

“真正开始实现”指第一次修改规划资产之外的实际交付物。只读探索、Environment 准备以及编写或调整 OpenSpec Change 等规划资产不算实现，但 Change 修改仍是 Task Development 管理的持久交付变更；修改代码、测试、配置或其他交付内容算实现，文档任务中修改目标文档本身也算实现。

Planning Review 主要审阅准备如何完成 Task。Task Intent 变化，或架构边界、关键实现方式、影响范围、主要任务拆分等方案发生实质变化时，必须在按新方案继续实现前重新执行；普通编码修正、测试修复和不改变方案的小调整不触发重审。

Formal Verification 与 Completion Review 的顺序固定：前者绑定稳定 Content Target，Candidate 随后冻结，后者绑定 Candidate。内容、Task context 或 policy 改变时回到 Content Target；同一 target/policy 只刷新 Result 不递增 generation。

每个检查点都必须如实评估。Task Verification 只记录能力事实、coverage gaps 和 `passed / not-passed`；Task Development 独占 `proceed / blocked` 与风险接受。`not-passed`、coverage gap 或 Completion `changes-required` 不禁止冻结 Candidate，但会阻止 `proceed`，除非用户接受当前 Task、精确 gate Result digest 与明确 scope 的风险；旧 Result 或泛化授权不能复用。

Task Retrospective 不属于 Development 检查点或 Finish handoff 条件。Development 只在出现具体高价值线索时按需调用它记录事实，不为每个 Task 预先加载完整复盘流程。

### Candidate 与 Finish handoff

Candidate identity 不在 Development 开始时预设。只有稳定 Content Target 的 Formal Verification 事实完整后，Development 才冻结 current Candidate；随后 Completion Review 绑定该 Candidate，Development 最后形成 decision 与 handoff。

Task Candidate 只绑定 generation、Content Target identity、Task Intent/scope/Change context identity 与 verification policy identity。Review/Verification Result identity 不进入 Candidate，避免专业事实 authority 与推进 authority 循环依赖；Planning/Verification/Completion Result 只进入 gates、decision 与 handoff snapshot。Verification Result 绑定 Content Target 与 declaration identities，绝不绑定 Candidate/generation、proceed/risk 或 handoff。

任务验证 Workspace、worktree、branch、commit、其中投射的 task-scoped Agent runtime 及其 Agent session 都是执行或 carrier 资源，不是 Content Target/Candidate 本身。Git tracking、staging、commit 或创建内容等价交付载体都不改变 Content Target/Candidate identity；清理 Environment 也不得改变已经冻结的 Candidate。

候选代次（generation）只由 Task Development 创建和递增。第一次冻结 Candidate 时使用第一代；正式 handoff 前，如果内容与上下文未变，只是重新执行或替换 Review / Verification Result，则保持同一代。Review 与 Verification Result 都不持久化 `revision`，完整 Result 直接整体替换，Application 响应中的 digest 只标识本次读取的 canonical bytes。Candidate 已经 handoff 给 Finish 后被判定失效，或 content、Intent / Change context、verification policy context 发生变化时，Development 恢复同一份 Receipt，并在下一次冻结时递增 generation。Task Finish 只能引用或判定 generation 失效，不能创建、递增、回退或复用 generation。具体 identity 编码由 Task Development 模块 Change 确定。

Task、Board、Retrospective或其他Workspace lifecycle metadata不属于Candidate内容，也不通过Git共享。Candidate不强制等同于Git commit；Git仓库可能已经有匹配commit，也可能由Finish按Git Operations约定创建交付commit；非Git工作范围可以使用工具可核验的snapshot/content identity。

同一 Task 可以顺序形成多个 Candidate，但同一时刻只有一个 current Candidate。正式 handoff 后 Content Target、Task context、policy 或 current gate 发生变化时，本次 handoff 不再 current；Development 恢复同一 Receipt 并形成下一代 Candidate。旧 handoff snapshot append-only，仍保留历史事实但不能被 Finish 当作 current。Candidate 失效不创建新 Task，也不创建第二份 Development Receipt。

Task Development 只有满足以下条件，才将 Candidate 与 Development Receipt handoff 给 Task Finish：

- Environment Receipt 仍为 `ready`；
- 当前 Task Intent 已对齐；
- 所有关联 OpenSpec Change 已由 Development 完成适用处理，完整限定 identity 与处置列表已绑定 current Candidate；
- 已形成 current Candidate identity；
- 各相关 Project 实际采用的 verification policy context identity 已绑定 current Candidate，包括 `absent / undeclared` 与 Task 级适用性 / override 决定；
- Planning Review 仍对应当前方案；
- current Verification Result 仍对应 Content Target/declarations，且 policy facts 完整；
- Completion Review 仍对应 current Candidate；
- Development decision 为 `proceed`，任何负向 gate 都有绑定当前 Result digest 与精确 scope 的用户风险接受。

Handoff 要求事实完整、适用且 decision 为 `proceed`，不要求 Verification 必须 `passed` 或 Completion Review 必须 `ready`。每次 handoff 把 Candidate、Change 处置、gates、decision 与风险接受复制为不可变快照；后续 generation 只追加，不改写或删除旧 snapshot。Task Finish 不重新解释或补齐这些事实。

Task Finish 发现 carrier 不等价、目标前进或任何 handoff 前提变化时，当前 run 以 upstream Candidate defect 终止并把下一 workflow 指回 Development；它不写 Finish Receipt、不修改 Development Receipt，也不自动 rebase/merge 或生成新 Candidate。Development 获得适用授权后才修复、重验并形成新 generation。

### 建设形态

P0.5 已实现 **Skill + capability contract + 唯一 Application + internal driver**。`task-development` required 消费 Task Record、Task Environment、Task Review、Task Verification 与 current knowledge，optional 消费 Task Asset Review；不注册公共 Development CLI。P0.5a 只增加 Application `inspect` 的 Local App read surface，并把任务详情收敛为四个一级视图；仍不提供写 API、浏览器 mutation，也不建设 Task Core、planner、通用状态机、独立数据存储、history、revision/CAS 或锁协议。

## Task Finish

### P0.5 当前适配器

> 当前 Task Finish 是研发交接（Development Handoff）的窄交付适配器：它只把已经冻结并允许推进的 Candidate 放到内容等价的交付载体（Delivery Carrier）上，完成交付、retained runtime 激活与 Environment cleanup。

用户说“收尾”时，公共入口仍是单个 `buildr task finish run --task ...`。Run/Result 使用 breaking v2 schema，绑定 Task、研发交接、Candidate、Content Target、Environment、目标和实际 carrier；这不是新的 Finish Receipt，也不建立第二份 Candidate/decision authority。`completed + no-change` 路径不进入 Finish。

固定执行器只拥有五段确定性流程：

1. `preflight`：读取当前研发交接、ready Environment、retained target 与授权目标。
2. `prepare`：为当前 Candidate 创建精确、内容等价的 Git carrier，并刷新 Environment 事实。
3. `verify`：只证明 carrier 与 Content Target 等价；Formal Verification 已在 Development 中完成，这里执行次数必须为 0。
4. `deliver`：普通 fast-forward、普通 push，并在 retained source 更新后执行适用的 sync、Doctor 与 CLI install。
5. `cleanup`：请求 Task Environment Application 清理 Task-owned Environment。

Finish 不执行实现修复、Change convergence/archive、current knowledge mutation、Formal Verification、Completion Review、Candidate 生成、generation 变更、`proceed / blocked` 或风险接受。它也不能以 rebase/merge 修改冻结内容。Delivery Baseline 前进时，产品在 run-owned carrier 机械复用 Task Contribution；Git conflict进入 Delivery Adaptation，deliver target race 使用产品 exact token 从 `prepare` 重做 carrier phases。只有 Development Application 报告原 Task source/context/policy/gates/handoff 真实 stale 时，当前 run 才终止并指回 Task Development。

P0.5 自举适配器服务当前 Product 的单一 Git direct-to-target 路径；通用 Development contract 不因此依赖 Git 或 Product 常量。Finish 成功后由主 Agent调用Task Manager `complete`；Task Retrospective与PR不是顶层完成门槛。Task current records由Workspace SQLite持久化，不存在metadata publication阶段。

### P0.8 第一阶段与后续范围

P0.8 第一阶段 `simplify-task-finish-delivery-boundary` 只收敛现有 v2 边界：保留单一直接接线的 Product/Git adapter，不建立 adapter registry，并清除旧 Change/Candidate/Verification/worktree target 路由。非 Git、多个交付单元、task-branch、PR/release/deploy 或跨 generation delivery effects 尚未进入当前 adapter；后续只有真实交付需求及第二个可验证 adapter 已存在时，才以窄 Change 扩展，且继续禁止 Finish 获得 Change、Verification、Review、Candidate 或推进决定 authority。

### Candidate、carrier 与 Target Advancement

Candidate 由 Development 冻结，不强制等于 Git commit。Finish 可以创建内容等价的交付载体，但不能用 amend/rebase/merge 改变 Candidate bytes，也不能把 commit/tree identity 写回 Candidate。Git tracking、staging 或 commit 同一 bytes 不改变 Content Target/Candidate。

交付目标前进不是 Environment 漂移，也不自动使 Candidate stale。当前 adapter 从最新 Delivery Baseline 重新准备隔离 carrier：clean apply 记录 deterministic reuse，Git conflict进入 Delivery Adaptation，push 前 target race 用 exact token 重做 `prepare → verify → deliver → cleanup`；三者都复用原 Candidate/generation，且不重跑 Formal Verification。只有原 Task source 或其他 Development applicability input 真实变化时返回 Development。

### Run、Result 与完成

P0.5 不新增 Finish Receipt。Task Finish run/result v2 是一次窄 adapter execution evidence：成功时记录 handoff/Candidate/Content Target、carrier、目标、retained activation 与 cleanup 事实；失败时记录 terminal phase、真实错误与 `nextWorkflow`。它不保存或改写 Development decision。

Finish 成功只证明 current handoff 已由内容等价 carrier 交付、目标与远端事实匹配、retained runtime 已按适用事实激活且 Environment 已处置。随后由主 Agent 调用 Task Manager `complete`；终态写入失败时只重试该 action，不重跑 Finish。P0.8 如需持久 delivery effects，必须另行以窄 Change 证明需求，迁移必要 active run/history reader，并删除被替代的旧 mutation path；不得预建 Finish Receipt 或通用状态机。

## Git Operations

### 定位

> Git Operations 是一组简洁的 Git 行为约定：定义 Agent 执行已选定 Git Operation 时的安全默认值、硬边界和最小 evidence。

能力名称使用复数 **Git Operations**；其中一次具体动作称为一个 **Git Operation**。

它不是 Git 教程或完整操作手册，也不负责交付编排。Task Finish 决定正常收尾需要哪些 Git Operation 及其顺序；超出默认编排的场景由 Agent 根据实际事实推理。涉及语义、授权、重大风险或无法安全恢复的决定时，Agent 把决策权交给用户。

Git Operations 只在本次动作所针对的 repository 使用 Git，且 consumer 已选定 Git 动作时介入；没有 Git 的 repository 不加载、不执行它。它自身无状态，不创建 Git Operations Receipt；Task Finish等真实consumer维护自己的流程状态，Git Operations只返回本次操作结果。Task current records不是Git内容，也没有metadata publication consumer。

### 意图边界

| 用户或 consumer 的意图 | Git Operations 的默认解释 |
|---|---|
| commit / 提交 | 只创建或 amend 本地 commit，不 push |
| push / 推送 | 只推送已有 commit，不把 dirty 改动自动 commit |
| 提交并推送 | 依次完成适用的 commit / amend 与 push |
| Task Finish / 收尾 | 由 Task Finish 提供组合授权和默认编排，不对每个内部 Git Operation 重复询问 |
| 用户明确选择的普通 Git 内容 | 按consumer声明的精确scope commit或push，不扩大到Task current records |

目标 remote、source ref、target ref 和所需动作由直接用户指令或 Task Finish 等 consumer 决定；Git Operations 不自行选择交付目标。更具体的用户指令、Project / repository 规则高于这里的默认约定。

### Commit 与共享历史

- Commit 只包含当前 consumer 已确认归属且明确授权的改动：Task Finish时必须属于当前Task，其他普通Git consumer也必须提供精确scope。不得暂存、stash、reset或覆盖用户及其他Task的无关改动，也不能用`git add -A`代替范围判断。
- 同一文件混有不同归属的修改时，只有边界清晰才按 hunk 暂存；无法可靠分离时返回 `blocked`。
- 默认 commit message 使用简洁的 Conventional Commits：`<type>(<scope>): <subject>`，`scope` 和正文按需使用。message 描述最终内容而不是操作过程；amend 后语义变化时同步修正。Project、repository 或用户的更具体约定优先，语言选择继续由 Workspace 或用户规则决定。
- 同一 Task 在两次 push 之间默认只维护一个尚未共享的可变 commit，后续直接相关修改优先 amend，而不是新增 commit。
- **push 会冻结 commit。** 已经 push 或以其他方式共享的 commit 默认不再 amend、rebase 或改写；同一 Task 后续有新修改时创建新的本地 commit，在下一次 push 前继续 amend 该新 commit。
- 需要撤销已共享 commit 时默认新增 revert commit，不改写原 commit。发布合并 commit 等特殊历史整理只有在场景和授权明确时才执行。

### Rebase、集成与冲突

- Git Operations 不因为发现分支落后就自行发起 rebase。只有 Task Finish 的默认编排、用户指令或其他明确 workflow 请求时才执行。
- Rebase 默认只作用于当前 Task 尚未 push、尚未共享的本地 commit；已经共享的 commit 不自动 rebase。
- 默认采用线性集成：将 Task commit rebase 到当前目标最新事实之上，再 fast-forward 目标；不默认创建 merge commit。只有 Project 规则或用户明确要求时才使用 merge commit。
- 目标在操作期间再次前进、导致 fast-forward 失败时，返回最新事实供 caller 重新判断，不自动改用 merge commit。
- 冲突若能机械、无歧义地同时保留目标最新变化和 Task Intent，Agent 可以解决；若需要选择业务语义、丢弃行为、改变 Task Intent，或结果无法确定，则停止并交给用户。
- Git Operations 只报告实际 commit / tree / content 变化，不自行判断 Review 或 Verification evidence 是否继续有效，也不把交付变换擅自解释为新 Candidate；该判断留给 Task Finish 与对应专业能力。

### Push

- 执行 push 前核验实际 remote、ref 和将被推送的 commit，确保与 consumer 给出的目标一致。
- 同时核验 remote 与本地 ref 之间会被本次 push 发布的完整 commit range；存在当前 consumer scope 之外的未发布 commit 时返回 `blocked`，除非用户或明确上层编排已经授权一起发布。
- push 被拒绝时停止，不自动 force push、不改推其他分支，也不把失败伪装成未发生。
- 已经共享的 commit 遵守冻结边界；force push 默认不属于正常 Task Finish 路径，只有特殊场景和明确授权时才考虑。

### Result 与失败边界

每个 Git Operation 只返回适用的最小结果：repository、实际执行的 operation、操作前后 branch / commit identity、涉及的 remote / ref、working tree / history / remote 是否变化，以及 `succeeded` / `blocked` 与原因。不保存完整命令日志，也不要求所有动作填充同一套庞大 schema。

操作失败时必须保留并报告已经发生的部分效果和当前 repository 状态，不得静默切换策略：push 拒绝后不 force push，fast-forward 失败后不改 merge commit，dirty 状态下不自动 stash / reset，也不改用其他 branch。是否重试或恢复由 caller / Agent 决定；只有同一操作的暂态问题在重新核验事实后才可直接重试。

### 建设形态

第一版保持一个 **Skill-only** 的 `git-operations`，只覆盖上述已确认行为，不预先扩展 checkout、reset、cherry-pick、stash、branch 删除等完整命令集；真实需求出现后再迭代。既有 `git-ops` Skill、capability contract 和实现只作为事实参考，不约束新方案，可以在实现时删除或修改。

## Task Review

### 定位

> Task Review 是独立的语义与质量审查 Skill，通过 Planning Review 和 Completion Review 两个检查点，帮助 Agent 发现“方案或实现本身是否有问题”。

Task Review 不等于 Task Verification：Verification 回答当前实现是否通过实际可执行检查，Review 判断方案、实现和证据是否正确、完整并符合 Task Intent。它也不等于 Task Retrospective：Retrospective 面向未来同类工作的改进，不重新承担 Development 内的方案或 Candidate 审查，也不参与 handoff 门禁。

Task Review 只建设一个 `task-review` Skill，通过两种 Review 类型工作，不拆成两个模块：

| 类型 | 主要审阅对象 |
|---|---|
| Planning Review | Task Intent，以及提案、方案、设计、计划、tasks、capability contract 或任务实际涉及的其他规划资产 |
| Completion Review | 当前方案与 Planning Review 结论、实际实现、Verification evidence、相关事实，以及 current Candidate 是否仍符合 Task Intent |

Review 对象不能硬编码为 OpenSpec proposal、design、specs 和 tasks。Agent 与每个 Review 检查点必须根据 Task Intent、Project 权威事实、实际变更和风险动态确定审阅范围；简单任务没有正式方案文档时，可以审阅实现前形成的简要方向。

### 执行与结果

Task Review 默认可以由当前 Agent 自审；用户、Project 规则或任务风险可以要求独立 Agent 或人工审查。每份结果必须如实说明执行方式，不能把自审描述成独立审查。

每次 Planning Review 与 Completion Review 至少返回：

- Review 类型、目标 identity 与当前适用性；Planning Review 绑定当时的 Task Intent / plan context identity，Completion Review 绑定 current Candidate identity；
- 实际覆盖的审阅对象；
- 使用的 authority 与 evidence；
- 相关但未覆盖的对象及原因；
- findings 与真实结论；
- 自审、独立 Agent 或人工等执行方式。

单独一个 `passed` 没有充分含义。Review 正常完成后，即使结论为发现问题或 `blocked`，也属于完整结果；Review 中断、工具失败或没有形成完整结论时，检查点保持未完成。

### Review Result

Review Result是canonical Workspace中的本地轻量evidence，不是新的lifecycle receipt，也没有独立状态机。一个`task-review`能力使用同一closed Result模型，在Workspace SQLite中按Task ID和`planning|completion`定义两个可选current slots。没有执行某类Review时对应row不存在，不创建占位结果，也不要求两种结果同时存在。

- 同类型 Review 正常完成后，新结果直接覆盖旧结果，不保留历史版本；两种 Review 互不覆盖。
- Review 中断、执行失败或没有形成完整结论时不覆盖旧结果；旧结果若已不适用，也不能继续作为当前有效 evidence。
- Intent / plan context 或 Candidate identity 变化后，目标不再匹配的 Review Result 立即失效；新的 Review 只覆盖对应类型的 current 结果。
- Result 只持久化 Task/type、目标 identity、执行方式、reviewed/uncovered、findings、结论和系统完成时间；不保存 `revision`、`current`、`applicability`、历史或第二份目标快照。Application 通过调用方提供的当前目标 identity 派生 `current / stale / unknown`，并只在响应中返回 canonical bytes 的 `resultDigest`。
- 未来 Development Receipt 只引用两个 current Review Result 及其适用性，不复制 reviewed、uncovered 或 findings 明细。
- 已经用于正式 handoff 的 Review Result，未来 generation 快照最多冻结 `resultDigest`、目标 identity、执行方式与最小结论；覆盖 current 槽位不改写旧快照，也不要求 Review Result 自己增加 revision。

两个 current Result 由 Task Review Application 精确原子替换各自 slot；输入、序列化、替换或 post-read 失败时保留旧 bytes、另一 slot 及 Task Record/Environment/未知 sibling。Task Record 和 Task Environment 都不拥有或复制这些字段。

### 建设形态

当前保持 **一个语义 Skill + 一个确定性 Application**：`task-review` Skill 动态确定审阅对象、执行 Review 并如实形成完整输入；Application/CLI 只校验、记录和读取两个 current Result，不执行语义审查。Local App 只读管理两个槽位并生成 Agent action，不提供直接 Result CRUD。未来 Task Development 只决定何时调用、处理 findings，并把最小结果引用写入 Development Receipt，不内置审阅逻辑。

## Task Verification

### 定位

> Task Verification 读取 Project 已声明的现有验证能力，执行与明确交付目标相关的检查，并维护一份 Task-scoped current Verification Result。

它只回答“验证目标是什么、用了哪份声明、实际执行了什么、事实结果如何、整体结论是什么、对当前目标是否仍适用”。它不替代 Task Review、Task Environment 或业务验收，不决定风险是否可接受，也不写入 `proceed / blocked`、Task 顶层状态、Development Receipt 或 Candidate generation。

P0.4 交付 Result authority；P0.5 已把正式 consumer 切换为 Task Development。Development 先固定 policy，再请求对稳定 Content Target 的 Formal Verification，并只通过同一 Application reader 判断 target/declarations 与 policy facts 是否 current、完整。Task Finish 不再读取、补做或记录 Verification。

### Verification Capability Declaration

每个 Project 可以用根目录 `verification.yml` 声明自身及所属 Service 已经存在的测试验证能力，schema 为 `buildr.project-verification/v2`。Buildr 只引用已有命令、脚本、CI wrapper 或有界 Agent 操作，不根据技术栈发明测试，也不在 Verification 中开发缺失测试。

每项 capability 首版只保留：

| 信息 | 内容 |
|---|---|
| identity | Project 内稳定 capability id，可选 title |
| scope | 明确的 Project 与 Service scope；空 Service 列表表示 Project-wide |
| invocation | 有界 `command` 的 argv/cwd，或有界 `agent` instructions |
| applicability | Project-relative path patterns，以及确有需要时的条件说明 |
| proves | 该能力实际能够证明的事实 |
| delivery policy | `requiredForDelivery: true / false` |
| optional boundaries | 确有需要时的 environment、effects、authorization 与 resource claims |

声明是 closed schema。旧 `mode`、`maturity`、`stages`、`enforcement`、`coverage`、`sources`、`dependsOn` 和 `supersedes` 不再读取。声明缺失或没有适用能力时只形成 coverage gap；不得自动创建测试，也不得把 gap 改写成通过。声明存在但无效时 fail closed，不能执行其中能力。

第一版不固化 `minimal / affected / candidate` 等通用验证层级，不建设通用 DAG、调度器或资源平台。现有 Product DAG 只保留在自身 test harness；production runner 按显式 capability 列表执行。资源协调只在真实 capability 声明 claim 时启用，是 execution 实现细节，不是 lifecycle authority。

### Execution Evidence

`verification run --project <project> --capability <id> --target-identity <identity>` 只执行显式选择的 command capability，并在 provider-owned 临时目录产生 transient `buildr.verification-execution/v1` evidence，不提供 caller-managed output writer。`effects.authorization: explicit` 与 explicit resource 分别要求精确 capability/resource 授权。完整 stdout/stderr、命令、耗时、临时路径、授权、资源获取和诊断都留在 execution evidence，不复制进current Result。

Execution 完成与 Result 发布分开：

- 所有选中能力得到终态事实后，caller 才能提炼完整 Result；
- 中断、进程未形成终态或 Result 写入失败时，不覆盖 current Result；
- execution evidence在消费后按现有cleanup边界清理，不作为current authority；
- Agent invocation 可以形成事实，但 Development/Finish 都不能伪造或代替该专业执行。

### Current Task Verification Result

每个Task在Workspace SQLite中只有一个current Verification row，schema为`buildr.task-verification-result/v1`。

| 字段 | 最小事实 |
|---|---|
| Task | `taskId` |
| target | 明确、opaque 的 Content Target identity 与简短目标说明 |
| declarations | 实际采用的 Project、声明路径与由 Application 观察得到的声明 identity |
| capabilities | 实际执行的 Project/capability、`passed / failed` 与精炼事实 |
| gaps | 没有能力或未覆盖 scope 的 coverage gap |
| conclusion | `passed / not-passed` |
| completion | `completedAt` |

Result 不保存 stdout/stderr、临时路径、Environment Receipt、执行资源、用户风险决定、任务推进决定或 Candidate generation。它也不保存 history、持久 revision、局部 patch、merge/CAS 协议。

Task Verification Application 是该 slot 的唯一 writer/reader：

- `record` 从当前 Task 与 Project registry 解析 scope，并自行读取、校验和计算 declaration identity；CLI、Skill 或 caller 不能注入 declaration digest；
- 每次 record 都校验完整 closed Result，然后用临时文件、rename 和写后回读执行整值原子替换；
- 序列化、写入、rename 或写后验证失败时回滚到原 current，不能留下半份或覆盖已确认结果；
- `inspect` 同时返回 stored Result 与派生 applicability，不改写持久文件。

Applicability 只有 `current / stale / unknown`：

- 没有 Result 时为 `unknown`；
- caller 提供的当前 target identity 与 stored target 不一致时为 `stale`；
- 当前 Project declaration identity 与 stored identity 不一致、声明缺失或无效时为 `stale`；
- 两者都匹配时为 `current`。

目标或声明变化不会静默刷新 Result。Service scope 与 capability identity 都按当前 Project declaration 校验；多 Project Task 分别绑定各自 declaration identity。

### 共享 consumer

CLI、`task-verification` Skill、Local App“证据”视图的验证结果区块和 Task Development 都调用同一个 Task Verification Application：

- CLI 提供稳定的 `task verification inspect|record` JSON family；
- Skill 负责选择已有能力、运行 transient execution、提炼完整 Result，并在不存在能力时报告 coverage gap；
- Local App 只读投影 current Result 与 applicability，并提供受限 Agent prompt，不建立第二 writer；
- Task Development 形成 policy、请求 Formal Verification，并只消费绑定当前 Content Target/declarations 且具备全部 policy facts 或 coverage gaps 的 Result。`not-passed`/gap 不阻止 Candidate freeze，但没有精确风险接受时阻止 `proceed`。

Task Verification 不创建 Candidate、不递增 generation、不改 Task 状态，也不保存 `proceed / blocked` 或用户风险决定。Task Finish 只消费研发交接，Formal Verification execution count 为 0。

Application 在 canonical Workspace 写 current Result 后，retained source clean 继续按既定 Workspace Local Data Store 边界排除未 staged 的 `.buildr/**`；源码/文档 dirty 与 staged metadata 仍阻塞。Finish 不 stage、commit、发布、修改或丢弃 metadata，exact owned-path publication 仍由 P0.7 单独实现。

### 副作用与授权

普通本地测试、自然退出的临时文件和隔离 fixture 属于 capability 声明的常规 effects。涉及外部系统、共享环境或持久业务数据时，声明必须显式写明边界并要求 explicit authorization；凭证不进入声明或 Result。Task Environment 继续拥有长期进程、端口和动态资源的准备与清理，Verification 只使用已经授权的有界能力。

### 建设形态

P0.4 保持 **Project declaration + transient execution + current Task Result + 一个 Application authority**。同一 Change 完成旧 v1 声明、固定 assurance、旧 run schema、旧 plan/DAG lifecycle、旧 Finish summary 输入与重复文档的迁移或删除，不留下双 writer、双 schema 或兼容 mutation path。

## Task Retrospective

### 定位

> Task Retrospective（任务复盘）不是再次检查任务做得对不对，而是基于本次 Task 的真实事实，识别能让未来同类工作更正确、更高效或更安全的改进。

Task Review 与 Task Verification 面向当前方案、实现和 Candidate；Task Retrospective 面向任务暴露出的未来改进。它不是 Development 检查点，不参与 Candidate handoff，也不自动修改 Rule、Skill、Project 或产品能力。复盘是否执行、是否成功写入、是否形成候选本身不构成 Task Finish、Task 终态或 Task Environment 清理的门禁；复盘意外暴露当前交付问题时，仍按下文的当前 Task 问题边界处理。

现有 Task Asset Review 只作为迁移参考。新能力不沿用“只审查工作资产”的范围，也不沿用 observation inbox、固定候选类型、`awaiting-human`、强制 accept / reject、独立任务 handoff 或 Finish cleanup 前门禁。

### 持续观察与最终扫描

Task Retrospective 延迟加载，不在每个 Task 开始时预先加载完整 Skill：

- 任务过程中出现具体高价值线索时，Agent 首次加载 Skill，以精炼事实和最小 evidence 记录线索；当时不强制分类或作最终结论。
- 用户明确要求复盘时，Agent 加载 Skill 处理当前 Task 已有事实。
- Task 完成或放弃后，由结束 Task 的 Agent 或上层编排者加载 Skill 执行一次最终扫描；存在 Environment Receipt 时，必须先完成适用环境处置或明确保留。cleanup blocked 等非终态不触发最终扫描。
- 此前没有过程线索，也仍执行最终扫描；确实没有候选时形成 `no-candidate`，不能因为没有提前记录就声称没有复盘价值。

最终扫描只读取 Task Intent、实际 Project / Service 范围、最终改动、Receipts、Review / Verification evidence、用户纠正、返工和真实执行摩擦等高信息量事实，不重放完整历史。用户可以明确要求跳过最终扫描；跳过、Skill 不可用或记录失败都必须如实报告，不能伪造 `no-candidate`，也不改变 Task 终态。

用户明确跳过最终扫描时，已有 Task ID 仍保留一份最小记录，说明未执行及对应用户决定；它不是 `no-candidate` 结论。

只有已经存在 Task ID 的正式 Task 才默认形成复盘记录，包括正常交付、`completed + no-change` 和最终放弃的 Task。纯讨论、只读探索、单次测试、临时启动服务、调用 API、简单问答或其他没有 Task ID 的互动不创建记录，Task Retrospective 也不为复盘单独补建 Task ID。

### 复盘视角

第一版提供四个非封闭、可重叠的观察视角，帮助 Agent 根据 Task 事实动态选择，不要求逐项检查或填写固定分类：

| 视角 | 主要观察内容 |
|---|---|
| Project / Service 演进 | 产品能力、领域知识、架构、服务边界、职责归属和长期事实 |
| 工程基础 | 代码规范、模板、公共实现、测试、验证声明、构建和工程工具 |
| 工作资产与任务机制 | Rules、Skills、capability contracts，以及 Triage、Environment、Development、Review、Verification、Finish 等任务机制 |
| Agent 协作与执行效率 | 人与 Agent 的对齐成本，Buildr 提供上下文和默认编排的效率，以及重复读取、推理、调用、等待、返工、时间和 Token 消耗 |

一个发现可以同时来自多个视角，最终改进落点也不受视角限制。正向有效做法可以成为复用候选；已有做法可以被简化、替换或删除。第一版不把候选硬分为“长期改进”与“时效性适配”，也不要求预测有效期或下线时间；只忠于当前证据，明显依赖特定 Agent、模型或工具行为时说明前提，后续再根据新事实修订或移除。

### 线索与改进候选

任务过程记录的是待复盘线索，只有最终扫描后才形成改进候选。候选至少需要同时满足：

- 有具体事实和 evidence，不是泛泛感想；
- 对未来同类工作有复用价值，或揭示了重要的系统性风险；
- 能说明建议作用域和可执行的下一步；
- 没有被当前 Task 或既有事实完整处理和覆盖。

候选不使用 `rule / skill / capability-contract / product-followup` 等固定类型。Agent 根据实际事实描述问题或机会、未来价值、建议作用域和动作；以后出现稳定聚合需求时再评估结构化分类。

形成新候选前，Agent 可以扫描现有 `open` 候选。明确属于同一作用域和同一根本问题时，本次复盘保留新增 evidence 并引用已有候选，不再创建第二个独立候选；无法确定时分别保留，不能猜测合并。已经 `closed` 的问题再次出现时，创建新的 `open` 候选并关联旧记录。

### 当前 Task 问题边界

Task Retrospective 不主动重复 Completion Review，但如果复盘意外发现当前 Task 实际没有满足 Task Intent，必须先处理当前交付问题，不能把它包装成未来改进候选：

- Task 终态前已经发现时，按当前生命周期边界交给 Development、Review 或 Verification 处理；Candidate 已 handoff 给 Finish 后，普通授权必须先取得用户同意才能返回 Development 形成新 Candidate，Goal 级持续授权才可以在原 Task Intent 内自主循环；
- Task 终态后才发现时，立即向用户披露具体问题、evidence 和影响；原 Task 不重新打开，需要修改时创建引用原 Task 的 correction / continuation Task，用户也可以决定暂不处理。Task Retrospective 不自行改写完成事实。

当前问题披露后，Agent 再基于 evidence 判断是否同时存在 Completion Review 覆盖缺口、Agent 能力限制或任务机制问题。原因无法确定时记录未知，不能简单归因于“Review 有缺陷”或“Agent 不够智能”。

### 复盘记录

Task Retrospective 使用 Task ID 在 canonical Workspace 维护自己的记录：

```text
.buildr/retrospectives/<task-id>.*
```

Task Retrospective Skill 是唯一 writer；其他模块只提供事实或读取结果。Task Record v1 不保存 Retrospective reference 或摘要，Task Retrospective 也不修改 Task 顶层状态。Local App 以后通过 Task ID 聚合展示。

### 候选处理与用户呈现

任务结束回复只提供简短复盘结果：没有候选时一句话说明；存在候选时列出标题、核心依据、建议方向和复盘文件位置。复盘不自动创建新 Task、不修改 Rule/Skill/产品能力，也不成为 Finish、cleanup 或 Task 终态门禁。

### 建设形态

P2.1 建设 `task-retrospective` Skill 与最小 Workspace 记录，并在同一个 Change 中接管观察 authority、处置仍需保留的旧 observation、移除 Asset Review 对 Finish/cleanup 的门禁及旧 mutation/routing/binding。不是先并行保留两套 writer，再到后续批量清退。

Retrospective如需团队协作，由未来Server/Cloud能力独立设计；不恢复Git metadata publication或本机SQLite同步。

## 实施与验证顺序

### 总体纪律

后续开发采用“一个模块、一个正式任务、一个窄 OpenSpec Change、一次独立交付”：

1. 每个 Change 只有一个主要模块和一组可独立验收的结果；可以修改该模块必需的集成点和重叠旧能力，但不提前实现其他后续模块。
2. 当前模块完成设计、实现、受影响验证、模块专项 E2E、Candidate 验证、集成和 retained runtime 投射后，才把它标记为“已交付并生效”，再基于最新 current specs 推进下一模块。
3. 单个模块过大时可以拆成同一模块内的顺序子 Change；不能创建覆盖整份 Roadmap 的长期总 Change。
4. 每个模块只把已经实现并验证的事实同步到 canonical specs，不提前把后续目标写成当前产品事实。
5. 新模块交付后立即成为自己事实范围内的 authority，不作为等待 P0.8 的 preview。
6. 到达已有旧模块时，同一个 Change 必须完成必要事实迁移/历史读取、consumer/routing 切换和旧 mutation path 删除；不把已知清退工作积压到主闭环以后。
7. task worktree/branch 中的源码、Skill、contract 和功能模块只是候选；可以投射到同一 task worktree 的任务验证 Workspace，并在独立 Agent session 中验证候选 runtime，但不能写入 retained/peer checkout。只有实现完成并集成到 retained checkout 后，从 retained Product source sync/render/doctor 才对自举主 Workspace 的 Agent runtime 正式生效。

### 本轮架构审查结论归属

下表把 P0.1 实现审查与任务环境讨论中的结论固定到唯一 owner，防止当前模块越界，也避免后续遗漏：

| 结论 | 归属模块 | 当前处理 |
|---|---|---|
| Task Record只拥有SQLite `tasks`与规范化关系表；专业current records进入同库但由各自Application/repository独占；区分数据库未初始化、记录不存在、有效记录和schema/integrity failure | Task Record / Workspace Structured Store | 已按连续migration与独立writer边界收敛 |
| canonical Workspace 不能靠 `.worktrees` 字符串猜测；Git target 使用 `git-dir/common-dir` 拓扑 | P0.1 Task Record | 当前 Change 修正 repository 与测试；非 Git Workspace 继续支持 |
| Task CLI 只做参数/输出适配，Application 保持共享 use case | P0.1 Task Record | 当前 Change 拆分 CLI interface |
| 候选 source 可投射自身任务验证 Workspace，并可在其内部测试隔离的模拟用户 runtime；不得写 retained、peer checkout 或外部共享用户 runtime | P0.1 自举安全边界 | 当前 Change 以 checkout 拓扑与 runtime target 路径关系增加确定性写前保护；不写入 Task Record |
| `.worktrees/` 容纳多个任务；每个 `.worktrees/<task-id>` 可同时作为 checkout、执行根和任务验证 Workspace 根 | P0.2 Task Environment | Roadmap 记录；由 Environment Receipt/provider 改造 Change 实现 |
| Environment Receipt 统一 ready、恢复、runtime projection、动态资源和 cleanup；旧 worktree-centric v1 receipt 一次性迁移退出，长期只保留新的窄 Git provider evidence | P0.2 Task Environment | Roadmap 记录；不加入 Task Record，同 Change 完成迁移和旧 writer/routing 清退 |
| 保留工作区 Buildr 环境管理器是 Task Environment 的受信执行入口；其 fingerprint 不是 Task 来源基线或 target revision，轮换不得自动更新任务 checkout | P0.2 Task Environment | 固定术语和边界；具体 fingerprint 轮换协议由后续窄修正处理，不扩入 P0.3 |
| worktree 只隔离工作树/index；Git refs、进程、端口、用户级 runtime、凭证等仍可能共享 | P0.2 Task Environment | Roadmap 记录；后续按真实资源协调 |
| Agent invocation 只能由有界 Agent 操作形成事实；文件投射或 Environment ready 本身不等于 capability 通过 | P0.4 Task Verification | v2 declaration 可声明 bounded Agent invocation；P0.5 由 Development 请求正式执行，Finish execution count 固定为 0 |
| worktree、任务验证 Workspace、task-scoped runtime 和 session 是执行资源，不是 Content Target 或 Task Candidate | P0.5 Task Development / Candidate | 已由 Candidate contract、observer 与非 Git fixture 固化 |
| Task current records只在canonical Workspace SQLite持久化，不发布、不进入Git、不进行本地多机同步 | Workspace Structured Store | 已清退Metadata Publication provider、binding、helper、tests与runtime投射 |
| `.buildr/`是Workspace Local Data Store；Structured Store承载Task current state，File Store继续承载Environment/Finish等明确本机事实 | Task Store / Task Environment / Task Finish | 保持owner分层，不建立双authority或通用数据库框架 |
| 自举主 Workspace 的正式 runtime 激活只能发生在内容进入 retained source 之后 | P0.8 Task Finish / Workspace Foundation | P0.1 只阻止候选越权投射；最终交付与 retained sync/doctor 仍由交付边界完成 |
| target advancement 不自动更新 Environment，也不自动使 Candidate stale；Finish 在隔离 carrier deterministic reuse、Delivery Adaptation 或 exact-token target-race resume，不在原 Task worktree rebase、重验或生成 Candidate | P0.5 Task Development / Candidate、P0.8 Task Finish | 已固定 applicability 与交付基线分层；只有 Development Application 报告真实 stale 才返回 Development |
| Local App 在 Task 详情展示当前机器 Environment 时调用 Environment Application，不复制进 Task Record | P0.2 Task Environment | 已交付只读“环境”视图、Workspace-scoped API 与本机不可用状态 |
| Local App 通过各模块 reader 组合 Development、Review 与 Verification，不复制进 Task Record | P0.5a Local App 专业投影 | 固定“概览、研发、证据、环境”四个一级视图；Development 保持只读，Review/Verification 在证据视图独立加载 |
| Local App 展示 Parent/Children 时调用 Task Record Application 的直接关系 read model，不在 Web 层推导或复制 | Parent Task / Local App | 延续既有四视图边界；关系编辑仍复用 Task writer，不重建专业 reader/API |

### 开发交付跟踪

本表只跟踪已经完成的事实。Change 已创建或规划已确认不等于功能已生效。

| 顺序 | 模块 / Change | 当前状态 | 已交付并生效内容 | 对应旧能力处置 |
|---|---|---|---|---|
| P0.1 | Task Manager / Task Record / Local App `introduce-task-record` | 已交付并生效（2026-08-01，`dev@2448db0`） | 已交付稳定 Task ID、最小 Task Record 逻辑模型、唯一 Task Record Application、`task-manager`、CLI 五个确定性动作和 Local App Task 列表/详情/受控管理；后续 SQLite Task Store Change 将持久化切换到 Workspace Structured Store | 旧 `task.yml` 在 SQLite 切换后保持 inert，不迁移、不读取、不双写、不删除 |
| P0.1a | Parent Task `introduce-parent-task` | 实现中（2026-08-04） | 在 SQLite Task Store 上增加单 Parent/多直接 Child、循环保护、Task Manager/CLI/Local App 双向查看与维护；讨论稿当前方向改为协调 Task + dynamic projection | 不创建独立 Board Domain，不迁移旧数据，不传播 Parent/Child 生命周期 |
| P0.1b | Local App Task 轻量查询 `simplify-and-optimize-local-app-task-list` | 已收敛（2026-08-05） | Local App 列表/详情首屏改为固定批量 SQLite stored-state projection，加入封闭过滤、派生直接 Child 数量、竞态防护和 Parent 候选延迟读取 | 删除 Local App Task create UI/route；CLI、Task Manager 五个 action、完整 inspect 与专业 currentness authority 保持不变；不增加 migration、物化计数或缓存 |
| P0.2 | Task Environment `introduce-task-environment` | 已交付并生效（2026-08-02，`dev@29f9c74`） | 已交付唯一 Task Environment Application、薄 CLI/Skill、Environment Receipt、真实 ready/恢复/runtime projection、动态资源与 cleanup、Local App 环境页签、Task-scoped Change Resolver 和窄 Git provider；retained runtime 已同步并通过 Doctor | 已按 A=1/B=1/C=31/D=0 完成一次性迁移；删除旧 environment writer、receipt authority、routing、JSON/help 与 consumer 残留，旧 worktree 能力仅保留为窄 Git provider evidence |
| P0.3 | Task Review Result `introduce-task-review-results` | 已交付并生效（2026-08-02，`dev@7764a99`） | 已交付一个 Task Review Application、Planning/Completion 两个可选 current Result 槽位、最小 closed schema、明确 target identity、执行方式、覆盖、findings、结论与派生适用性；CLI、`task-review` Skill 和 Local App 任务 Review 管理复用同一 authority，retained runtime/CLI/Local App 已安装并通过 Candidate verification、Doctor 与真实 Result 写入回读 | Task-scoped Change 审查已切到 Planning Review；删除冲突旧 task-review route/store/schema/test，全局 retained-only generic Change review 与 Task Asset Review 保留各自 authority |
| P0.4 | Task Verification Result `introduce-task-verification-results` | 已交付并生效（2026-08-03，`introduce-task-verification-results`） | 已交付 Project declaration v2、显式 transient execution、唯一 Task Verification Application、原子 current Result、target/declaration staleness、CLI 与 Local App；P0.5 已把正式 lifecycle consumer 切换为 Development | 删除旧声明 v1、固定 assurance/层级、旧 run schema、声明级 plan/DAG、Finish summary 输入和重复 writer；Product-only DAG 留在 test harness，真实资源协调按 claim 保留 |
| P0.5 | Task Development / Candidate `introduce-task-development-candidate` | 已交付并生效（2026-08-04） | 已交付唯一 Task Development Application/Receipt、通用 Content Target observer、verification policy、Task Candidate/generation、gates/decision、append-only immutable handoff、internal driver 与非 Git/no Change System fixture；Formal Verification 先于 Candidate freeze，Completion Review 绑定 Candidate | Development 成为唯一 Candidate/decision/handoff authority；Verification/Review 保留 Result authority；Finish 收窄为 v2 handoff adapter，删除旧 Verification、Change convergence、Candidate/risk mutation path |
| P0.5a | Task Development Local App 投影 `project-task-development-in-local-app` | 已交付并生效（2026-08-04） | 新增 Workspace-scoped Development inspect API；Task 详情收敛为“概览、研发、证据、环境”；研发展示候选、门禁、决定与最近交接，证据组合 Review/Verification，专业术语中文优先 | 删除 Review/Verification 独立一级页签；不新增 Development writer、CLI、二级页签、历史浏览器或生命周期状态 |
| P0.6 | Git Operations `formalize-git-operations` | 已交付并生效（2026-08-04） | 已交付唯一 Skill-only `git-operations` / `buildr.git-operations/v1`、consumer-selected operation 边界、精确暂存、commit/push 分离、完整 push range、共享冻结、最小 Result 与部分失败 evidence；retained runtime 已同步并通过 Doctor | Task Finish optional dependency 与 Buildr 产品入口已迁移；删除 `git-ops` 和三项旧 contracts/bindings/router/schema，`git-worktree-provider/v1` 保持独立 |
| P0.7 | Task current-record SQLite收敛 `consolidate-task-current-records-in-sqlite` | 已收敛（2026-08-05） | Development、Verification与Planning/Completion Review current records通过连续migration进入Workspace SQLite；各专业Application与Local App reader边界不变 | 旧YAML保持inert；Task Metadata Publication source、contract、binding、helper、tests、spec与runtime整体清退 |
| P0.8 第一阶段 | Task Finish `simplify-task-finish-delivery-boundary` | 已收敛（2026-08-04） | current specs、Roadmap、CLI help、package/runtime 与 residual verification 统一为现有 v2 delivery boundary；保留单一直接接线 Product/Git adapter、Delivery Adaptation、exact-token target-race resume、remote readback、retained activation 与 Environment cleanup | 审计 active run/Application/CLI/registry/compose/schema/managed mutations/capability graph；没有真实可达旧 writer/router/binding，故以 zero-delete evidence 关闭，不制造 framework 或迁移 |
| P1.1 | Structured Task Board 有限探索 | 延后，等待真实缺口 | 无 | 仅在非 Task 规划项、多协调者成员、显式依赖、稳定排序/分组或跨 Task 决策记录无法由 Parent/Child 覆盖时再提案 |
| P1.2 | 其余专业投影 | 未开始 | 无 | 基于既有四视图按真实缺口扩展，不预设 Board 页面，不重建 Development/Review/Verification/Environment authority |
| P2.1 | Task Retrospective `introduce-task-retrospective` | 未开始 | 无 | 同 Change 替换并清退 Task Asset Review |
| P2.2 | Local App Retrospective Projection | 未开始 | 无 | 只读投影，不新增 writer |
| 最终审计 | lifecycle residual audit | 未开始 | 无 | 只检查残留；发现问题归回 owner 模块修复 |

### 阶段 0：共同实施约束

阶段 0 不创建 `task-lifecycle-v2` 总 Change，也不预先创建全部后续 Change。跨模块共同遵守：

- 所有模块共享稳定 Task ID，但每类事实只有一个 owner；
- Task Record Application 只维护最小 Task Record，Task Manager/CLI 与 Local App 是客户端，不保存 Environment 或专业 records；
- 能稳定固化的 schema、校验、状态转换、路由和副作用进入产品/contract/fixtures，不让 Agent 反复推理；
- 一个 Task 可以关联 `0..N` 个 `project/change`；P0.1 只做当前记录内限定与去重；
- Candidate generation 只由 Task Development 创建和递增；
- Review Result 按目标 identity 失效；Verification Result 按 target 与 Project declaration identity 失效；
- Task Finish 只消费研发交接，不创建或收敛 Change，不发起 Verification；
- commit、push、PR和Board状态都不单独等于Task完成；
- 持久 revision、跨 Task Change ownership 与 publication 协议不作为所有记录的预设共同机制；P0.1 只为真实 Local App 陈旧页面提供非持久 `recordDigest`，其他 owner 模块按实际需要决定；
- 每个模块在自己的 Change 中完成 authority 切换和重叠旧能力清退。

### P0：任务主闭环

| 顺序 | 单一模块与建议 Change | 本次只完成 | 最小模块验收与旧能力处置 |
|---|---|---|---|
| P0.1 | Task Manager / Task Record / Local App `introduce-task-record` + `introduce-parent-task` + `simplify-and-optimize-local-app-task-list` | Task ID、最小 Task Record、唯一 Task Record Application、`task-manager`、产品化 create/inspect/update/complete/abandon、Local App Task 轻量列表/详情与已有记录编辑/完成/放弃、三态/no-change、`0..N` 个 `project/change`，以及单 Parent/多直接 Child；正式 Task 只由 Agent/Task Manager 创建，当前以本机 SQLite 规范化持久化，不含通用依赖图、Environment、专业 references、持久 revision、跨 Task Change ownership或同步 | CLI/Task Manager 保留五个 action 与完整 inspect；Local App 复用同一 Application 的 stored-state query projection 和有限 writer，不提供 create；SQL schema、foreign keys、迁移 ledger 和完整性 fail closed；陈旧页面冲突刷新；关系拒绝自引用/循环/terminal 新 Parent；Parent/Child 生命周期独立；linked worktree 不得成为 authority |
| P0.2 | Task Environment `introduce-task-environment` | Task 级 Environment Receipt、唯一 Application、薄公共 CLI/Skill、`.worktrees/<task-id>` 任务验证 Workspace、真实 ready 探测、task-scoped runtime projection identity、Task-scoped Change Resolver、Local App 只读环境页签、串行恢复、资源登记和 cleanup | 创建 Task → 保留工作区 Buildr 环境管理器准备环境 → 候选 Change 可被 Task 范围解析 → Local App 查看本机环境 → 候选投射自身 runtime → 跨 session 恢复 → Finish/放弃 cleanup；同 Change 将 task-worktree 收窄为 Git provider，按 A/B/C/D 一次性迁移旧 v1 receipt，并删除旧 environment mutation/routing/help/JSON/consumer；不把 worktree 称为主/retained/开发 Workspace 或 Agent runtime |
| P0.3 | Task Review `introduce-task-review-results` | 一个 Result 模型、Planning/Completion 两个可选 current 槽位、目标 identity、执行方式、覆盖、findings、结论与派生适用性；无持久 revision/history，不编排 Development、Candidate 或门禁 | 两类 Result 可独立存在并绑定明确目标；同类型完整替换、跨类型隔离，中断不覆盖 current；Task-scoped Change 单次切到 Planning Review，全局 generic Change review 与 Task Asset Review 保留各自 authority；同 Change 删除或迁移冲突的旧 Review route/store/test |
| P0.4 | Task Verification `introduce-task-verification-results` | Project declaration v2、transient execution evidence、一个 current Verification Result、Content Target/declaration identity 与派生 applicability；不包含推进决定、Candidate generation 或 Environment Receipt | 真实 command/Agent facts 可提炼完整 Result；中断或写入失败不覆盖 current；target/declaration 变化派生 stale；CLI、Skill、Local App、Development consumer 共用唯一 Application；删除旧 assurance、run/plan/DAG lifecycle、summary 输入与重复 schema |
| P0.5 | Task Development / Candidate `introduce-task-development-candidate` | Development Receipt、`0..N` Change 处置、Content Target/policy、Candidate identity/generation、三个 gates、decision 与 immutable handoff；明确 control metadata/carrier/runtime/session 不是 Candidate | Environment ready → Planning Review → stable Content Target/policy → Formal Verification → generation 1 Candidate → Completion Review → proceed handoff；非 Git/no Change fixture 证明通用边界；Finish v2 adapter 只消费 handoff且 formal execution count 为 0 |
| P0.6 | Git Operations `formalize-git-operations` | 单次 Git operation 授权、安全边界、前后 identity 与最小 Result | 精确暂存；commit/push 分离；不 force push；同 Change 迁移有效安全约束并删除冲突旧 capability/binding/router/schema |
| P0.7 | Task current-record SQLite收敛 `consolidate-task-current-records-in-sqlite` | 四类专业current records进入SQLite，保持独立Domain/Application/writer；不建设history、同步或通用框架 | fresh/continuous schema、foreign key、slot isolation、rollback、旧YAML inert、Local App/lifecycle consumer与publication residual验证 |
| P0.8 第一阶段 | Task Finish `simplify-task-finish-delivery-boundary` | 收敛现有 v2 delivery boundary；保留直接 Product/Git adapter，不新增非 Git、多交付单元、PR/release/deploy、adapter registry 或 Finish Receipt | canonical/current/package/help 一致；正常路径单次 CLI，Delivery Adaptation 与连续 target race 复用同一 Candidate/handoff，formal Verification 为 0；审计真实旧 writer/router/binding 并仅在存在时删除 |

P0.1 到 P0.8 分别在各自交付时切换自己拥有的 authority。过渡期允许“新 Task Record + 尚未替换的专业模块”组合，但同一类事实不能有两个 writer；P0.8 不再承担统一默认 authority 切换。

### P1：协调、投影与交互

| 顺序 | 单一模块与建议 Change | 本次只完成 | 最小模块验收与旧能力处置 |
|---|---|---|---|
| P1.1 | Structured Task Board 有限探索（条件触发） | 只验证 Parent/Child 是否已无法覆盖经过实际使用证明的协调需求；不预设实现或创建 Change | 仅当非 Task 规划项、多协调者成员、显式依赖、稳定排序/分组或跨 Task 决策记录成为真实缺口时，才决定是否需要独立 Domain |
| P1.2 | 其余专业投影 | 在既有“概览、研发、证据、环境”任务信息架构上按真实缺口补充专业 records 只读投影 | Task-owned 编辑继续通过 Task Record Application，Environment 与证据继续只读调用既有 reader；不因页面需求预设第二份 authority |

P1 不再预设 Local App Board Change。Parent/Child 层级投影随 Task Record Application 一起交付；其余专业投影按真实缺口创建窄 Change。

### P2：复盘与残留审计

| 顺序 | 单一模块与建议 Change | 最小验收与旧能力处置 |
|---|---|---|
| P2.1 | Task Retrospective `introduce-task-retrospective` | 每个 Task 最多一份记录；覆盖无候选、开放/关闭、跳过和失败；不自动创建新 Task；同 Change 处置未决 observation、切换观察 authority、移除 Finish/cleanup 门禁并删除 Asset Review Skill/helper/template/contract/binding/mutation tests |
| P2.2 | Local App Retrospective Projection `project-task-retrospective-in-local-app` | 只读展示复盘结论与本机缺口；不修改复盘记录，不自动关闭候选，也不成为第二份 authority |
| P2.3 | 生命周期残留审计 `audit-task-lifecycle-residuals` | 纯负向检查 manifest、runtime、CLI、public JSON、specs、docs 和 tests 是否仍路由旧 authority；不预设批量删除，发现残留就归回对应 owner 模块创建窄修复 Change |

旧测试不整体删除。禁止 force push、精确归属、部分交付效果保留、Candidate 失效停止写入和 cleanup ownership 等仍有效安全不变量，必须在对应新模块 Change 中迁移；只删除绑定旧 shape、旧 mutation path 或旧协议的断言。
