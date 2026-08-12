## MODIFIED Requirements

### Requirement: CI 必须覆盖最低 Node、当前 Node 和目标桌面平台
Buildr CI MUST 将任务分支的 Windows 平台预检、Host Node 兼容性和完整受管运行时 Candidate 分开；合入 `dev` 前 MUST 在 Windows Node 24.15.0 和当前 Node 24 上运行定向平台预检，最终候选 MUST 在 macOS、Windows 各运行一份完整受管运行时 Candidate，并 MUST 在 macOS、Windows 的最低 Node 24.15.0 与当前 Node 24 代表点运行 Host Node 兼容验证。矩阵 MUST 禁用 fail-fast，且 CI MUST NOT 为相同冻结 tree 在 `main` push 或独立 release smoke job 中重复已经成立的完整 Candidate 证据。

#### Scenario: 任务分支验证 Windows 平台边界
- **WHEN** pull request 以 `dev` 为目标触发产品 CI
- **THEN** Windows Node 24.15.0 和当前 Node 24 job MUST 安装锁定依赖
- **AND** 两个 job MUST 直接使用各自 Host Node 运行覆盖路径身份、子进程启动、runtime 文件一致性、Task/worktree 生命周期和发布包生命周期的定向平台预检
- **AND** 任一 job 失败 MUST NOT 取消另一个 job
- **AND** CI MUST NOT 为该任务分支重复运行完整 macOS/Windows Candidate

#### Scenario: 验证最低 Node 版本
- **WHEN** `dev -> main` pull request或手工候选验证触发最终候选 CI
- **THEN** macOS、Windows Node 24.15.0 job MUST 各自运行 Host Node compatibility
- **AND** 两个 job MUST 随后准备 Workspace 声明的受管 Node 并各自运行一次完整 `test:candidate`
- **AND** evidence MUST 分别记录 Host Node 和受管 Node 的精确版本与 executable identity

#### Scenario: 验证当前 Node 与桌面平台
- **WHEN** `dev -> main` pull request或手工候选验证触发最终候选 CI
- **THEN** macOS、Windows 当前 Node 24 job MUST 各自只运行 Host Node compatibility
- **AND** compatibility MUST 验证 engines、锁定依赖、npm tarball pack/install、安装后 CLI 初始化/诊断以及 SQLite、Process、Filesystem 等 Node 版本敏感边界
- **AND** compatibility MUST NOT 经过受管 Node wrapper 或重复完整 Candidate

#### Scenario: 最终候选复用内置发布冒烟
- **WHEN** macOS、Windows 的完整受管运行时 Candidate job 运行
- **THEN** 每个 job MUST 通过 Candidate 内置的 `release-tarball-smoke` 验证打包、安装和 CLI 生命周期
- **AND** workflow MUST NOT 建立覆盖相同 lifecycle 的独立 macOS 或 Windows `release-smoke` job

#### Scenario: 相同 main tree 不重复完整 Candidate
- **WHEN** 已通过 branch protection 的 `dev -> main` 候选 tree 合入 `main`
- **THEN** `main` push MUST NOT 再次触发相同完整 Candidate
- **AND**正式 tag 发布验证 MUST 由独立 release artifact 契约负责

### Requirement: 候选验证必须避免重复制品和无边界串行执行
Buildr candidate verifier MUST 在同一冻结候选 run 内复用不可变 npm tarball和已准备的只读测试输入，并 MUST 将 System 文件按 primary owner、可变状态与资源压力拆为可独立计时的 steps；已证明使用隔离状态的 owner MUST 采用有界并行，同时保持逐阶段失败、完整文件归属和 timing 可观察性。

#### Scenario: 多个 verifier 使用候选 tarball
- **WHEN** candidate verifier 运行 tarball inventory、package parity 和 release smoke
- **THEN** orchestrator MUST 只生成一个候选 tarball 和对应 pack metadata
- **AND** 各 verifier MUST 使用该只读制品，但 MUST 继续使用彼此隔离的安装 prefix 和 workspace

#### Scenario: System 文件按资源 owner 调度
- **WHEN** Candidate 编排全部 System tests
- **THEN** 每个 System test file MUST 恰好归属一个 Candidate primary owner
- **AND** fresh build、runtime recovery、Task Finish、Workspace lifecycle、Local App HTTP、App process 和轻量验证契约 MUST 可按不同资源容量独立调度与计时
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
- **AND** 每个测试 MUST 继续隔离 `.buildr`、SQLite、Git worktree、Task/Finish、Local App runtime state 与其他可变 Workspace 内容

#### Scenario: fresh build 保持真实依赖闭包
- **WHEN** `system-fresh-build` 验证 Task Environment 的多 Service preparation
- **THEN** 测试 harness MAY 复用当前已安装 controller 而不额外复制源码并执行 controller `npm ci`
- **AND** 被测 Buildr 与 Buildr Web checkout MUST 从没有 `node_modules` 的状态分别执行锁定安装
- **AND** 被测 checkout MUST 使用受管工具链真实完成一次 `build:web`

#### Scenario: 并行阶段发生失败
- **WHEN** 同一并行批次中的任一 verifier 返回非零状态
- **THEN** candidate verifier MUST 以非零状态失败
- **AND** timing summary MUST 保留失败 step 的名称、exitCode、durationMs 以及该批次已完成 step 的结果

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
