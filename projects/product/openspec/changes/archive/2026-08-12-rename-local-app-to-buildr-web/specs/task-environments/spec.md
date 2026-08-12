## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Task Environment Application 必须提供唯一确定性操作边界
Buildr MUST由共享Task Environment Application实现Plan `record/inspect`、Environment `prepare`、live `inspect`、saved-current read、`resource register/release`与`cleanup`，并 MUST让CLI、Skill、Local App、Preview和Finish复用对应Application action。`prepare` MUST幂等承担首次准备与恢复；live `inspect` MUST只读观察matching current的Plan、executable/input identity和output facts；saved-current read MUST只读取Workspace SQLite current。

#### Scenario: Agent 准备或恢复环境
- **WHEN** Agent运行`buildr task environment prepare <task-id>`并可选提供Plan
- **THEN** CLI MUST只把结构化参数交给Application并返回当前`ready / blocked`结果
- **AND** 已有matching current时 MUST从同一环境恢复，不得创建第二份环境或单独restore命令

#### Scenario: CLI只读检查环境
- **WHEN** CLI `inspect`请求当前Task Environment
- **THEN** Application MUST只读比较current Plan、resolved executable/input identities和expected outputs
- **AND** MUST不写Receipt、执行Plan command、创建目录、启动/停止资源或cleanup

#### Scenario: Local App读取保存事实
- **WHEN** Local App GET请求Environment read model
- **THEN** Application MUST只读取最近一次正式lifecycle action保存的SQLite current
- **AND** MUST不探测文件系统、执行Plan或形成新的ready结论

#### Scenario: 人或产品模块只读检查环境
- **WHEN** CLI `inspect`、Local App或其他产品模块请求当前Task Environment read model
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

### Requirement: inspect与saved GET必须保持不同只读语义
CLI Environment `inspect` MUST只读观察saved Plan绑定的声明、Recipe、executable、inputs与outputs；Local App GET MUST只读取SQLite current。两者 MUST不执行Step、不创建或修复outputs、不替换Plan或Receipt。

#### Scenario: Local App刷新Environment Tab
- **WHEN** 用户刷新Environment Tab
- **THEN** 页面 MUST展示最近保存的Declaration、Recipe、scope与Step状态
- **AND** GET MUST不打开Project声明或文件系统形成新结论
