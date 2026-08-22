# Buildr 产品验证质量

## Purpose

定义 Buildr 候选版本的 Node/操作系统验证范围、正式 tarball 生命周期 smoke，以及可观察但不阻塞的验证耗时记录。

## Requirements

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
- **WHEN** repository onboarding verifier 在干净 Git checkout运行
- **THEN** verifier MUST 使用Product声明的精确development Node执行checkout内显式`projects/product/buildr` Project bridge，并证明development entry identity与development update source
- **AND** verifier MUST 完成真实sync、development-only Launcher activation和最终Doctor，同时证明PATH默认`buildr`与`buildr.cmd`未被读取、创建、覆盖或删除
- **AND** verifier MUST NOT安装development PATH CLI，也不得重复持有完整init或npm tarball release lifecycle

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
Buildr candidate verifier MUST 在同一冻结候选 run 内复用不可变 npm tarball和已准备的只读测试输入，并 MUST 将 System 文件按 primary owner、可变状态与资源压力拆为可独立计时的 steps；已证明使用隔离状态的 owner MUST 采用有界并行，同时保持逐阶段失败、完整文件归属和 timing 可观察性。

#### Scenario: 多个 verifier 使用候选 tarball
- **WHEN** candidate verifier 运行 tarball inventory、package parity 和 release smoke
- **THEN** orchestrator MUST 只生成一个候选 tarball 和对应 pack metadata
- **AND** 各 verifier MUST 使用该只读制品，但 MUST 继续使用彼此隔离的安装 prefix 和 workspace

#### Scenario: System 文件按资源 owner 调度
- **WHEN** Candidate 编排全部 System tests
- **THEN** 每个 System test file MUST 恰好归属一个 Candidate primary owner
- **AND** fresh build、runtime recovery、Task Finish、Workspace lifecycle、Buildr Web HTTP、App process 和轻量验证契约 MUST 可按不同资源容量独立调度与计时
- **AND** monolithic System 入口 MUST 复用同一文件归属事实运行完整 System 集合

#### Scenario: Workspace E2E suites 使用隔离状态
- **WHEN** candidate verifier 编排全部 Workspace E2E suites
- **THEN** 每个 suite MUST 创建和清理自己的临时 workspace、repo 与 diagnostics namespace
- **AND** suite MUST NOT 依赖其他 suite 的执行顺序或可变输出
- **AND** orchestrator MUST 将每个 suite 或其拆分后的 primary owner 记录为独立 timing step

#### Scenario: standalone release smoke 没有共享制品
- **WHEN** release smoke 在 macOS、Windows 或独立本地命令中运行且没有收到候选 tarball
- **THEN** verifier MUST 自行执行 npm pack 并完成相同安装后生命周期

#### Scenario: 复用只读 fixture 基线
- **WHEN** 多个 System tests 需要相同 controller dependencies、Workspace baseline 或 Web dist
- **THEN** verifier MAY 复用只读不变输入或将其复制到独立临时 root
- **AND** 每个测试 MUST 继续隔离 `.buildr`、SQLite、Git worktree、Task/Finish、Buildr Web runtime state 与其他可变 Workspace 内容

#### Scenario: fresh build 保持真实依赖闭包
- **WHEN** `system-fresh-build` 验证 Task Environment 的多 Service preparation
- **THEN** 测试 harness MAY 复用当前已安装 controller 而不额外复制源码并执行 controller `npm ci`
- **AND** 被测 Buildr 与 Buildr Web checkout MUST 从没有 `node_modules` 的状态分别执行锁定安装
- **AND** 被测 checkout MUST 使用受管工具链真实完成一次 `build:web`

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
Buildr verification registry 和 scheduler MUST 能表达 System owner 的 inner concurrency、子进程/文件系统/构建/App runtime 资源约束，并 MUST 在当前执行策略下防止互斥或饱和型 steps 超过已验证的同时运行上限；调度策略 MUST 被 timing summary 记录，且 MUST NOT 减少 Candidate 所需行为覆盖。资源 capacity MUST 表达压力节流而非共享可变状态锁，资源受限 profile 的上限 MUST NOT 高于默认 profile。

#### Scenario: 资源受限 CI 运行 Candidate
- **WHEN** Candidate 在已声明资源受限的 CI execution profile 下运行
- **THEN** scheduler MUST 使用该 profile 对每个 System owner 声明的 global/class/resource/inner concurrency 上限
- **AND** fresh build、runtime recovery、App process、Task Finish 与 `runtime-adapter-parity` MUST NOT 在冲突资源上同时扩张子进程
- **AND**轻量隔离 owner MAY 在重型 owner 运行期间并行
- **AND** summary MUST 记录 execution profile、并发上限、step 调度时间线与 queue duration

#### Scenario: 本地维护者运行 Candidate
- **WHEN** Candidate 在本地默认 execution profile 下运行
- **THEN** scheduler MUST 允许已证明使用不同临时 execution root 的 System owner 有界并行
- **AND** 本地与 CI profile MUST 使用相同 registry、required steps、dependencies 和 executors

#### Scenario: 本地维护者运行完整 System
- **WHEN** 维护者运行 `npm run test:system`
- **THEN** runner MUST 从 Candidate 使用的同一 System owner registry 展开完整文件集合
- **AND** 所有未明确 standalone 的 System files MUST 恰好执行一次

#### Scenario: 未知调度 profile
- **WHEN** 调用方请求未登记的 profile、非法并发上限、重复 System 文件 owner 或未归属 System 文件
- **THEN** planner/scheduler MUST 在启动对应 verifier 前 fail closed
- **AND** 诊断 MUST 标识未知 profile、无效限制或冲突文件

### Requirement: 验证效率优化必须用同 tree 多轮证据验收
Buildr Product MUST 在改变 Fast 边界、Candidate 调度、System owner topology 或 runtime parity 覆盖矩阵时，使用同一冻结 Candidate tree 的多轮成功 timing 证据对比基线与候选策略，并 MUST 同时验证旧新 owner coverage map、关键场景和完整行为集合不减少；性能结果 MUST 保持非阻断观察语义。

#### Scenario: 对比 Candidate 调度策略
- **WHEN** 维护者评估新的 concurrency class/profile、System owner topology 或饱和型互斥策略
- **THEN** 对照与候选 runs MUST 绑定同一 repository、Product root 和 Candidate tree/fingerprint
- **AND** 每种策略 MUST 记录多轮成功的整体 wall-clock、重项 executor duration、queue duration、中位数与波动范围
- **AND** owner coverage map MUST 证明旧完整 System 文件集合与新 primary owner 文件并集相同且无重复

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
Buildr Product MUST 使用单一 verification registry 声明所有可编排 step 的稳定 id、显示名称、执行命令、输入路径、真实执行依赖、profile/group、预算、并发类别、可选调度成本、artifact 需求、环境足迹、隔离方式和重置负担，并 MUST 在执行前验证 registry 完整性；`dependsOn` MUST NOT 用于表达 profile 完整性或建议门禁顺序。Planner MUST 根据这些显式事实判断 Component 与 Quick 准入，MUST NOT 根据 step id、目录名或暂时实测耗时补猜资格。

#### Scenario: registry 定义合法
- **WHEN** fast、focus、changed 或 Candidate 解析 verification registry
- **THEN** 每个 step id MUST 唯一且引用的依赖、profile、group、concurrency class 和 executor MUST 已登记
- **AND** 每个 step MUST 声明闭合、可校验的环境足迹、隔离方式与重置负担
- **AND** 可选 `schedulingCostMs` MUST 是正整数
- **AND** dependency graph MUST 无环
- **AND** 声明消费候选 artifact 的 step MUST 依赖对应 artifact producer

#### Scenario: registry 定义非法
- **WHEN** registry 存在重复 id、未知依赖、依赖环、artifact consumer 缺失 producer 依赖、缺失执行信息、非法 `schedulingCostMs`、缺失环境事实或非法准入组合
- **THEN** planner MUST 在启动任何验证进程前 fail closed
- **AND** 诊断 MUST 标识无效 step 与原因

#### Scenario: Component 穿过真实环境边界
- **WHEN** step 声明为 Component，但环境足迹包含真实 filesystem、CLI、Git、网络或完整 Workspace 生命周期，或声明任何 reset burden
- **THEN** planner MUST 拒绝该 registry
- **AND** MUST NOT 因 step 名称或目标耗时较低允许其进入 Component

#### Scenario: Quick step 需要重复重置
- **WHEN** step 属于 Quick，但需要重复初始化、迁移、安装、环境清理或完整生命周期
- **THEN** planner MUST 拒绝该 registry
- **AND** 诊断 MUST 明确指出其 reset burden 不符合 Quick

#### Scenario: 低成本 Integration 申请进入 Quick
- **WHEN** Integration step 属于 Quick
- **THEN** registry MUST 明确声明有界目标耗时、可测环境足迹、独立隔离且无 reset burden
- **AND** step 包含 network、Git、Workspace lifecycle 或共享可变环境时 planner MUST fail closed

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
Buildr Product MUST 将 Node tests 按 Unit、Component、Contract、Integration 与 System 的真实执行边界提供稳定入口；Quick MUST 聚合完整低成本 Unit、Component、静态 Contract 和必要静态检查，MUST NOT 因历史文件名、step 名称或暂时较快把真实 filesystem、CLI、Git、网络、Workspace 生命周期或重复重置测试归入低成本入口。

#### Scenario: 运行纯单元测试
- **WHEN** 维护者运行 `npm run test:unit`
- **THEN** verifier MUST 只发现直接调用同进程产品模块的 unit tests
- **AND** 这些测试 MUST NOT 启动真实 CLI、Git 或 npm 子进程

#### Scenario: 运行有界组件测试
- **WHEN** 维护者运行 `npm run test:component`
- **THEN** verifier MUST 验证单一有界 Application 组装并使用 fake 或内存实现替代外部系统
- **AND** verifier MUST NOT 穿过真实 filesystem、CLI、Git、网络或完整 Workspace 生命周期

#### Scenario: 运行契约测试
- **WHEN** 维护者运行 `npm run test:contract`
- **THEN** verifier MUST 只检查源码结构、manifest、文档、Skills、schema 或 entrypoint declaration 的一致性
- **AND** static contract MUST 自动拒绝 Contract 目录中新引入的真实子进程、Git、网络或可变临时环境测试

#### Scenario: 运行技术集成测试
- **WHEN** 维护者运行 `npm run test:integration`
- **THEN** verifier MUST 运行跨真实 filesystem、Git 或子进程技术边界的测试
- **AND** verifier MUST 不把完整公共入口或 Workspace 生命周期降格为 Integration
- **AND** 从 Contract 迁出的真实环境测试 MUST 保留 changed/affected、Candidate 与 focus 可选择性

#### Scenario: 运行系统测试
- **WHEN** 维护者运行 `npm run test:system`
- **THEN** verifier MUST 运行完整 CLI、Workspace、Buildr Web 或 Task 生命周期 System 测试
- **AND** Product MUST NOT 保留将同一 System 集合命名为 `test:integration:fast` 的第二入口
- **AND** runner MUST 保留明确的文件集合、退出码、signal 与失败 diagnostics，不得把无 TAP 输出的聚合失败变成不可定位结果

#### Scenario: 验证全部 CLI help
- **WHEN** CLI compatibility verifier 检查全部公开 help topics
- **THEN** 所有 topic 的路由与 Usage 内容 MUST 在同一进程中穷举验证
- **AND** 代表性的 root、普通、深层 Task、App、Finish 与 runtime-dependent topics MUST 继续通过真实 CLI 进程验证 stdout、exit status、两种 help form 与零写入
- **AND** verifier MUST NOT 为每个 topic 重复启动两次完整产品进程

#### Scenario: 聚合低成本验证
- **WHEN** 维护者运行 `npm test` 或 `npm run test:fast`
- **THEN** unified registry MUST 只选择显式满足环境足迹、隔离方式和 reset burden 准入的低成本 steps
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
Buildr Product focused/fast/candidate tests MUST 覆盖 Result closed schema、Project scope declaration binding、atomic replacement rollback、target/declaration stale、absent declaration gap、unique writer、CLI/Buildr Web parity、transient execution separation、Finish shared consumer 与旧 authority absence。

#### Scenario: 运行 P0.4 focused verification
- **WHEN** 维护者修改 Verification domain、Application、declaration、Skill/contract、Finish 或 Buildr Web
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

### Requirement: 正式执行的 changed capability 必须自带可解析输入
Buildr Product 已登记为 Project Verification capability 的 changed selector command MUST 在正式 `buildr verification run` 中拥有闭合的 changed-path 输入契约。该 capability MAY 优先接受调用方显式提供的 changed paths；未提供时 MUST 使用自身声明的 Git/base 事实或返回可执行的 input diagnostic。通用 Verification runner MUST NOT 为某个 Product capability 硬编码其 selector 选择逻辑。

#### Scenario: Browser capability 使用显式 changed paths
- **WHEN** `product.browser-smoke` execution 收到合法的 `BUILDR_CHANGED_PATHS_JSON`
- **THEN** dispatcher MUST 校验并使用该路径集合生成 selector plan
- **AND** formal `verification run` MUST 能启动 Browser capability，不要求 Agent 额外手工修改命令

#### Scenario: Browser capability 从 Git fallback 选择
- **WHEN** `product.browser-smoke` execution 未收到 `BUILDR_CHANGED_PATHS_JSON` 且 execution root 能解析 verification base
- **THEN** dispatcher MUST 从 Git diff 收集 Product-relative changed paths并生成与显式输入一致的 selector plan
- **AND** selector plan MUST 保留 affected/full 模式、选择原因和未映射路径的 fail-closed 行为

#### Scenario: Browser capability 缺少可解析输入
- **WHEN** `product.browser-smoke` execution 没有显式 changed paths 且无法解析 Git verification base
- **THEN** dispatcher MUST 在启动 Chrome 前返回稳定的 input/base diagnostic
- **AND** MUST NOT 将该情况报告为 Browser 页面或业务交互失败

### Requirement: CI 必须覆盖最低 Node、当前 Node 与 npm Launcher 平台行为
CI MUST 在 `engines.node` 最低支持 Node 与当前 Node 24 上分别安装同一 npm tarball并验证 CLI、`buildr web --no-open`、health/readiness和Host Node identity；每个 hosted Host Node tuple MUST以该 tuple 实际启动 verifier 的绝对 Node executable 作为 authority，同时冻结子进程 PATH，MUST NOT回退读取development checkout的精确Node版本。development checkout jobs MUST另外使用Product声明的精确Node并验证hostile PATH不产生漂移。普通 affected/full/Candidate verification MUST使用无界面、隔离的Launcher逻辑路径；macOS与Windows平台 Launcher行为 MUST由对应OS runner上的显式平台启动入口集成（Platform Launcher Integration）验证本机wrapper/shortcut lifecycle，该集成 MUST不打开默认浏览器、不显示系统通知，且 MUST NOT声称验证Browser Use、SEA、installer、签名或无需Node的平台产品。

#### Scenario: 两个兼容 Host Node
- **WHEN** Candidate 执行最低 Node 与当前 Node jobs
- **THEN** 两者 MUST 消费同一tarball并分别通过普通CLI无HTTP、Web health/readiness与Host installation identity
- **AND** 每个 tuple 的父进程 executable 与子进程 PATH MUST绑定该 runner 实际 Node并输出audit，不得要求等于development `.node-version`
- **AND** tarball MUST NOT 为不同 Node 重新 pack

#### Scenario: development hostile PATH
- **WHEN** checkout PATH首位存在满足`engines.node`但不等于Product精确开发版本的Node
- **THEN** development bridge、Product npm wrapper与self-bootstrap前置检查 MUST拒绝漂移或选择显式提供的精确Node
- **AND** MUST NOT把该Node写入Workspace metadata

#### Scenario: 普通验证不调用平台GUI
- **WHEN** affected、full或Candidate默认步骤验证npm Launcher
- **THEN** verifier MUST直接使用隔离数据根执行无界面Launcher逻辑，并设置no-open与no-notify边界
- **AND** MUST NOT调用macOS LaunchServices、Windows Explorer/shortcut GUI、系统通知或默认浏览器

#### Scenario: 操作系统 Launcher 验证
- **WHEN** macOS 或 Windows runner 显式执行Platform Launcher Integration
- **THEN** verifier MUST 从隔离 npm installation 显式 install/status/launch/repair/uninstall 本机投射并验证 ownership
- **AND** MUST 证明普通 npm install 零桌面副作用且 wrapper/shortcut 不复制 Node 或 package
- **AND** launch MUST使用隔离Web Data Root、no-open和no-notify，不得留下浏览器标签页或系统弹窗

### Requirement: release smoke 必须验证 npm 安装与 Launcher 生命周期
Release smoke MUST 从唯一冻结 npm tarball 安装 Buildr，并 MUST 验证 CLI、Buildr Web、npm update authority 和显式 Launcher install/status/repair/uninstall。默认 release smoke MUST直接执行无界面Launcher入口，不得调用平台GUI或默认浏览器；显式Platform Launcher Integration MAY复用同一tarball与lifecycle，但 MUST作为独立调用和结果存在。两者 MUST验证 drift/foreign target fail closed 与 npm package/Workspace data 保留；不得用源码启动或平台 staging 目录替代。Launcher startup MUST使用独立、可审计且明显早于 capability timeout 的wall-clock readiness budget；失败时 MUST在清理临时安装根前保留 launcher log、脱敏 instance、process ownership/存活状态、elapsed/budget和exact Node evidence。

#### Scenario: npm tarball lifecycle
- **WHEN** 默认release smoke将tarball安装到隔离prefix
- **THEN** `buildr --help`、代表性CLI、`buildr web --no-open`、health/readiness和无界面`launcher install/status/launch` MUST使用该prefix的Host Node/package entry
- **AND** Launcher health runtime与启动日志 MUST证明子进程 executable、version和PATH首项匹配该Host Node
- **AND** ordinary install/CLI MUST NOT自动创建Launcher、启动HTTP、打开默认浏览器或显示系统通知

#### Scenario: Launcher 未在 readiness budget 内就绪
- **WHEN** Launcher没有在专用wall-clock budget内产生matching health，或进程提前退出
- **THEN** release smoke MUST fail closed并报告startup label、elapsed、budget、instance path、PID/进程组或不可用原因
- **AND** 已完成phase、launcher log、脱敏instance、process observation与exact Node audit MUST保存在Candidate diagnostics
- **AND** owned process与临时安装根 MUST继续清理，且无需等待外层job timeout或显示系统弹窗

#### Scenario: repair 与 uninstall
- **WHEN** verifier使binding中一个identity field漂移后执行status/launch/repair/uninstall
- **THEN** status/launch MUST fail closed，repair MUST从同一formal npm installation原子恢复，uninstall MUST只删除owned Launcher
- **AND** npm package与Workspace/user data MUST保持不变

#### Scenario: 显式平台入口验收
- **WHEN** 维护者或对应OS runner显式选择Platform Launcher Integration
- **THEN** verifier MUST通过真实`.app`或shortcut启动同一隔离安装，并验证平台入口可执行及健康实例复用
- **AND** 该结果 MUST独立于默认release smoke，且 MUST NOT打开浏览器、显示通知或声称完成Browser Use测试

### Requirement: 正式发布必须围绕一个不可变 npm tarball 收敛
Buildr 正式发布 MUST 只执行一次 `npm pack`，并 MUST 让 inventory、Host Node smoke、Launcher lifecycle、protected release transaction、Registry integrity readback 与安装后 smoke 使用同一 tarball bytes。任何需要重新 pack 的路径 MUST 停止并重新开始尚未产生公开事实的候选。

#### Scenario: 构建与验证单一 tarball
- **WHEN** 显式dispatch workflow进入可逆候选阶段
- **THEN** workflow MUST冻结tarball filename、size、SHA-256、SHA-512 integrity、payload digest与source commit
- **AND** 全部后续检查与唯一protected transaction MUST逐字节核对该identity

#### Scenario: publish 与 readback
- **WHEN** 可逆门禁全部通过且protected release transaction获得授权
- **THEN** workflow MUST在同一job完成authority/pre-tag/tag门禁后发布冻结tarball，并从Registry核对相同integrity后安装smoke
- **AND** MUST NOT上传GitHub Release binary Asset或使用Actions artifact作为公共下载

### Requirement: npm 正式发布恢复必须保留已完成的不可逆事实
发布恢复 MUST 以 tag/commit、npm package/version/integrity 和冻结 tarball identity 为 authority。npm version 缺失时只补齐 publish；完全相同时复用；漂移时停止。恢复 MUST NOT 重建 tarball、删除 tag、unpublish、改用本地 publish 或创建平台 Assets。

#### Scenario: npm publish 部分成功后重跑
- **WHEN** Registry 已有相同 version 与 integrity，但后续 readback 失败
- **THEN** rerun MUST 复用 Registry 事实并只重试 readback/smoke
- **AND** MUST NOT再次 publish 或 pack

#### Scenario: Registry bytes 漂移
- **WHEN** 相同 version 的 Registry integrity 与冻结 tarball 不同
- **THEN** workflow MUST fail closed 并保留所有公开事实供人工处理
- **AND** MUST NOT覆盖、撤销或生成替代 version

### Requirement: CI Candidate 必须由可验证的分布式覆盖计划组成
Buildr Product MUST 从统一 verification registry 为一个精确 source SHA 生成闭合的 CI Candidate coverage plan，并 MUST 让 preflight、artifact producer、平台 shard、Host Node tuple 和 aggregate gate 共同证明完整发布门禁；本地完整 Candidate MUST 继续从同一 registry运行全部 Candidate steps。

#### Scenario: 生成分布式 Candidate 计划
- **WHEN** CI 为 `dev → main` 的精确 PR head SHA 生成 Candidate plan
- **THEN** 每个 Candidate primary step MUST 至少属于一个已登记 coverage unit
- **AND** 非平台复验 step MUST 恰好属于一个 primary coverage unit
- **AND** 只有 registry 明确声明需要多平台证明的 step MAY 出现在多个平台 coverage unit
- **AND** 完整 coverage unit 并集 MUST 保留本地完整 Candidate 的全部 required gate identities

#### Scenario: 分布式计划漂移
- **WHEN** Candidate step 缺少 shard owner、出现未授权重复、引用未知 runner/platform、artifact consumer 没有 artifact source 或 Host Node tuple 不完整
- **THEN** registry/architecture verifier MUST 在启动昂贵 verifier 前 fail closed
- **AND** 诊断 MUST 标识缺失、重复或非法的 coverage unit

### Requirement: 候选 preflight 必须在昂贵作业前形成 phase boundary
CI Candidate MUST 先运行已登记的低成本确定性 preflight，并 MUST 只在 preflight passed 且 evidence 绑定 current source SHA/registry identity 后启动候选制品和昂贵平台 shard。

#### Scenario: Preflight 失败
- **WHEN** OpenSpec strict/quality/audit、registry、workflow contract、managed mutation、documentation或其他已登记 preflight owner失败
- **THEN** artifact producer 和全部昂贵 Candidate/Host Node jobs MUST NOT 启动
- **AND** aggregate gate MUST 以 preflight failed 或 missing evidence 失败

#### Scenario: Preflight 通过
- **WHEN** 全部 preflight owner通过
- **THEN** evidence MUST 记录精确 source SHA、registry identity、step results 和 timing
- **AND** 后续 job MUST 通过显式 job dependency消费该 phase result，而不是给无输出依赖的 Product steps伪造`dependsOn`

### Requirement: 分布式 Candidate 必须复用一个不可变候选 tarball
一个 CI Candidate run MUST 只为精确 source SHA 构建一次 npm candidate tarball，并 MUST 让全部 artifact consumer 和最低/当前 Host Node jobs 重新验证并消费同一 manifest 与 tarball bytes；PR Candidate artifact MUST NOT 成为正式 npm 发布物。

#### Scenario: Candidate artifact producer 完成
- **WHEN** preflight 通过且 artifact producer运行
- **THEN** producer MUST 冻结 filename、size、SHA-256、SHA-512 integrity、application payload digest、registry identity和source commit
- **AND** source commit MUST 等于该 run 的精确 PR head SHA 或手工选择 SHA
- **AND** workflow MUST 上传 tarball、pack metadata、manifest和producer evidence供同一 run 的consumer使用

#### Scenario: Candidate shard 消费 artifact
- **WHEN** shard 或 Host Node job下载候选 artifact
- **THEN** consumer MUST 在运行安装/发布生命周期前重新校验全部 artifact identity字段与预期 source SHA
- **AND** consumer MUST NOT重新执行`npm pack`

#### Scenario: 正式发布开始
- **WHEN** 最终`main`commit通过显式dispatch进入正式release workflow
- **THEN** release workflow MUST从该commit重新构建一次唯一正式tarball并继续既有发布integrity gate
- **AND** pre-main PR artifact MUST NOT被复用或声明为最终npm bytes

### Requirement: Candidate shard evidence 必须可独立重跑且可聚合
每个 Candidate shard和Host Node tuple MUST写出closed机器可读 evidence；稳定 aggregate gate MUST只在全部预期 evidence current、identity一致、覆盖完整且required results passed时通过。

#### Scenario: 全部分片通过
- **WHEN** aggregate读取一个Candidate run的全部evidence
- **THEN** evidence MUST绑定相同source SHA、registry identity和适用的artifact digest
- **AND** 每个预期shard与Host Node tuple MUST恰好存在一次
- **AND** 全部required coverage units MUST无遗漏且结果passed
- **AND** aggregate MUST输出稳定、与内部shard名称解耦的Required Check结果

#### Scenario: 分片失败或证据缺失
- **WHEN** 任一shard失败、blocked、未启动、evidence缺失/损坏、identity漂移或coverage不完整
- **THEN** aggregate gate MUST失败并列出精确shard、coverage unit和原因
- **AND** 不得用其他平台成功或旧run evidence替代

#### Scenario: 同一SHA重跑失败作业
- **WHEN** 维护者在同一workflow run内重新运行失败job
- **THEN** GitHub MAY复用已经通过的job和同一run artifact
- **AND** 只需重新执行失败shard及依赖它的aggregate gate
- **AND** 重跑shard MUST以同一逻辑artifact名称替换旧attempt evidence，不得因artifact不可变性产生同名冲突或把新旧结果同时交给aggregate
- **AND** 新source SHA MUST使旧evidence不可用并重新运行完整当前门禁

### Requirement: Windows高成本候选必须按失败恢复边界分片
CI Candidate MUST将Windows runtime/Launcher、Workspace/Task lifecycle与fresh build分成可独立调度和重跑的高成本shard，并 MUST在不降低场景覆盖的前提下控制每个shard的wall-clock和重复准备成本。

#### Scenario: Windows runtime 或 Launcher 失败
- **WHEN** runtime recovery、adapter、npm installation、Launcher或release smoke shard失败
- **THEN** Workspace/Task与fresh build已通过evidence MUST保持可复用
- **AND** 修复后同一SHA重跑 MUST不要求重新执行已通过的Windows shard

#### Scenario: Windows fresh build 晚期失败
- **WHEN** clean install、Web build或其harness cleanup在fresh-build shard失败
- **THEN** 失败 MUST只使fresh-build shard和aggregate gate失败
- **AND** runtime/Launcher与Workspace/Task shard结果 MUST保持独立

### Requirement: 候选生命周期必须区分产品清理失败与harness残留
Release smoke、fresh build和其他高成本lifecycle verifier MUST记录阶段timing，并 MUST把产品ownership cleanup失败与断言完成后的harness临时根删除失败区分处理。

#### Scenario: 产品owned cleanup失败
- **WHEN** Launcher、进程、端口、资源协调、Task Environment或owned Workspace cleanup无法证明ownership与完成状态
- **THEN** 对应verifier MUST失败并保留诊断
- **AND** aggregate gate MUST失败

#### Scenario: Harness临时根最终删除遇到Windows占用
- **WHEN** 全部产品断言与owned cleanup已通过，但最外层临时测试根删除返回Windows暂态`EPERM`或等价占用错误
- **THEN** verifier MUST记录warning、阶段耗时和保留路径
- **AND** 该harness残留 MUST NOT单独把已通过的产品行为改为failed

#### Scenario: 观察高成本阶段
- **WHEN** release smoke或fresh build成功或失败
- **THEN** timing evidence MUST至少区分准备、安装/构建、启动与状态演进、卸载/最终Doctor以及harness cleanup中的适用阶段
- **AND** 每个阶段的性能预算 MUST保持非阻断

### Requirement: 开发反馈、候选门禁与发布验证必须分离
Buildr release workflow MUST区分PR到`dev`的changed/affected反馈、`dev → main`的分布式完整Candidate与显式dispatch release workflow的正式发布物验证；Formal Finish或self-bootstrap successor直接推送`dev` MUST NOT自动启动GitHub Product verification，普通发布准备 MUST NOT无条件在本机和GitHub重复完整Candidate。

#### Scenario: PR向Dev提交开发修改
- **WHEN** 外部贡献、普通feature branch或需要hosted跨平台反馈的修改通过PR进入`dev`
- **THEN** CI MUST运行可解释的changed/affected反馈并保留适用Windows高风险结果
- **AND** 该反馈 MUST NOT被描述为完整Candidate

#### Scenario: Dev收到新提交
- **WHEN** Formal Finish把已完成正式Verification的source commit推送到`dev`，或self-bootstrap runner随后推送retained Workspace activation successor
- **THEN** GitHub `Verify Buildr` MUST NOT因该`dev` push自动启动
- **AND** source commit的正确性 MUST由current Task Verification与Finish remote readback证明
- **AND** successor的收敛 MUST由self-bootstrap runner的精确delta、push readback、development identity与最终Doctor证明

#### Scenario: 准备候选版
- **WHEN** 冻结候选需要进入`main`
- **THEN** GitHub分布式aggregate gate MUST作为完整Candidate权威
- **AND** 本地默认验证 MUST使用changed/focus/affected结果
- **AND** 只有验证框架自身变化、故障诊断或GitHub不可用等明确场景才要求额外本地完整Candidate

#### Scenario: 正式发布
- **WHEN** maintainer对已准备的current `main`候选明确授权发布
- **THEN** 本机 MUST只dispatch一次正式release workflow并跟踪同一run
- **AND** workflow MUST在审批前完成正式tarball可逆验证，并只让唯一protected transaction执行tag与npm/GitHub mutation

#### Scenario: 迁移分支保护
- **WHEN** 新aggregate check尚未在实际PR head SHA上通过并完成回读
- **THEN** 旧required contexts MUST继续保留
- **AND** 新gate稳定后才可切换required contexts并删除旧名称

### Requirement: Tag publish Host Node 验证必须在隔离 runner 中准备自身依赖
Buildr正式release workflow的每个Host Node job MUST在独立runner上依据current package lockfile准备checkout verification harness所需依赖，再执行同一冻结正式tarball的Host Node、CLI、Web与Workspace runtime role验证。每个job MUST显式提供同一candidate artifact中的tarball、`npm-pack` metadata与release artifact manifest，并由verifier在安装后identity验证前核对三者绑定的filename、version、application payload digest与immutable bytes。Job MUST NOT假设其他job的工作目录、`node_modules`或进程状态可见，且依赖准备与输入绑定 MUST NOT重建、修改或替换被冻结的tarball。

#### Scenario: 独立 Host Node runner 验证正式 tarball
- **WHEN** 显式dispatch release workflow为最低支持Node与current Node 24分别启动Host Node job
- **THEN** 每个job MUST checkout相同source commit、设置目标Node、依据lockfile独立安装verification harness依赖并下载同一candidate artifact
- **AND** 每个job MUST在依赖准备完成后向Host Node verifier显式传入candidate tarball、pack metadata与release artifact manifest
- **AND** 两个job MUST验证同一tarball filename、manifest、application payload digest与immutable bytes

#### Scenario: 前序 candidate job 已安装依赖
- **WHEN** candidate producer job已在自己的runner中执行依赖安装并冻结tarball
- **THEN** 后续Host Node job MUST NOT把该runner的`node_modules`或工作目录视为可用输入
- **AND** workflow contract MUST在Host Node job缺失本地依赖准备、依赖准备位于verifier之后、缺失release artifact manifest输入或该输入未指向下载的冻结candidate artifact时失败

### Requirement: 测试选择必须对空执行集合失败关闭
Buildr Product MUST 在 registry `node-test` 或受管测试 glob 启动 Node test runner 前解析实际测试文件集合，并 MUST 在集合为空、路径不存在或 selector 只命中非文件时以非零状态失败；Candidate evidence MUST NOT 把零测试执行记录为 passed。

#### Scenario: Registry node-test 引用了不存在的文件
- **WHEN** Candidate、Changed 或 Focus 选择一个 `node-test` step，且其全部登记文件均不存在
- **THEN** executor MUST 在启动 Node test runner 前失败
- **AND** 诊断 MUST 标识 step identity 与未解析到测试文件

#### Scenario: 受管测试 glob 没有匹配文件
- **WHEN** package script 或 verification adapter 展开一个受管测试 glob且匹配集合为空
- **THEN** invocation MUST 以非零状态结束
- **AND** timing/evidence MUST NOT生成 passed 的零测试 primary owner

#### Scenario: 退役空测试 owner
- **WHEN** 维护者确认某个旧 step 的关键事实已经由其他 primary owners 持有且原测试集合已删除
- **THEN** registry、shard、package script、文档和 aggregate expected set MUST 一致退役该 step
- **AND** 契约测试 MUST 证明剩余 owner 集合没有覆盖缺口或重复 primary owner

### Requirement: 正式验证能力必须保持单一 required primary delivery owner
Buildr Product MUST 只把 `product.delivery` 声明为普通 Task 的 required delivery capability；release artifact 专项 MAY 保持可独立选择，但 MUST NOT 在同一普通正式 delivery execution 中自动与已经覆盖相同 registry steps 的 `product.delivery` 叠加。

#### Scenario: Release Task 形成正式验证 policy
- **WHEN** stable Content Target 包含 release metadata、package、Launcher 或 publish workflow 变化
- **THEN** policy MUST 选择 required `product.delivery` 并由 changed planner覆盖适用 release primary owners
- **AND** optional `product.release-artifact-set` MUST NOT仅因同一 applicability path 自动成为第二个 required command

#### Scenario: 独立诊断 release artifact set
- **WHEN** 维护者明确要求独立核验 release artifact set且不使用普通 delivery capability代替该专项
- **THEN** `product.release-artifact-set` MAY 被显式选择
- **AND** 其 invocation、proves、effects 与 Result fact MUST 保持独立可读

### Requirement: 版本元数据变化必须与依赖图变化分开选择
Buildr Changed planner MUST 在拥有可验证 base/current JSON 时把仅版本字段变化按 affected范围处理，并 MUST 对依赖图、scripts、engines、bundle、lockfile结构、验证拓扑、解析失败或无法取得base的 package metadata 变化保持 full-scope。

#### Scenario: 只更新 package 与 lockfile 版本字段
- **WHEN** `package.json` 只改变顶层 `version`，且 `package-lock.json` 只改变顶层 `version` 与根 package `version`
- **THEN** planner MUST 不以 full-scope owner 为由选择全部 Candidate steps
- **AND** planner MUST 继续按真实 changed paths选择 package、release与文档 primary owners

#### Scenario: 依赖或脚本同时改变
- **WHEN** package metadata 还改变 dependency graph、scripts、engines、bundle、lockfile dependency或其他字段
- **THEN** planner MUST 选择 full-scope
- **AND** plan reason MUST 指明 package metadata 包含非版本变化

#### Scenario: 显式路径没有可比较 base
- **WHEN** 调用方仅传入 `package.json` 或 `package-lock.json` path而没有可验证 base/current 内容
- **THEN** planner MUST 保守选择 full-scope

### Requirement: Candidate CI 必须最小化串行前置与无效制品依赖
Buildr Candidate CI MUST 在不合并 evidence owner 的前提下复用 preflight 与 artifact runner setup，并 MUST 只让真实 artifact consumers等待和下载候选制品；互相隔离的 Windows Workspace/Task primary owners MUST 按资源压力拆成多个有界 shard。

#### Scenario: Candidate bootstrap 成功
- **WHEN** dev→main 或手工 Candidate run 启动
- **THEN** 一个bootstrap job MUST在同一checkout、Product精确development Node与依赖上先完成`preflight-macos`再完成`artifact-macos`
- **AND** job MUST 分别上传两份 shard evidence与一个不可变 Candidate artifact

#### Scenario: Preflight 失败
- **WHEN** bootstrap 中 cheap preflight 返回非零状态
- **THEN** artifact 构建和全部下游 verification shard MUST 不启动
- **AND** stable `Candidate gate` MUST 聚合为失败

#### Scenario: Windows shard 不消费 artifact
- **WHEN** `workspace-lifecycle-windows`、`task-workflow-windows` 或 `fresh-build-windows` 启动
- **THEN** workflow MUST NOT 下载或向 runner声明 Candidate artifact目录
- **AND** `runtime-windows` 与其他真实消费者 MUST 继续使用同一 bootstrap artifact

#### Scenario: Workspace 与 Task owner 并行
- **WHEN** Candidate 在资源受限 CI profile运行 Windows Workspace/Task验证
- **THEN** Workspace lifecycle owners与Task workflow owners MUST 位于独立 runner shard并可并行
- **AND** 每个 runner内部的`workspace-saturating`容量 MUST保持一
- **AND** 两个 shard 的 primary step并集 MUST 等于旧完整 owner集合减去已正式退役的 stale owner，且不得重复

### Requirement: Candidate aggregate gate 必须保持轻量且闭合集合
Buildr Candidate aggregate gate MUST 只依赖 pinned Node、checkout 内聚合源码与下载的 closed evidence set，并 MUST NOT需要安装 Product npm dependencies；优化 MUST 保持稳定 job name、source SHA、registry identity、artifact identity、primary coverage 与结果完整性检查。

#### Scenario: 聚合完整 Candidate evidence
- **WHEN** 全部 required shard evidence已下载
- **THEN** aggregate MUST 在没有 `node_modules` 的 checkout上运行
- **AND** aggregate MUST 接受精确一次的全部 expected evidence并输出 passed closed result

#### Scenario: Evidence 缺失或重复
- **WHEN** 任一 required shard evidence缺失、重复、source SHA漂移、registry不匹配或 artifact identity冲突
- **THEN** aggregate MUST 以非零状态失败
- **AND** `Candidate gate` MUST 保持 branch protection可见的稳定失败结论

### Requirement: 生产源码必须具有显式领域验证所有权
Buildr Product MUST 为 `src/application` 与 `src/infrastructure` 的生产模块维护可执行的 affected owner 契约；通用 Unit、Candidate 制品或 broad application payload 匹配 MUST NOT 单独充当领域 owner。每个生产模块 MUST 命中至少一个直接 Integration/System/Static owner，或进入包含 owner 与理由的显式闭合 allowlist；新增或移除路径造成缺口时 planner MUST 在启动 verifier 前 fail closed。

#### Scenario: 已有领域 Integration 的源码发生改变
- **WHEN** Task Entry、Task Retrospective 或其他已有领域 Integration 证据的生产源码进入 changed paths
- **THEN** planner MUST 选择包含该真实测试文件的有界领域 Integration owner
- **AND** MUST NOT 仅返回 Unit、Candidate tarball 或 application payload owner

#### Scenario: 新生产模块没有直接 owner
- **WHEN** 新增 `src/application` 或 `src/infrastructure` 模块且没有直接 owner或显式 allowlist 条目
- **THEN** planner 与 repository contract MUST 在启动测试进程前报告生产源码 owner coverage gap
- **AND** MUST NOT 根据相似文件名、CLI 可达性或 broad `src/**` 匹配猜测领域覆盖

#### Scenario: 生产模块明确只适用现有非领域证据
- **WHEN** 维护者确认某模块没有真实领域 Integration/System 场景且已有 owner 足以证明其风险
- **THEN** registry MAY 使用包含精确路径、owner 和理由的显式 allowlist
- **AND** 已存在直接领域 Integration 测试的模块 MUST NOT 通过 allowlist 绕过选择

### Requirement: 专属 Integration slice 必须保持唯一 primary ownership
Buildr Product MUST 从同一 registry 派生专属 Integration slice 与 general suite exclusions。Candidate 中每个 Integration 测试文件 MUST 恰好由一个 primary owner执行；直接 Integration 层入口 MAY 继续运行完整文件集合用于定位，但 Candidate general 与专属 slice MUST NOT 重复执行同一文件。

#### Scenario: Task read model 源码发生改变
- **WHEN** changed paths 命中 Task Entry、Overview、Planning Identity 或 Retrospective 实现
- **THEN** planner MUST 只选择对应有界 Task read-model Integration slice及其必要依赖
- **AND** MUST NOT 因该路径选择完整 general Integration owner

#### Scenario: Candidate 聚合全部 Integration
- **WHEN** 维护者或 CI 运行 Candidate profile
- **THEN** general Integration 与全部专属 slice 的测试文件并集 MUST 等于完整 Candidate Integration 文件集合
- **AND** 交集 MUST 为空

### Requirement: 本地 affected 与 Full 必须先通过同次 admission wave
Buildr 本地 `test:changed` 与 `test:candidate` MUST 在同一 verification execution 中先运行低成本 Fast steps；当原计划包含验证框架 canary时 MUST 同时纳入 admission wave。所有非 admission steps MUST 等待 admission 全部通过；任一 admission step失败时，尚未启动的重型 Integration、System、Workspace、package 或 artifact steps MUST 被 blocked且不得产生执行副作用。

#### Scenario: 验证框架变化包含廉价错误
- **WHEN** registry、planner、changed runner 或 execution contract 变化使 Fast 或 verification canary失败
- **THEN** 本地 affected/full MUST 在 admission wave结束时返回失败
- **AND** MUST NOT 启动依赖该 wave 的重型 Candidate steps

#### Scenario: 普通领域变化运行 affected
- **WHEN** changed plan非空且没有选择 verification canary
- **THEN** runner MUST 先运行 Fast admission并在通过后运行原 affected owners
- **AND** MUST NOT无条件加入与该领域无关的 System canary

#### Scenario: GitHub Candidate 运行分布式投影
- **WHEN** `dev → main`或手工 Candidate 使用 GitHub shard topology
- **THEN** 现有 preflight phase MUST 包含 Fast owners与verification canary，并在失败时阻止 artifact和verification phases
- **AND** stable `Candidate gate`、artifact复用与后续shard边界 MUST 保持不变

### Requirement: 同一验证执行必须复用 admission evidence
Buildr MUST 通过单一去重 DAG 组合 admission 与主计划；同一 step identity 在一次 changed/candidate execution中 MUST 最多执行一次，且 timing summary、diagnostics和最终状态 MUST属于同一run。系统 MUST NOT 为复用 admission 结果建立跨 invocation cache、第二Result store或调用方管理的 evidence writer。

#### Scenario: Fast step同时属于原始 Full plan
- **WHEN** Candidate plan已经包含 Unit、Contract或其他Fast step
- **THEN** admission composition MUST 复用该 step identity并只执行一次
- **AND** 后续步骤 MUST 把同一passed result作为依赖完成事实

#### Scenario: Admission 通过后主 DAG 失败
- **WHEN** admission steps全部passed但后续重型step失败
- **THEN** 最终 timing summary MUST 同时保留admission与主DAG结果
- **AND** 整体结果 MUST failed且不得把早期passed evidence误报为独立正式Verification Result

### Requirement: 开发 PR 验证必须按证据 owner 分配平台
Buildr 面向 `dev` 的 PR verification MUST 由 macOS 执行主要 changed/affected plan及其 admission wave，并 MUST 从同一 changed base 条件执行适用的 Browser capability。Windows MUST 只执行单一 verification registry 显式声明的平台敏感 development owners；workflow MUST NOT 复制测试文件清单或在 macOS/Windows 重复完整 affected plan。

#### Scenario: 普通非平台修改进入 dev
- **WHEN** PR changed paths 不命中任何 Windows platform-sensitive development owner
- **THEN** macOS MUST 执行主要 affected/admission feedback
- **AND** Windows projection MUST 明确没有适用步骤且不得运行完整 affected plan

#### Scenario: Windows高风险路径进入 dev
- **WHEN** PR changed paths 命中 registry 中声明 `developmentRunners: [windows]` 的 owner inputs
- **THEN** Windows runner MUST 执行该 owner及其registry依赖和资源边界
- **AND** MUST NOT 重复执行与平台无关的完整 Fast、Contract、Integration或System集合

#### Scenario: Browser-owned路径进入 dev
- **WHEN** macOS Browser plan 对 PR changed base 返回 `selected`
- **THEN** CI MUST 准备 Buildr Web依赖并执行同一base的 affected Browser verification
- **AND** MUST 保留 selector plan 与 job outcome，使 0 selector 不得冒充 Browser evidence

#### Scenario: Candidate topology 保持稳定
- **WHEN** `dev → main` 或手工 Candidate verification 运行
- **THEN** 现有 macOS/Windows Candidate shards、唯一 tarball与closed evidence aggregate MUST 保持完整
- **AND** 稳定 `Candidate gate` 名称、macOS runner与 branch protection兼容性 MUST NOT 因开发反馈重编排而改变

### Requirement: 日常 affected 重型验证必须使用最小可解释领域 DAG
Buildr Product MUST 根据直接实现 ownership、测试主证据、fixture、隔离方式和生命周期组织重型 verification owner；普通领域变化 MUST 只选择证明该风险所需的最小可解释重型 DAG，而 MUST NOT 因共享 general Integration、Verification System、Workspace System 或 Task Finish 聚合入口执行无关 sibling 领域。

#### Scenario: 普通领域实现发生改变
- **WHEN** changed path属于 Task、声明、OpenSpec、验证编排、Runtime、发布、数据存储、Project/Service、Worktree 或 Task Finish 的直接实现边界
- **THEN** planner MUST 选择该领域的 primary owner及真实 artifact dependency
- **AND** planner MUST NOT选择无直接证据关系的 sibling重型 owner
- **AND** Fast与适用 admission MUST 在重型 executor前执行并传播失败

#### Scenario: 聚合 owner 包含可独立选择的领域
- **WHEN** 一个 Integration 或 System owner包含变化频率、输入路径与生命周期不同的多个稳定领域集合
- **THEN** registry MUST 将集合声明为可独立 focus、计时和诊断的 primary owners
- **AND** 原稳定 identity MUST保留给语义连续的主领域
- **AND** aggregate/general runner MUST从同一 registry派生排除或文件集合

#### Scenario: 拆分后执行 Candidate
- **WHEN** Candidate profile或Candidate CI执行完整产品回归
- **THEN** 拆分前后的 Integration/System 行为文件并集 MUST相同
- **AND** 每个文件 MUST恰好由一个 primary owner执行且同一plan最多执行一次
- **AND** required owner MUST全部进入本地Candidate和原适用CI shard

### Requirement: 性能优化必须使用可复核的选择与计时证据
Buildr Product MUST 使用代表 changed-plan owner集合、registry调度成本和同一tree focused成功计时评估日常验证性能；一次共享runner墙钟或预算 warning MUST NOT单独决定 owner边界或永久预算。

#### Scenario: 验收日常开发性能优化
- **WHEN** 重型owner拓扑发生改变
- **THEN** verifier MUST在启动重型executor前证明文件union、唯一ownership、Candidate/CI coverage与代表changed paths
- **AND** 新增或显著改变的重型owner MUST在同一tree至少取得两轮focused成功样本
- **AND** 性能结论 MUST分别说明affected选择改善、focused耗时与Candidate完整覆盖

#### Scenario: 完整生命周期不适合继续拆分
- **WHEN** 一个超预算step持有单一完整lifecycle、共享不可变准备或不可拆分的跨组件acceptance事实
- **THEN** 维护者 MUST保留唯一primary owner而不得创建重复准备或重复happy-path证据
- **AND** 非阻断预算 MUST结合focused成功样本、full-load observation与合理波动余量独立校准
- **AND** budget adjustment MUST NOT改变step status、Candidate覆盖或失败传播

### Requirement: Candidate capability 必须有独立止损与实时可观测生命周期
Buildr Candidate runner MUST 为每个 capability 使用与非阻断 timing budget 分离的显式墙钟 timeout，并 MUST 在 spawn、周期 heartbeat、terminal completion 与 cleanup 阶段输出可审计事实。timeout、取消或进程退出异常时，runner MUST 回收完整 owned process group 和已观测后代；无法证明回收完成 MUST fail closed。

#### Scenario: capability 永久不退出
- **WHEN** 确定性 fixture 启动 capability、派生后代进程并永久等待
- **THEN** runner MUST 在 capability timeout 加有界 cleanup grace 内返回 `timed-out`
- **AND** 日志 MUST 标识 capability、elapsed、PID/PGID、completed/total 与 cleanup outcome
- **AND** 根进程和后代 MUST 全部退出，不等待外层 job timeout

#### Scenario: capability 正常完成
- **WHEN** capability 写入 stdout/stderr 后正常退出
- **THEN** runner MUST 在其他 active capability 结束前立即输出 completion event
- **AND** stdout/stderr、phase timing、diagnostic digest 与 terminal status MUST 保持完整一致

### Requirement: Candidate shard 必须增量保留非聚合 checkpoint
Candidate shard MUST 在每个 capability terminal completion 后原子保存绑定 source、registry、artifact、shard 和 expected step set 的 checkpoint。Checkpoint MUST 明确为非聚合中间态；aggregate gate MUST 继续只接受完整 terminal shard evidence，并 MUST 对缺失、部分、跨 source 或跨 artifact evidence fail closed。

#### Scenario: 一个 capability 超时前已有 capability 完成
- **WHEN** shard 中若干 capability 已完成，随后一个 capability 超时
- **THEN** artifact MUST 保留已完成 capability 的 stdout/stderr、completion facts 与最新 checkpoint
- **AND** shard MUST NOT生成可被 aggregate 接受的 passed terminal evidence

#### Scenario: shard 全部通过
- **WHEN** expected step set 中每个 capability 都 terminal passed且 cleanup clean
- **THEN** shard MUST 写完整 terminal evidence
- **AND** aggregate MUST继续核对全部权威 shard、source SHA、registry identity 与同一 Candidate artifact

### Requirement: core macOS Candidate 必须按语义 owner 分片且保持完整覆盖
Buildr MUST 从一个权威 core macOS registry 集合投影 3–4 个语义 shard，并 MUST 自动证明每个原 capability 有且只有一个 shard owner。重 Git/SQLite/CLI 生命周期 capability MUST 声明与测量一致的资源压力；workspace-saturating capacity 为 1 时 scheduler MUST NOT 让两个此类 capability 并发。

#### Scenario: registry 或 workflow 发生变化
- **WHEN** core capability、shard mapping、workflow job、artifact name、`needs` 或 aggregate input 被修改
- **THEN** contract test MUST 比较权威集合、唯一 owner、workflow job 与 aggregate expected shard
- **AND** 任一缺失、重复或漂移 MUST 在 Candidate capability 启动前失败

#### Scenario: 两个 workspace-saturating capability 同时 ready
- **WHEN** scheduler profile 对 `workspace-saturating` 声明 capacity 1
- **THEN** scheduler MUST 只启动其中一个并让另一个保持 queued
- **AND** timing summary MUST 记录资源分配和 queue duration

### Requirement: process lineage 采样调整必须绑定可复核基准
Buildr MUST 为 process lineage sampler 提供同 tree benchmark，记录采样周期、缓存窗口、tracker 数、样本次数与 wall/user/system timing。采样参数只能在基准显示成本下降且 timeout/后代回收正确性测试保持通过后改变；sampling MUST NOT被删除或被描述为已确认挂起根因。

#### Scenario: 调整采样周期或缓存
- **WHEN** 维护者提出减少 `ps` 调用或延长缓存窗口
- **THEN** 变更 MUST 附带相同 harness 的前后多轮 timing 和中位数
- **AND** 确定性后代进程 fixture MUST继续证明 lineage 观察与完整回收

### Requirement: retained cleanup fixture 必须拒绝测试文件作为产品入口
Task Finish retained cleanup 测试 MUST 显式证明 `currentProductInvocation` 解析到 delivered `bin/buildr.mjs`，并 MUST在任何调用前拒绝 Node test file、test runner argv 或非产品 CLI entry。fixture helper MUST NOT默认从 `process.argv[1]` 推断 Buildr CLI。

#### Scenario: 测试进程入口指向当前 test file
- **WHEN** retained cleanup fixture 在 Node test runner 中解析 product invocation
- **THEN** helper MUST使用显式 delivered CLI path或返回确定性错误
- **AND** MUST NOT再次执行 test file或形成递归测试进程

### Requirement: 治理测试必须优先证明结果不变量
Buildr Product MUST 让治理测试优先断言 machine-readable authority、authorization、identity、public result、effects 与 failure isolation；只验证 Skill 固定措辞、篇幅、章节位置或 Agent 方法顺序的测试 MUST NOT 成为行为正确性的 primary evidence owner。Skill frontmatter、capability binding、contract identity、受管投射和明确安全禁止项 MAY 由 Static Conformance 验证，但 MUST 与 Application 或公共入口的可观察结果保持分离。

#### Scenario: Skill 改写但公共行为不变
- **WHEN** Skill 在不改变 capability、contract、安全边界或公共结果的前提下调整措辞、章节或示例顺序
- **THEN** 行为测试 MUST继续通过
- **AND** Static Conformance MUST只检查稳定machine-readable边界或明确禁止项，不得要求恢复旧句子

#### Scenario: 公共结果违反治理不变量
- **WHEN** Application、CLI、HTTP或正式Result把局部失败扩大为无关动作阻塞，或把claimed success当作专业事实
- **THEN** 对应最低充分行为测试 MUST失败
- **AND** Skill文本仍包含正确说明 MUST NOT使该失败通过

### Requirement: 前序治理贡献必须具有跨路径一致性矩阵
Buildr Product MUST 为自动路径、Agent直接路径、PR/CI路径、正式事实对账和unrelated failure isolation维护一个可执行的结果不变量集合。集合 MUST复用各专业owner的最低充分测试，不得创建第二份Task、Parent、Verification或Release authority；每项关键事实 MUST只有一个primary evidence owner，辅助测试可以验证组合一致性。

#### Scenario: 多条合法路径形成同一结果
- **WHEN** 自动Finish、Agent直接Git/PR后对账或CI交付产生可独立核验的matching事实
- **THEN** 测试 MUST证明Delivery投影使用相同Task Contribution与remote identity不变量
- **AND** Activation、Environment Cleanup与Diagnostics MUST保持正交，不得反向撤销Delivery

#### Scenario: 无关模块失败
- **WHEN** Doctor、optional capability、Declaration、UI读取或其他局部owner返回与当前动作无关的attention或failure
- **THEN** 测试 MUST证明当前不消费该owner的安全动作仍可继续
- **AND** 真实authorization、identity、shared history、external side effect与cleanup ownership门禁 MUST继续失败关闭

### Requirement: 开发反馈、完整Candidate与正式Release不得重复主证据
Buildr Product MUST让focused/changed/affected开发反馈、冻结source上的完整Product Candidate与正式Release artifact验证各自只承担其primary evidence；同一执行内每个verification step MUST去重，同一冻结Candidate MUST只生成一个不可变tarball，正式publish MUST消费该tarball及matching Candidate evidence而不得重跑完整Candidate regression。

#### Scenario: 开发阶段选择affected反馈
- **WHEN** Agent或PR对未冻结内容运行changed、focus或affected入口
- **THEN** planner MUST只选择真实受影响owner及其admission依赖
- **AND** 该入口 MUST NOT隐式调用完整Candidate profile或把开发反馈声明为完整Candidate

#### Scenario: 冻结内容形成完整Candidate
- **WHEN** current source与planning bytes冻结并启动完整Product Candidate
- **THEN** verifier MUST运行完整required owner集合且每个step最多一次
- **AND** 所有artifact consumer MUST消费同一个source、registry与tarball identity

#### Scenario: 正式发布消费Candidate
- **WHEN** maintainer授权对matching current main Candidate执行正式release workflow
- **THEN** workflow MUST验证、恢复或一次性构建同一冻结tarball并完成tag、npm integrity、dist-tag、GitHub Release与安装后readback
- **AND** workflow MUST NOT调用完整Product Candidate入口或重新生成第二份可发布bytes
