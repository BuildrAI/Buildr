# Buildr 产品验证质量

## Purpose

定义 Buildr 候选版本的 Node/操作系统验证范围、正式 tarball 生命周期 smoke，以及可观察但不阻塞的验证耗时记录。

## Requirements

### Requirement: CI 必须覆盖最低 Node、当前 Node 和目标桌面平台
Buildr CI MUST 在 Linux Node 20 和 Node 22 上运行完整产品候选验证，并 MUST 在 macOS、Windows Node 22 上运行可移植 release smoke；CI MUST NOT 为已经由 Linux Node 22 完整验证覆盖的相同 release lifecycle 建立独立 Linux smoke job。

#### Scenario: 验证最低 Node 版本
- **WHEN** push 或 pull request 触发产品 CI
- **THEN** Linux Node 20 job MUST 安装锁定依赖和支持的 OpenSpec CLI
- **AND** job MUST 运行完整产品候选验证

#### Scenario: 验证当前 Node 与桌面平台
- **WHEN** push 或 pull request 触发产品 CI
- **THEN** Linux Node 22 MUST 运行完整产品候选验证
- **AND** macOS、Windows Node 22 MUST 运行 standalone release smoke
- **AND** 桌面平台 job MUST NOT 重复运行只依赖 Node 和产品源码的 unit tests

### Requirement: release smoke 必须验证安装后生命周期
Buildr MUST 提供不依赖 development checkout runtime 的跨平台 release smoke，使用 standalone npm pack 或同一候选 run 提供的不可变正式 tarball，并使用安装后的 `buildr` 完成初始化、同步、诊断、optional Component 卸载和最终诊断。

#### Scenario: standalone verifier 从候选生成 tarball
- **WHEN** 维护者或跨平台 CI 独立运行 release smoke
- **THEN** verifier MUST 执行 `npm pack` 并将 tarball 安装到隔离 prefix
- **AND** 安装后的 CLI MUST 完成 `init --agent`、独立 `sync` 和 `doctor --json`
- **AND** 安装后的 CLI MUST 卸载一个 optional Component 并再次运行 `doctor --json`
- **AND** 两次 doctor MUST 没有 error

#### Scenario: candidate verifier 提供共享 tarball
- **WHEN** release smoke 收到同一冻结候选 run 生成的 tarball
- **THEN** verifier MUST 直接安装该 tarball，而不是再次执行 npm pack
- **AND** verifier MUST 完成与 standalone 模式相同的安装后生命周期

#### Scenario: release smoke 跨平台运行
- **WHEN** verifier 在 Linux、macOS 或 Windows Node 22 运行
- **THEN** verifier MUST 使用平台对应的 npm executable 和 installed bin 路径
- **AND** verifier MUST NOT 依赖 Bash、Unix-only 临时目录命令或固定 `/tmp` 路径

### Requirement: OpenSpec fixture case 必须只有一个 Candidate owner
Buildr Product MUST 将 OpenSpec contract 与 convergence/recovery fixture 划分为互斥 case 集合；完整 Candidate 中同一个 named case MUST NOT 由两个 verification step 重复执行。

#### Scenario: 完整 Candidate 执行 OpenSpec fixtures
- **WHEN** Candidate 同时选择 `openspec-contract-fixtures` 与 `openspec-convergence-recovery`
- **THEN** 两个 step MUST 调用互斥的 case 集合
- **AND** 两个集合的并集 MUST 覆盖登记的全部 OpenSpec fixture cases
- **AND** timing evidence MUST 分别记录两个 step 的准备、case 数量、并发和 wall-clock

#### Scenario: 维护者显式诊断全部 fixtures
- **WHEN** 维护者直接选择 OpenSpec fixture 的 `all` 诊断入口
- **THEN** runner MAY 在一个进程中执行两个集合的并集
- **AND** `all` MUST NOT 被 Candidate 中两个 owner 同时调用

### Requirement: 重复生命周期验证必须声明唯一主 owner
Buildr Product MUST 为 development checkout onboarding、init 行为、checkout/package parity、Task lifecycle、并发 Task Environment 和安装后 release lifecycle 声明不同的主 verifier；多个 verifier MAY 经过相同命令，但 MUST NOT 重复持有同一 happy-path 结果作为主要证据。

#### Scenario: 验证 development checkout onboarding
- **WHEN** repository onboarding verifier 运行
- **THEN** verifier MUST 证明干净 Git checkout、本地开发 CLI 安装和 development update source 识别
- **AND** verifier MUST NOT 重复持有完整 init/doctor 生命周期

#### Scenario: 验证 init 行为
- **WHEN** init onboarding verifier 运行
- **THEN** verifier MUST 持有 unsupported adapter、source-only、完整 init、幂等、冲突和恢复提示契约
- **AND** verifier MUST 使用 checkout CLI 而不承担 tarball 安装证明

#### Scenario: 验证 checkout 与 package 一致性
- **WHEN** CLI package parity verifier 运行
- **THEN** verifier MUST 比较 checkout 与同一 candidate tarball 的代表输出和一个代表 mutation 结果
- **AND** verifier MUST NOT 重跑 Task Record、Task Review Result、Task Verification Result 或双 Task Environment 生命周期
- **AND** verifier MUST NOT 将单侧初始化成功作为独立发布证据

#### Scenario: 验证安装后发布生命周期
- **WHEN** release tarball smoke 运行
- **THEN** verifier MUST 独占安装后 init、sync、doctor、optional uninstall 和最终 doctor 的发布生命周期证据

### Requirement: 产品验证必须提供分层入口
Buildr 产品验证 MUST 将测试证据层、主要门禁和故障定位入口明确分离：维护者主要工作流 MUST 收敛为 fast、changed 和 candidate 三种门禁，Unit、Component、Contract、Integration 与 System MUST 保留直接定位入口；Fast MUST 只包含可频繁执行的低成本证据，需要多轮真实 Workspace/Git 演进、大量 CLI 子进程或失败恢复矩阵的 verifier MUST 使用独立 affected/full step identity，并 MUST 仍可由 changed/focus 定点选择。

#### Scenario: 普通任务运行默认测试
- **WHEN** 维护者或 Agent 在 Product checkout 运行 `npm test` 或 `npm run test:fast`
- **THEN** verifier MUST 运行 Unit、Component、低成本 Contract、架构、canonical spec quality/strict 和全部 runtime adapter 低成本契约
- **AND** verifier MUST NOT 执行完整 CLI/Workspace/System、多轮真实 Git 演进、npm pack/install、网络访问或发布生命周期

#### Scenario: 根据改动运行验证
- **WHEN** 维护者或 Agent 运行 `npm run test:changed`
- **THEN** verifier MUST 根据 Git diff 或显式 Product 路径选择最小验证 DAG
- **AND** 实现路径命中重型 System、recovery/migration 主 owner 时 MUST 选择对应 focused step，不得因其不属于 Fast 而跳过
- **AND** 计划 MUST 解释每个 step 的选择原因并对未映射路径 fail closed

#### Scenario: 定点重跑 step 或领域
- **WHEN** 维护者运行 `npm run test:focus -- <step-id|group:<group>>...`
- **THEN** verifier MUST 从统一 registry 选择并去重对应 step
- **AND** verifier MUST 只展开真实执行依赖，不得无条件附加完整 Fast
- **AND** 未知 selector MUST 在启动验证进程前 fail closed

#### Scenario: 定位测试层
- **WHEN** 维护者直接运行 Unit、Component、Contract、Integration 或 System script
- **THEN** 每个入口 MUST 只执行对应证据边界
- **AND** 这些入口 MUST NOT 被描述为独立发布门禁

#### Scenario: 最终候选运行完整验证
- **WHEN** 实现、自然语言资产、生成资产和 review 修订已经冻结
- **THEN** 维护者或 CI MUST 运行 `npm run test:candidate`
- **AND** candidate verifier MUST 直接编排全部 candidate profile steps，包括真实 Integration、System、recovery/migration 和 Workspace/Git steps
- **AND** candidate verifier MUST NOT 使用 diff、group 或 step selector 缩小覆盖范围
- **AND** candidate verifier MUST 保留产品要求的文档、安全、onboarding、package、runtime adapter、release、managed data、Workspace E2E、OpenSpec 门禁及 timing summary

### Requirement: Changed 重型验证必须由精确实现所有权触发
Buildr Product MUST 将 Changed planner 的重型 verification step inputs 限定为其直接实现 owner、公共入口、专属测试和资产边界，并 MUST NOT 仅因产品源码最终可被 CLI 到达而使用无差别 `src/**` 触发 Workspace、tarball、release 或 recovery 生命周期；Candidate profile MUST 继续无条件包含全部 required gates。

#### Scenario: 普通基础设施 helper 发生改变
- **WHEN** changed path 只影响 network、layout 或其他不属于 recovery、tarball 或 managed mutation 生命周期的精确 helper
- **THEN** planner MUST 选择该 helper 的直接 verifier owner以及适用的低成本 contract/architecture fallback
- **AND** planner MUST NOT 选择无关的 recovery、capability、package parity、release smoke 或 managed integrity step

#### Scenario: 重型 owner 的直接实现发生改变
- **WHEN** changed path 匹配 builtin replacement、runtime publication、package installation 或其他已登记的重型实现 owner
- **THEN** planner MUST 选择对应重型 step 及其真实 artifact dependencies
- **AND** 输出 MUST 说明精确 path-to-owner 匹配原因

#### Scenario: 运行完整 Candidate
- **WHEN** 维护者运行 Candidate profile
- **THEN** Candidate MUST 忽略 Changed path 选择范围并运行全部 required gate identities
- **AND** inputs 收窄 MUST NOT 删除、跳过或合并 Candidate gate

### Requirement: 重型状态矩阵必须分离分类证据与生命周期证据
Buildr Product MUST 将 builtin replacement 和 recovery 的纯状态分类分支交给 unit owner，并 MUST 只让 Candidate E2E 持有需要真实 CLI、独立 Workspace、filesystem transaction、runtime projection 或最终 doctor 的生命周期证据；优化 MUST 保留既有安全场景语义，而不是通过删除分支缩短耗时。

#### Scenario: 验证 replacement 状态分类
- **WHEN** verifier 检查 manifest source/target、predecessor snapshot/receipt、replacement target、uninstalled state 或 restore override 的组合
- **THEN** unit owner MUST 在同进程中断言 finding、outcome 和 mutation plan
- **AND** 该分类分支 MUST NOT 为每个输入组合重复创建完整 CLI Workspace

#### Scenario: 验证公开恢复生命周期
- **WHEN** verifier 检查真实 sync/restore diagnostics、整树零写入、rollback、runtime 收敛、最终 doctor、uninstalled 迁移或历史资产保护
- **THEN** Candidate E2E MUST 使用独立临时 Workspace 执行真实命令边界
- **AND** 每个主风险 MUST 保留至少一个可独立定位的黄金路径

#### Scenario: 复用 recovery fixture 准备
- **WHEN** 多个 mutation 场景需要相同的初始化或 legacy 基础状态
- **THEN** verifier MAY 复用只读基础状态并复制到每个测试的独立临时 root
- **AND** source-only 场景 MUST NOT 为生成后立即删除的 runtime 执行无效 sync
- **AND** 任一测试 MUST NOT mutation 共享基础目录或其他测试的 Workspace

#### Scenario: 校准 recovery 观察预算
- **WHEN** recovery 分层和 fixture 优化完成并冻结候选 tree
- **THEN** 维护者 MUST 使用多轮成功 timing 的中位数与波动范围决定保留或调整非阻断预算
- **AND** 预算调整 MUST NOT 替代场景覆盖核对或把单次超时变为正确性失败

### Requirement: 候选验证必须避免重复制品和无边界串行执行
Buildr candidate verifier MUST 在同一冻结候选 run 内复用不可变 npm tarball，并 MUST 对已证明使用隔离状态的昂贵 verifier 和 Workspace E2E suites 采用有界并行，同时保持逐阶段失败和 timing 可观察性。

#### Scenario: 多个 verifier 使用候选 tarball
- **WHEN** candidate verifier 运行 tarball inventory、package parity 和 release smoke
- **THEN** orchestrator MUST 只生成一个候选 tarball 和对应 pack metadata
- **AND** 各 verifier MUST 使用该只读制品，但 MUST 继续使用彼此隔离的安装 prefix 和 workspace

#### Scenario: Workspace E2E suites 使用隔离状态
- **WHEN** candidate verifier 编排全部 Workspace E2E suites
- **THEN** 每个 suite MUST 创建和清理自己的临时 workspace、repo 与 diagnostics namespace
- **AND** suite MUST NOT 依赖其他 suite 的执行顺序或可变输出
- **AND** orchestrator MUST 将每个 suite 记录为独立 timing step

#### Scenario: standalone release smoke 没有共享制品
- **WHEN** release smoke 在 macOS、Windows 或独立本地命令中运行且没有收到候选 tarball
- **THEN** verifier MUST 自行执行 npm pack 并完成相同安装后生命周期

#### Scenario: 并行阶段发生失败
- **WHEN** 同一并行批次中的任一 verifier 返回非零状态
- **THEN** candidate verifier MUST 以非零状态失败
- **AND** timing summary MUST 保留失败 step 的名称、exitCode、durationMs 以及该批次已完成 step 的结果

### Requirement: runtime adapter 验证必须按契约和实现族分层
Buildr 产品验证 MUST 对全部 supported runtime adapter 执行低成本 descriptor/plan/capability evidence 契约，并 MUST 从 runtime trait/implementation registry 生成实现族覆盖矩阵；昂贵 CLI 生命周期 MUST 仅按不同投射、skills root、checker、activation 或 cleanup 实现语义选择代表，不得因品牌数量重复共享实现的完整生命周期；Candidate MUST NOT 生成或执行真实 Agent marker smoke workspace。

#### Scenario: 验证全部 supported adapter
- **WHEN** fast 或 candidate verifier 运行 runtime adapter contract
- **THEN** contract MUST 遍历全部 supported adapter 的 traits、target、activation、capability evidence、inventory assurance 和 RuntimePlan 安全边界
- **AND** contract MUST 输出实现族覆盖矩阵并在新 adapter 没有代表性 parity owner 时 fail closed

#### Scenario: 验证昂贵 adapter 生命周期
- **WHEN** affected CLI 或 candidate verifier 运行 runtime adapter parity
- **THEN** verifier MUST 覆盖 native recursive、per-source reference、same-directory vendor、central vendor 和 root-index bridge 等不同实现族
- **AND** 每个实现族代表 MUST 保留 install、render、runtime check、幂等、orphan/uninstall/restore/cleanup 等该实现族适用的黑盒证据
- **AND** 品牌特有 path、checker probe 或 activation 差异 MUST 保留定点断言
- **AND** verifier MUST NOT 仅因多个 adapter 品牌复用同一实现而重复完整 install/render/check/idempotency 生命周期

#### Scenario: 共享 parity 准备
- **WHEN** 多个实现族验证需要相同 package source、descriptor 或不变解析结果
- **THEN** verifier MAY 在同一 parity run 中共享这些只读准备
- **AND** 每个涉及 mutation 的 adapter/implementation family MUST 继续使用独立 workspace、receipt 和 target namespace

#### Scenario: scoped render 隔离无关 Project
- **WHEN** verifier 对某个 Project 执行 scoped render 和 cleanup
- **THEN** verifier MUST 验证无关 Project 的受管投射仍然存在且内容不变
- **AND** 该回归 MUST 覆盖 same-directory vendor、central vendor 和 root-index bridge cleanup 模型

#### Scenario: Agent runtime marker smoke 暂不属于 Candidate
- **WHEN** Candidate 编排 runtime adapter 验证
- **THEN** registry MUST NOT 包含 Agent runtime marker smoke workspace generator 或真实 Agent invocation step
- **AND** contract tests MUST NOT 固化某个品牌的历史 smoke status、marker result、product version 或 surface 快照
- **AND** npm release smoke、package smoke 和 workspace lifecycle E2E MUST 保持各自既有 owner 与覆盖

### Requirement: Candidate 调度必须避免资源饱和型 verifier 互相放大
Buildr verification registry 和 scheduler MUST 能表达子进程/文件系统饱和型 verifier 的资源约束，并 MUST 在当前执行策略下防止这些 steps 超过已验证的同时运行上限；调度策略 MUST 被 timing summary 记录，且 MUST NOT 改变 Candidate required step 集合。资源 capacity MUST 表达压力节流而非共享状态锁，资源受限 profile 的饱和型并发上限 MUST NOT 高于默认 profile。

#### Scenario: 资源受限 CI 运行 Candidate
- **WHEN** Candidate 在已声明资源受限的 CI execution profile 下运行
- **THEN** scheduler MUST 使用该 profile 已验证的 global/class/饱和型并发上限
- **AND** System 重型 owner 与 `runtime-adapter-parity` MUST NOT 在超过该上限时同时扩张子进程
- **AND** summary MUST 记录 execution profile、并发上限、step 调度时间线与 queue duration

#### Scenario: 本地维护者运行 Candidate
- **WHEN** Candidate 在本地默认 execution profile 下运行
- **THEN** scheduler MUST 允许已证明使用不同临时 execution root 的两个 `workspace-saturating` verifier 有界并行
- **AND** 本地与 CI profile MUST 使用相同 registry、required steps、dependencies 和 executors

#### Scenario: 未知调度 profile
- **WHEN** 调用方请求未登记的 verification execution profile 或非法并发上限
- **THEN** planner/scheduler MUST 在启动任何 verifier 前 fail closed
- **AND** 诊断 MUST 标识未知 profile 或无效限制

### Requirement: 验证效率优化必须用同 tree 多轮证据验收
Buildr Product MUST 在改变 Fast 边界、Candidate 调度或 runtime parity 覆盖矩阵时，使用同一冻结 Candidate tree 的多轮成功 timing 证据对比基线与候选策略，并 MUST 同时验证 owner/required step/关键场景覆盖不减少；性能结果 MUST 保持非阻断观察语义。

#### Scenario: 对比 Candidate 调度策略
- **WHEN** 维护者评估新的 concurrency class/profile 或饱和型互斥策略
- **THEN** 对照与候选 runs MUST 绑定同一 repository、Product root 和 Candidate tree/fingerprint
- **AND** 每种策略 MUST 记录多轮成功的整体 wall-clock、重项 executor duration、queue duration、中位数与波动范围
- **AND** 候选策略 MUST 保留与基线相同的 Candidate required step identities 与关键覆盖断言

#### Scenario: 性能证据波动或单次超预算
- **WHEN** 单次 run 超过目标预算或不同 runs 出现环境波动
- **THEN** verifier MUST 保留 warning、timing 和环境元数据
- **AND** verifier MUST NOT 仅因该耗时结果把已通过的正确性 step 改为 failed

### Requirement: 产品验证必须记录阶段耗时
Buildr 产品总验证 MUST 记录每个阶段和整体 wall-clock elapsed milliseconds，MUST 为 Candidate 总耗时和 Workspace E2E suites 声明目标预算，并 MUST 在成功或失败时生成可供 CI 保存的机器可读 timing summary。

#### Scenario: 完整验证成功
- **WHEN** 产品总验证全部通过
- **THEN** 人类输出 MUST 展示每个阶段的耗时和总耗时
- **AND** verifier MUST 写出包含 schemaVersion、steps、status、durationMs 和 totalDurationMs 的 JSON summary
- **AND** 有预算的 step 和总结果 MUST 同时记录 `budgetMs` 与 `budgetStatus`
- **AND** summary MUST 记录 Node、平台、架构和 CI 环境元数据
- **AND** 每个 Candidate step MUST 将 stdout/stderr 写入可保存的 diagnostics 文件并在 summary 中记录路径

#### Scenario: 某阶段失败
- **WHEN** 产品验证阶段返回非零状态
- **THEN** timing summary MUST 记录失败阶段、非零状态和已完成阶段耗时
- **AND** 产品验证 MUST 保持该阶段的失败退出状态
- **AND** Workspace E2E 独立运行失败时 MUST 保留失败 fixture 或等价诊断证据并输出位置

#### Scenario: 高耗时专项阶段运行
- **WHEN** Candidate 运行 capability、runtime parity、package、OpenSpec fixtures、onboarding 或其他已识别的高耗时阶段
- **THEN** verifier MUST 为该阶段声明非阻断目标预算
- **AND** 预算状态 MUST 与 Workspace E2E 和 Candidate 总预算使用相同语义

#### Scenario: 阶段超过目标预算
- **WHEN** 某个 Workspace E2E suite 或 Candidate 总耗时超过声明预算
- **THEN** verifier MUST 将对应 `budgetStatus` 记录为 `over` 并输出 warning
- **AND** verifier MUST NOT 仅因超过目标预算改变 step status 或候选退出码

#### Scenario: 阶段处于目标预算内
- **WHEN** 有预算的阶段耗时不超过声明预算
- **THEN** timing summary MUST 将对应 `budgetStatus` 记录为 `within`

### Requirement: Verification timing 必须暴露调度等待
Buildr verification timing summary MUST 以向后兼容字段记录 step 的调度时间轴，使维护者能够区分排队等待与 executor 执行耗时。

#### Scenario: Step 成功或失败完成
- **WHEN** scheduler 启动并完成一个 passed 或 failed step
- **THEN** timing summary MUST 为该 step 记录 `queuedAt`、`startedAt`、`finishedAt` 和 `queueDurationMs`
- **AND** `queueDurationMs` MUST 表示从进入候选执行队列到实际启动的 wall-clock milliseconds
- **AND** 既有 `durationMs` MUST 继续表示 executor 执行耗时

#### Scenario: Step 因依赖失败被阻断
- **WHEN** scheduler 在 step 启动前因依赖失败将其标记为 blocked
- **THEN** timing evidence MUST 保留该 step 的 `queuedAt` 和 `blockedAt`
- **AND** verifier MUST NOT 为该 step 生成 `startedAt` 或 `finishedAt`
- **AND** 既有 `durationMs: 0` MUST 继续作为未执行的兼容哨兵

#### Scenario: 旧消费者读取 timing v1
- **WHEN** 消费者只读取 `name`、`status`、`exitCode` 和 `durationMs`
- **THEN** 新增调度字段 MUST NOT 改变这些既有字段的名称或语义

### Requirement: 高耗时 verifier 优化必须保持覆盖
Buildr Product MUST 在优化高耗时 verifier 时保留稳定 step identity、公开 CLI 边界、既有 adapter/状态语义覆盖和有界并行，不得以删除 Candidate gate 或跳过关键生命周期换取耗时下降。

#### Scenario: 优化 runtime adapter parity
- **WHEN** verifier 优化 runtime adapter parity 的 wall-clock
- **THEN** 全部 supported adapters MUST 仍验证完整 Skill inventory 与 doctor 识别
- **AND** lifecycle adapters MUST 仍覆盖 install、render、runtime check 和幂等行为
- **AND** symlink、orphan、uninstall、restore 与 cleanup 安全回归 MUST 保留
- **AND** 共享 runtime 目标的 adapter mutation 与紧随其后的 check MUST NOT 并行

#### Scenario: 并行 capability 与 JSON fixtures
- **WHEN** verifier 并行运行 capability 或 public JSON/doctor 场景
- **THEN** 并行场景 MUST 使用相互隔离的 workspace 和环境状态
- **AND** provider replacement、optional degradation、ambiguity、Project override、JSON schema、readiness 与 repair plan 断言 MUST 保留

#### Scenario: 调整高耗时阶段预算
- **WHEN** 维护者准备收紧高耗时 step 的非阻断目标预算
- **THEN** 调整 MUST 基于同一冻结候选 tree 的多轮成功 timing evidence
- **AND** 决策 MUST 使用中位数并保留合理波动余量
- **AND** 单次超预算 MUST NOT 改变候选 step status 或退出码

### Requirement: 产品总验证必须包含开源候选门禁
Buildr 产品总验证 MUST 运行开源候选安全 verifier，并 MUST 在公开 metadata、tracked candidate 或 npm tarball inventory 不满足发布边界时失败。

#### Scenario: 验证最终产品候选
- **WHEN** 维护者运行 `scripts/verify-buildr-product`
- **THEN** verifier MUST 在最终成功前运行开源候选安全检查
- **AND** timing summary MUST 将该检查记录为独立阶段

### Requirement: 产品 verifier 与仓库 verification 必须具有独立所有权
Buildr Product MUST 根据安装后 CLI 的真实运行依赖区分产品 verifier 与仓库 verification：被产品命令调用的 verifier MUST 位于 `src/`，只服务 Fast、Changed、Focus、Candidate、coverage 或 CI 的验证编排 MUST 位于 `test/verification/`。

#### Scenario: 分类现有 verification module
- **WHEN** 维护者迁移一个现有 `tools/verification` module
- **THEN** 若安装后的 `buildr` command 可达该 module，module MUST 迁入对应 `src/application` 或 `src/infrastructure` owner
- **AND** 若 module 只由 npm test scripts、verification registry 或 CI 调用，module MUST 迁入 `test/verification/`
- **AND** 分类 MUST 由 import graph、package inventory 和 command smoke 证明，不得只依据原目录名称

#### Scenario: 架构 verifier 检查依赖方向
- **WHEN** verifier 扫描 Product imports 和 npm runtime inventory
- **THEN** `bin/` 与 `src/` MUST NOT 导入 `test/verification/`
- **AND** `test/verification/` MAY 导入产品源码并执行 `bin` 入口
- **AND** 违反边界时 MUST 输出引用方、目标 module 和建议 owner

### Requirement: 仓库 verification 必须统一位于 test 根
Buildr 的 verification registry、planner、scheduler、runner、changed selection、Candidate orchestration、timing、evidence、coverage 和 focused verifier MUST 位于 `test/verification/`，并 MUST 继续提供现有 Fast、Changed、Focus 和 Candidate 行为。

#### Scenario: 运行迁移后的验证入口
- **WHEN** 维护者运行 `npm test`、`npm run test:changed`、`npm run test:focus` 或 `npm run test:candidate`
- **THEN** npm scripts MUST 调用 `test/verification/` 下的唯一 registry 和薄入口
- **AND** stable step identities、profiles、groups、budgets、dependencies、timing schema 和 failure propagation MUST 与迁移前保持语义兼容

#### Scenario: Changed 规划源码布局改动
- **WHEN** Product changed paths 位于 `src/`、`bin/`、`scripts/`、`test/` 或 `package/`
- **THEN** unified registry MUST 为每个路径匹配明确 verifier owner 或显式 ignore policy
- **AND** 旧 `tools/` input globs MUST 不再存在
- **AND** 未映射路径 MUST 在启动 verifier 前 fail closed

### Requirement: 测试数据和测试代码必须分离
Buildr Product MUST 将固定 Workspace、manifest、旧格式、损坏状态和冲突样本放入 `test/fixtures/`，并 MUST 将 unit、contract、fast integration 与 candidate integration test code 保留在各自测试层。

#### Scenario: verifier 创建临时 Workspace
- **WHEN** integration 或 focused verifier 需要预设 Workspace 状态
- **THEN** verifier MUST 从 `test/fixtures/` 复制或构造输入到独立临时目录
- **AND** fixture MUST NOT 进入 npm runtime package
- **AND** verifier MUST NOT 把用户主 Workspace 当作测试状态

### Requirement: Timing summary 必须支持开发完成报告
Buildr verification timing summary MUST 提供总耗时、每阶段名称/状态/耗时和失败退出状态，使 Agent 能确定最慢阶段、失败阶段和 summary 路径。

#### Scenario: Agent 汇报成功验证
- **WHEN** 产品完整验证成功并生成 timing summary
- **THEN** summary MUST 足以确定 totalDurationMs 和耗时最长的 step
- **AND** 产品验证输出 MUST 显示 summary 的绝对路径

#### Scenario: Agent 汇报失败验证
- **WHEN** 产品完整验证失败并生成 timing summary
- **THEN** summary MUST 标记整体失败状态和失败 step
- **AND** 失败 step MUST 保留非零 exitCode 与 durationMs

### Requirement: 验证覆盖必须具有可追踪 owner
Buildr 产品验证 MUST 维护面向维护者的覆盖职责矩阵，使被删除的聚合 E2E 类别可以追溯到当前 focused verifier 或 Workspace E2E owner。

#### Scenario: 审查旧 MVP 覆盖迁移
- **WHEN** 维护者检查被删除的旧 MVP section
- **THEN** 职责矩阵 MUST 记录该类别的当前主 verifier 和删除或保留交叉覆盖的理由
- **AND** 文档 MUST 区分必要的发布边界交叉与可以继续收缩的重复验证

### Requirement: Workspace E2E 必须只覆盖跨组件黄金路径
Buildr Workspace E2E MUST 只保留必须通过多条真实命令、多个产品组件和同一 workspace 状态演进才能证明的黄金路径，并 MUST 将单命令 contract、全量 help、adapter 实现族 parity、onboarding 分支和 package inventory 交由对应 focused verifier 持有。

#### Scenario: 验证 Workspace 生命周期
- **WHEN** `workspace-lifecycle` suite 运行
- **THEN** verifier MUST 在同一临时 workspace 中完成初始化、Project/Service、代表性资产、Codex sync 和最终 doctor
- **AND** 最终 doctor MUST 没有 error、missing、stale 或 conflict

#### Scenario: 验证 ownership 与恢复
- **WHEN** `ownership-recovery` suite 运行
- **THEN** verifier MUST 验证代表性的受管资产 ownership 拒绝和恢复生命周期
- **AND** 被拒绝的操作 MUST 保留原有受管状态

#### Scenario: 验证 runtime reconciliation
- **WHEN** `runtime-reconciliation` suite 运行
- **THEN** verifier MUST 验证 Codex 主路径、Claude Code bridge 代表路径、workspace 源 Component drift 的 fail-closed 行为和恢复后的收敛状态

#### Scenario: focused verifier 持有单领域覆盖
- **WHEN** 维护者审查 Workspace E2E 覆盖
- **THEN** 全量 help MUST 由 CLI compatibility 持有
- **AND** 全 adapter 生命周期 MUST 由 runtime parity 持有
- **AND** onboarding 异常分支 MUST 由 onboarding integration 持有
- **AND** tarball inventory 和安装后发布生命周期 MUST 分别由 package/open-source verifier 与 release smoke 持有

### Requirement: Candidate 必须观测独立 package 验证阶段
Buildr Candidate MUST 将 package static、package workspace smoke 和 package domain integration 作为独立 verification steps 编排，并 MUST 为每个 step 保留稳定 identity、耗时预算和失败诊断。

#### Scenario: Candidate 运行 package 验证
- **WHEN** `npm run test:candidate` 到达 package 验证阶段
- **THEN** timing summary MUST 分别记录每个 package step 的状态、exitCode、durationMs、budgetMs 和 diagnostics 路径
- **AND** Candidate MUST NOT 只记录一个不透明的 `package check` timing step

#### Scenario: 开发期间定点重跑 package verifier
- **WHEN** 维护者通过已登记入口选择 package static、workspace smoke 或 domain integration
- **THEN** 入口 MUST 只运行所选 focused verifier 及其显式前置门禁
- **AND** 未知 selector MUST fail closed

#### Scenario: package steps 并行执行
- **WHEN** 两个 package verifier 使用彼此隔离的只读源码或临时状态
- **THEN** Candidate MAY 在有界并行批次执行它们
- **AND** verifier MUST NOT 依赖同批次其他 step 的可变输出或执行顺序

### Requirement: 产品验证步骤必须由统一 registry 声明
Buildr Product MUST 使用单一 verification registry 声明所有可编排 step 的稳定 id、显示名称、执行命令、输入路径、真实执行依赖、profile/group、预算、并发类别、可选调度成本和 artifact 需求，并 MUST 在执行前验证 registry 完整性；`dependsOn` MUST NOT 用于表达 profile 完整性或建议门禁顺序。

#### Scenario: registry 定义合法
- **WHEN** fast、focus、changed 或 Candidate 解析 verification registry
- **THEN** 每个 step id MUST 唯一且引用的依赖、profile、group、concurrency class 和 executor MUST 已登记
- **AND** 可选 `schedulingCostMs` MUST 是正整数
- **AND** dependency graph MUST 无环
- **AND** 声明消费候选 artifact 的 step MUST 依赖对应 artifact producer

#### Scenario: registry 定义非法
- **WHEN** registry 存在重复 id、未知依赖、依赖环、artifact consumer 缺失 producer 依赖、缺失执行信息或非法 `schedulingCostMs`
- **THEN** planner MUST 在启动任何验证进程前 fail closed
- **AND** 诊断 MUST 标识无效 step 与原因

#### Scenario: step 只需要共同通过而不消费输出
- **WHEN** 两个 verifier 由同一 Fast 或 Candidate profile 选择但彼此不消费输出
- **THEN** registry MUST NOT 仅为了固定运行顺序在二者之间声明 `dependsOn`
- **AND** scheduler MAY 按并发类别和可选调度成本并行执行二者

### Requirement: changed 验证必须从 Git diff 生成可解释计划
Buildr Product MUST 提供 `test:changed`，根据默认 Git diff、显式 `--base <ref>` 或显式 Product 路径匹配真实 verifier owner inputs，展开真实依赖并去重；规划结果 MUST 解释每个 step 的选择原因和未映射路径，且通用源码目录 glob MUST NOT 迫使无关 Unit、Contract 与 Fast Integration 同时运行。

#### Scenario: 普通文档发生小改动
- **WHEN** changed paths 只匹配普通非发布 Markdown 文档
- **THEN** planner MUST 选择轻量 docs quality step 及其真实依赖
- **AND** planner MUST NOT 选择完整 Candidate、Workspace E2E、tarball install 或 runtime parity

#### Scenario: 单一实现 owner 发生改动
- **WHEN** changed path 只匹配一个 focused verifier 或一个低成本测试 owner
- **THEN** planner MUST 选择该 owner 及其真实依赖
- **AND** planner MUST NOT 因架构或 profile 建议顺序展开全部低成本测试层

#### Scenario: 使用 Git base 规划
- **WHEN** 维护者运行 `npm run test:changed -- --base <ref>`
- **THEN** planner MUST 使用 `<ref>...HEAD` 的 merge-base diff，并合并 staged、unstaged 和 Product 内 untracked paths
- **AND** 输出 MUST 标识实际 base 与每个 matched path

#### Scenario: 使用显式路径规划
- **WHEN** 维护者向 `test:changed` 传入一个或多个 Product 相对路径
- **THEN** planner MUST 只使用这些规范化路径进行匹配
- **AND** 绝对路径、越界路径或不存在的 selector option MUST fail closed

#### Scenario: 改动路径没有 owner
- **WHEN** 任一 Product changed path 未匹配 registry input 且未被显式 ignore 规则覆盖
- **THEN** planner MUST 在运行步骤前 fail closed
- **AND** 诊断 MUST 列出全部未映射路径并要求补充验证所有权

#### Scenario: 只查看计划
- **WHEN** 维护者使用 `--plan` 或 `--json`
- **THEN** planner MUST 输出规范化 changed paths、按拓扑排序的 steps、依赖展开和选择原因
- **AND** planner MUST NOT 启动验证进程或创建候选制品

### Requirement: 验证 DAG 必须有界调度并保留失败传播
Buildr verification scheduler MUST 只在 step 的全部依赖通过且 concurrency class 有容量时启动该 step，MUST 在当前 ready steps 中优先选择已声明调度成本较高者，并 MUST 保留 passed、failed 与 blocked step 的独立结果。

#### Scenario: 独立 steps 并发
- **WHEN** 多个 ready steps 使用允许并发的类别且未超过类别和全局上限
- **THEN** scheduler MUST 优先启动 `schedulingCostMs` 较高且容量可用的 step
- **AND** 相同成本或未声明成本的 steps MUST 保持 plan 中的稳定相对顺序
- **AND** 输出顺序 MUST 按稳定拓扑顺序呈现，不依赖启动或完成先后

#### Scenario: 高成本 step 尚未 ready
- **WHEN** 一个高成本 step 的依赖尚未全部通过，但其他低成本 step 已 ready 且有容量
- **THEN** scheduler MUST 启动容量可用的 ready step
- **AND** scheduler MUST NOT 为等待高成本 step 而空置可用槽位

#### Scenario: 依赖 step 失败
- **WHEN** 一个 step 返回非零状态
- **THEN** scheduler MUST 将直接或传递依赖该 step 的未启动 steps 标记为 blocked
- **AND** 与失败 step 无依赖关系且已经启动的 steps MUST 保留实际结果
- **AND** 整体执行 MUST 返回非零状态

#### Scenario: 对比调度模式
- **WHEN** 维护者在同一冻结 Candidate tree 上选择 cost 或 declaration 调度模式
- **THEN** 两种模式 MUST 使用相同 registry、profile、依赖、并发上限和 executors
- **AND** timing summary MUST 记录实际 `schedulingMode`
- **AND** 未知模式 MUST 在启动 verifier 子进程前 fail closed

### Requirement: Candidate 必须使用完整 profile 而不依赖 diff
Buildr Candidate MUST 从统一 registry 选择完整 candidate profile、展开全部真实依赖并生成一次冻结 tarball artifact；Candidate MUST NOT 根据 Git diff、changed inputs、固定 step 数量或人工 selector 缩小发布门禁，并 MUST 包含轻量文档质量验证。

#### Scenario: 运行完整 Candidate
- **WHEN** 维护者运行 `npm run test:candidate`
- **THEN** planner MUST 选择 registry 中完整 candidate profile 的全部 steps
- **AND** Candidate MUST 保留 docs quality、Workspace、package、runtime、OpenSpec、managed integrity、onboarding、CLI parity 和 release gates
- **AND** 所有 tarball consumer MUST 依赖并复用同一 candidate artifact

#### Scenario: Candidate registry 漂移
- **WHEN** 既有 required gate 不再属于 candidate profile、docs quality 缺失，或 artifact consumer 未声明 artifact dependency
- **THEN** architecture/registry verification MUST fail before release verification is reported complete
- **AND** verifier MUST 根据 required gate identity 判断完整性，不得把某个固定 step 数作为质量契约

### Requirement: 低成本 Node 验证必须按测试语义分层
Buildr Product MUST 将 Node tests 按 Unit、Component、Contract、Integration 与 System 的真实执行边界提供稳定入口；Quick MUST 聚合完整低成本 Unit、Component、Contract 和必要静态检查，MUST NOT 因历史文件名把完整 CLI、Git 或 Workspace System 测试归入低成本入口。

#### Scenario: 运行纯单元测试
- **WHEN** 维护者运行 `npm run test:unit`
- **THEN** verifier MUST 只发现直接调用同进程产品模块的 unit tests
- **AND** 这些测试 MUST NOT 启动真实 CLI、Git 或 npm 子进程

#### Scenario: 运行有界组件测试
- **WHEN** 维护者运行 `npm run test:component`
- **THEN** verifier MUST 验证单一有界 Application 组装并使用 fake 或受控轻环境替代外部系统
- **AND** verifier MUST NOT 启动完整 Workspace 生命周期

#### Scenario: 运行契约测试
- **WHEN** 维护者运行 `npm run test:contract`
- **THEN** verifier MUST 检查源码结构、manifest、文档、Skills、schema 或 entrypoint declaration 的一致性
- **AND** 入口包含的真实开发 CLI、Git 或临时目录边界 MUST 在 registry 中按实际 Integration 成本记录

#### Scenario: 运行技术集成测试
- **WHEN** 维护者运行 `npm run test:integration`
- **THEN** verifier MUST 运行跨真实 filesystem、Git 或子进程技术边界的测试
- **AND** verifier MUST 不把完整公共入口或 Workspace 生命周期降格为 Integration

#### Scenario: 运行系统测试
- **WHEN** 维护者运行 `npm run test:system`
- **THEN** verifier MUST 运行完整 CLI、Workspace、Local App 或 Task 生命周期 System 测试
- **AND** Product MUST NOT 保留将同一 System 集合命名为 `test:integration:fast` 的第二入口
- **AND** runner MUST 保留明确的文件集合、退出码、signal 与失败 diagnostics，不得把无 TAP 输出的聚合失败变成不可定位结果

#### Scenario: 验证全部 CLI help
- **WHEN** CLI compatibility verifier 检查全部公开 help topics
- **THEN** 所有 topic 的路由与 Usage 内容 MUST 在同一进程中穷举验证
- **AND** 代表性的 root、普通、深层 Task、App、Finish 与 runtime-dependent topics MUST 继续通过真实 CLI 进程验证 stdout、exit status、两种 help form 与零写入
- **AND** verifier MUST NOT 为每个 topic 重复启动两次完整产品进程

#### Scenario: 聚合低成本验证
- **WHEN** 维护者运行 `npm test` 或 `npm run test:fast`
- **THEN** unified registry MUST 只选择登记为 Quick 的低成本 steps
- **AND** 每层 MUST 保留稳定 step identity、失败状态和 diagnostics

### Requirement: 单元测试覆盖率必须独立可观察
Buildr Product MUST 提供只执行 unit owner 的 coverage 入口，并 MUST 将核心产品模块的直接 unit owner 与缺口记录在覆盖职责文档中；fast 聚合执行覆盖率 MUST NOT 被标记为单元测试覆盖率。

#### Scenario: 采集 unit coverage
- **WHEN** 维护者运行 unit coverage 入口
- **THEN** verifier MUST 只执行 unit tests 并输出 line、branch 和 function coverage
- **AND** verifier MUST 支持将机器可读 coverage summary 写入显式位置

#### Scenario: 审查核心模块覆盖缺口
- **WHEN** 维护者审查 CLI application/domain、doctor diagnostics、package validation、runtime checker 或 verification planner 等核心区域
- **THEN** 覆盖职责文档 MUST 标明直接 unit owner、现有 focused integration owner和待补缺口
- **AND** 无法隔离的生命周期行为 MUST 保留在 integration/E2E owner，不得为了覆盖率数字伪装为 unit

#### Scenario: 发布候选不以初始全局阈值阻断
- **WHEN** 本次分层迁移建立首个可信 unit-only baseline
- **THEN** Candidate MUST 记录并保留该覆盖事实
- **AND** Candidate MUST NOT 仅因未达到预设全局百分比而失败

### Requirement: 验证 timing 证据必须具有运行级唯一归属
Buildr Candidate 和 Changed verification MUST 为默认本地运行生成 run-scoped timing summary 与 diagnostics，并 MUST 记录足以区分 worktree 候选的 source identity。

#### Scenario: 两个 worktree 使用默认输出
- **WHEN** 两个 Buildr worktree 分别运行 Candidate 或 Changed verification 且没有显式设置 timing 输出路径
- **THEN** 两次运行 MUST 使用不同的 evidence directory 和 summary 路径
- **AND** 任一运行 MUST NOT 覆盖另一运行的 summary 或 diagnostics

#### Scenario: summary 记录候选归属
- **WHEN** verification 生成 timing summary
- **THEN** summary MUST 记录 run id、run kind、开始与结束时间
- **AND** summary MUST 记录 repository root、Product root、Git HEAD、branch、dirty state 和包含未提交候选内容的稳定 fingerprint
- **AND** fingerprint algorithm identity MUST 可识别

#### Scenario: 调用方显式设置输出路径
- **WHEN** 调用方设置 `BUILDR_TIMING_OUTPUT` 或 `BUILDR_DIAGNOSTICS_OUTPUT`
- **THEN** verifier MUST 保持显式路径兼容性
- **AND** summary MUST 仍记录本次 run/source identity，使消费者能够发现路径复用或误归属

### Requirement: 验证人类输出必须显示完成 timing 摘要
Buildr Candidate 和 Changed verification MUST 在运行结束时直接输出可读的整体 timing 摘要，而不是只输出 summary 文件路径。

#### Scenario: 验证成功
- **WHEN** verification 全部通过
- **THEN** 人类输出 MUST 显示 total duration、预算状态（如适用）、最慢阶段、`failed: none` 和 summary 绝对路径

#### Scenario: 验证失败
- **WHEN** verification 至少一个阶段失败
- **THEN** 人类输出 MUST 显示 total duration、最慢阶段、失败阶段名称/状态和 summary 绝对路径
- **AND** timing 输出 MUST NOT 掩盖原失败退出状态

### Requirement: Changed verification 必须生成整体 timing summary
Buildr Changed verification MUST 使用与 Candidate 相同的 timing schema family 记录所选 DAG 的整体 wall-clock 与逐阶段证据。

#### Scenario: Changed plan 被执行
- **WHEN** `npm run test:changed` 选择并运行至少一个 verification step
- **THEN** verifier MUST 生成 `buildr.verification-timing/v1` summary
- **AND** summary MUST 将 run kind 记录为 `changed`
- **AND** summary MUST 记录 totalDurationMs、全部已完成 step、status、source identity 和 diagnostics 路径

#### Scenario: Changed 运行结束
- **WHEN** Changed verification 成功或失败并完成 summary 写入
- **THEN** summary 与 diagnostics MUST 保留在本次唯一 evidence directory
- **AND** 候选 package 等短生命周期执行制品 MUST 继续清理

### Requirement: Candidate 包含双任务并发整体验收
Buildr Product Candidate MUST 将 `concurrent-task-acceptance` 登记为 required verification step，MUST 真正并发准备两个不同 Task 的独立 Environment，并 MUST 使用独立 executor、阶段 timing 和预算执行；不得由其他单项测试的通过状态推断该组合验收通过。

#### Scenario: 执行完整候选验证
- **WHEN** 维护者执行 Product Candidate 验证
- **THEN** verification registry MUST 选择 `concurrent-task-acceptance`
- **AND** 该步骤失败或证据不完整时 Candidate MUST 失败

#### Scenario: 准备两个 Task Environment
- **WHEN** acceptance fixture 已创建两个正式 Task Record
- **THEN** verifier MUST 并发调用两个独立 Task Environment prepare
- **AND** 两个 Environment MUST 使用不同 execution roots 并保持各自 repository set 与 CLI invocation
- **AND** summary MUST 记录 fixture、environment prepare、Task invocation、verification、Verification Result、preview、resource coordination 与 cleanup 的 wall-clock

#### Scenario: 两个 Task 形成独立 current Verification Result
- **WHEN** 两个 Task 的显式 verification execution 都已完成
- **THEN** verifier MUST 并发调用各自 Receipt-bound CLI 记录两份 current Result
- **AND** 两个 Result MUST 使用不同 Task-scoped path 与 digest 并保持 `current` applicability
- **AND** acceptance MUST NOT 为证明 `record` 响应再重复执行两个 `inspect`；Result reader 的完整协议由 Task Verification System owner 持有

#### Scenario: 清理并发 Task Environment
- **WHEN** 两个 Task 的并发行为已经完成
- **THEN** verifier MUST 证明清理第一个 Task 不会删除或使第二个 Environment 失效
- **AND** verifier MUST 最终清理两个 Environment 及其 owned resources

### Requirement: Product test plan 与 Task Verification authority 必须分离
Buildr Product MAY 继续在 `test/verification/` 使用 Fast、Changed、Focus、Candidate profiles、DAG scheduling、prepared fixtures 与 workspace-saturating resources；这些名称和实现 MUST 只属于 Product repository testing policy。Installed Project declaration parser、capability runner 与 Task Verification Result MUST NOT 导入该 test-only planner、复制其 profile levels 或把它变成所有 Project 的默认 schema。

#### Scenario: Product Candidate 使用 DAG
- **WHEN** `npm run test:candidate` 根据 Product verification registry 生成有依赖的 plan
- **THEN** `test/verification/dag-scheduler.mjs` MAY 有界调度依赖、并发 class 与 workspace-saturating resources
- **AND** 该 DAG MUST 不出现在 `buildr.project-verification/v2` 或 Task Verification Result

#### Scenario: installed CLI 执行 Project capability
- **WHEN** npm package 中的 `buildr verification run` 执行显式 capability set
- **THEN** runtime MUST 只依赖 `src/` 内 declaration、process、resource 与 transient evidence modules
- **AND** package inventory MUST 不包含或导入 Product test planner/scheduler

### Requirement: P0.4 验证必须覆盖 current Result authority
Buildr Product focused/fast/candidate tests MUST 覆盖 Result closed schema、Project scope declaration binding、atomic replacement rollback、target/declaration stale、absent declaration gap、unique writer、CLI/Local App parity、transient execution separation、Finish shared consumer 与旧 authority absence。

#### Scenario: 运行 P0.4 focused verification
- **WHEN** 维护者修改 Verification domain、Application、declaration、Skill/contract、Finish 或 Local App
- **THEN** affected tests MUST 证明 Result current path 与 failure preservation
- **AND** MUST 不以 fixture 字段存在代替真实 CLI、filesystem 或 HTTP journey

### Requirement: 可复用 System 测试上下文必须共享不可变基线并隔离写入
Buildr Product MUST 允许主要被测事实不包含 Workspace 初始化的高重复 System 测试复用同一运行内的已初始化基线；共享部分 MUST 保持不可变，每个 test case MUST 在独立可写 sandbox 中执行，且验证初始化、全局状态或完整生命周期本身的测试 MUST 保持独立环境 owner。

#### Scenario: System suite 复用同一上下文
- **WHEN** 一个 `test:system` invocation 包含多个声明使用相同 context identity 的测试文件
- **THEN** runner MUST 对该 identity 最多准备一次基线并把它交给对应 worker
- **AND** 基线 MUST 只包含这些测试共同需要且不是主要被测目标的前置事实

#### Scenario: 并发 test case 修改工作区
- **WHEN** 两个或更多 test case 并发使用同一基线
- **THEN** 每个 case MUST 获得 realpath 不同的可写 sandbox
- **AND** 任一 case 的修改 MUST NOT 改变基线或其他 case 的可见状态

#### Scenario: 基线缺失或被污染
- **WHEN** runner 提供的 context marker、路径边界或内容 identity 缺失、不匹配或在运行中发生变化
- **THEN** System verification MUST fail closed 并报告 context diagnostic
- **AND** worker MUST NOT 静默创建替代基线后继续冒充 suite context 成功

#### Scenario: 直接运行单个测试文件
- **WHEN** 维护者不经过 System runner 直接执行一个已接入 context 的 test file
- **THEN** 该 worker MUST 在本进程内最多准备一次等价基线
- **AND** 所有 case 完成或失败后 MUST 清理该本地基线和各自 sandbox

#### Scenario: 测试以初始化或全局生命周期为主要事实
- **WHEN** System 测试验证 Workspace init、Project/Service 创建、真实 Git/Task Environment、安装、迁移、cleanup 或 Task Finish 交付生命周期
- **THEN** 该测试 MUST 保留自身完整隔离环境
- **AND** runner MUST NOT 用预建结果跳过其主要被测边界
