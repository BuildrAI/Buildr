## ADDED Requirements

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

## MODIFIED Requirements

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
