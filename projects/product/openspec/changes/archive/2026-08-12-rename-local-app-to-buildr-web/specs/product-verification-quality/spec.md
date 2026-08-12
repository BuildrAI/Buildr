## MODIFIED Requirements

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

### Requirement: P0.4 验证必须覆盖 current Result authority
Buildr Product focused/fast/candidate tests MUST 覆盖 Result closed schema、Project scope declaration binding、atomic replacement rollback、target/declaration stale、absent declaration gap、unique writer、CLI/Buildr Web parity、transient execution separation、Finish shared consumer 与旧 authority absence。

#### Scenario: 运行 P0.4 focused verification
- **WHEN** 维护者修改 Verification domain、Application、declaration、Skill/contract、Finish 或 Buildr Web
- **THEN** affected tests MUST 证明 Result current path 与 failure preservation
- **AND** MUST 不以 fixture 字段存在代替真实 CLI、filesystem 或 HTTP journey
