## ADDED Requirements

### Requirement: Buildr必须成为公共Node Test Context Runtime的真实消费者
Buildr Product verification MUST通过公共Node Test Context Runtime注册至少一个Task Application纵向测试集合，组合worker-scoped Application state与隔离Workspace lease；通用Runtime authority MUST位于发布源码，Buildr专用provider MUST位于test adapter边界。

#### Scenario: Task Application集合执行
- **WHEN** Task Application注册测试在Context-aware runner中执行
- **THEN** 每个Worker Host MUST最多组装一次matching Buildr Application Runtime和Workspace seed
- **AND** 每个并发test MUST获得独立可写sandbox且自动release

#### Scenario: 黄金边界不适合共享
- **WHEN** CLI、Git、SQLite跨进程、Workspace初始化、Finish、自举、cleanup或Release本身是主要待证明事实
- **THEN** primary owner MUST继续穿过真实边界
- **AND** 预建Context MUST NOT跳过、替代或重复该主证据

### Requirement: Buildr层级并发必须约束Context Worker Host
Verification scheduler MUST把实际worker/process grant传递给Context-aware runner；runner Host数量、Context parallel safety和owner resource demand MUST共同限制并发，Execution Record MUST区分Host、Context与测试体成本。

#### Scenario: Core owner取得有限grant
- **WHEN** Context owner取得workers等于N的execution grant
- **THEN** inner runner MUST启动不超过N个Host
- **AND** timing evidence MUST记录host count、cache create/hit、lease wait、reset、evict与destroy

### Requirement: Context架构收益必须用真实迁移与残余成本证明
Buildr MUST比较相同source tree上的旧owner成本、Context-aware focused多轮和Core多轮；验收 MUST同时证明缓存命中、隔离、失败清理、Candidate/Release membership不退化，并 MUST诚实记录无法由Context消除的黄金生命周期成本。

#### Scenario: 公共组件完成首个接入
- **WHEN** Runtime API、Node runner与Buildr provider实现完成
- **THEN** contract MUST证明非Buildr内存Context可独立运行且Buildr Task Application真实使用同一API
- **AND** 性能报告 MUST分别列出Context创建、sandbox materialize、body、reset和wall-clock变化

## MODIFIED Requirements

### Requirement: Buildr Test Context 必须以 runner-independent Pool 管理不可变 seed
Buildr Product MUST在发布源码提供runner-independent的Node Test Context Runtime，负责通用definition、cache identity、scope、lease、reset与dirty/evict，并 MUST通过稳定npm子路径供非Buildr Node.js项目消费。Buildr Product MUST另外在test-only边界提供Buildr immutable-seed Pool；每个Buildr seed Context MUST由稳定key和唯一provider拥有，Pool MUST在同一verification plan中最多prepare一次不可变seed，并 MUST通过独立sandbox lease向worker或test case交付可写状态。Project verification declaration MUST NOT包含该Product测试策略；npm package MUST NOT包含Buildr专用seed provider、Workspace fixture或verification profile。

#### Scenario: 多个 owner 使用同一 Context
- **WHEN** 一个verification plan中的多个step声明相同Buildr seed Context key
- **THEN** outer runner MUST最多prepare一次matching seed
- **AND** 各step/worker MUST只消费同一seed identity派生的独立sandbox

#### Scenario: 直接运行单个测试文件
- **WHEN** 维护者绕过outer runner直接运行已登记Context的测试文件
- **THEN** worker-local Runtime和Buildr Pool MUST在当前进程内最多create/prepare一次matching Context state
- **AND** 进程结束时 MUST清理自身拥有的state、seed与sandbox

#### Scenario: Context identity或边界被污染
- **WHEN** cache identity、marker、provider、realpath containment、seed content identity或sandbox isolation不匹配
- **THEN** acquire或release MUST fail closed并输出稳定context diagnostic
- **AND** runner MUST NOT静默重建基线后把原执行记录为passed

#### Scenario: 非Buildr项目使用公共Runtime
- **WHEN** 一个Node.js项目从公开npm子路径注册内存Application Context
- **THEN** Runtime MUST在相同Worker Host按配置身份复用matching state
- **AND** 该项目 MUST NOT需要Buildr Workspace、CLI、seed provider或verification registry
