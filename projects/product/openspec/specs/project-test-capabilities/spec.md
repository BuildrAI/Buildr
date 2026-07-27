# project-test-capabilities Specification

## Purpose
定义 Project 可选测试能力声明的模型、成熟度、执行阶段、门禁强度、授权边界与验证证据要求，使团队能逐步发现、试运行并确认稳定门禁，同时保持未声明项目的零配置兼容。
## Requirements

### Requirement: Project 可以可选声明任意测试能力集合
Buildr MUST 允许已登记 Project 通过可选 `verification.yml` 声明任意数量的测试能力，并 MUST 将测试声明与 Skill capability binding、Service metadata 和具体技术栈分层保持分离。

#### Scenario: Project 声明多种测试能力
- **WHEN** 团队为一个 Project 声明单元、单服务、跨服务或其他自定义测试能力
- **THEN** 每项能力 MUST 使用稳定 id，并声明命令、成熟度、适用阶段、覆盖范围、环境依赖、副作用和授权
- **AND** Buildr MUST NOT 限制能力数量或要求固定测试层级名称

#### Scenario: Project 没有测试声明
- **WHEN** 已登记 Project 不包含 `verification.yml`
- **THEN** Project MUST 继续有效，doctor MUST NOT 因声明缺失产生 finding
- **AND** 普通开发和验证 MUST NOT 以初始化测试声明为前置条件

### Requirement: 测试声明区分成熟度、阶段与门禁强度
Project 测试能力声明 MUST 分别表达 maturity、stages 和逐阶段 enforcement，并 MUST 防止未成熟能力被自动提升为阻断门禁。

#### Scenario: 初始化产生发现态候选
- **WHEN** Agent 扫描到一个尚未由团队确认覆盖和环境边界的测试入口
- **THEN** 候选能力 MUST 保持 `maturity: discovered`
- **AND** 该能力 MUST NOT 自动执行或成为 required gate

#### Scenario: 试运行能力积累证据
- **WHEN** 团队允许一个候选能力进入真实任务试运行
- **THEN** 能力 MAY 进入 `trial` 并只以 advisory 方式参与已声明阶段
- **AND** 失败 MUST 被报告但不得仅因此阻断 Candidate

#### Scenario: 稳定能力成为门禁
- **WHEN** 团队确认测试命令、覆盖范围、环境、副作用和阻断价值
- **THEN** 能力 MAY 提升为 `stable` 并在适用阶段声明 `required`
- **AND** 非 stable 能力声明 required 时 Project 诊断 MUST 报告无效声明

### Requirement: 测试声明表达环境、副作用与授权边界
每项测试能力 MUST 提供足以在执行前判断环境就绪度、副作用和授权的事实，并 MUST 使用可审计的 argv 与有界相对 cwd 表达命令。

#### Scenario: 低副作用本地测试
- **WHEN** stable 能力只产生已声明的本地临时构建产物且授权为 implicit
- **THEN** Agent MAY 在适用验证阶段自动执行
- **AND** Result Evidence MUST 记录该授权决策

#### Scenario: 测试需要共享环境或外部状态
- **WHEN** 能力需要启动服务、访问共享环境、修改持久数据或存在 unknown 副作用
- **THEN** Agent MUST 在执行前取得与实际副作用匹配的明确授权
- **AND** 缺少授权时能力 MUST 进入 blocked 或 skipped 集合并说明原因

#### Scenario: 声明路径越界
- **WHEN** command cwd、applicability path 或 effect write path 逃逸 Project/workspace 可解析边界
- **THEN** Project 诊断 MUST 拒绝该声明
- **AND** Agent MUST NOT 执行对应命令

### Requirement: Agent 引导测试能力持续演进
`task-verification` MUST 响应“初始化测试声明”“更新测试声明”及等价意图，并 MUST 允许 Agent 在普通任务中发现新增测试后提出安全的增量声明和成熟度建议。

#### Scenario: 首次初始化测试声明
- **WHEN** 用户要求初始化测试声明
- **THEN** Agent MUST 扫描当前 scope 的 Rules、POM、脚本、CI、项目文档和可访问 Service 测试入口
- **AND** Agent MUST 生成 `mode: augment` 的候选声明供团队审阅，不得自动启动新的 Spring、端到端或外部环境测试

#### Scenario: 新增单服务测试后增量补充
- **WHEN** 普通实现任务新增或发现尚未声明的单服务测试入口
- **THEN** Agent MUST 提示新的能力候选，并 MAY 在用户明确要求更新或自动补充声明时增量写入 discovered/trial 条目
- **AND** 增量更新 MUST 保留现有团队确认字段，不得自动将新能力设为 stable 或 required

#### Scenario: Agent 建议提升成熟度
- **WHEN** 某 trial 能力已积累可重复成功、可接受耗时、环境稳定和副作用边界证据
- **THEN** Agent MUST 向团队说明依据并 MAY 建议提升为 stable
- **AND** advisory 提升为 required MUST 取得团队确认

### Requirement: 声明支持兼容增强与权威政策模式
Project 测试声明 MUST 支持 `augment` 和 `authoritative` 模式，并 MUST 保证模式切换不会伪造 Candidate 完整性。

#### Scenario: augment 声明参与旧政策发现
- **WHEN** Project 使用 `mode: augment`
- **THEN** provider MUST 组合已确认声明和 legacy policy discovery
- **AND** 无法确认完整 Candidate 范围时 MUST 如实报告 `candidateCompleteness: unconfirmed`

#### Scenario: authoritative 声明完整编排 Candidate
- **WHEN** 团队明确将声明切换为 `mode: authoritative`
- **THEN** Candidate MUST 选择全部适用的 stable required Candidate gates，且不得按 Git diff 缩小集合
- **AND** 声明无有效 Candidate gate、依赖无效或必要环境/授权缺失时 MUST fail closed 或返回 incomplete

### Requirement: Project doctor 只校验存在的测试声明
Buildr doctor MUST 在已登记 Project 存在 `verification.yml` 时校验 schema、稳定 id、字段闭集、命令边界、引用关系和成熟度/门禁约束，并 MUST 保持诊断只读。

#### Scenario: 有效声明通过诊断
- **WHEN** Project 测试声明结构有效且引用关系闭合
- **THEN** doctor MUST 将该 Project 测试声明识别为有效上下文资产
- **AND** doctor MUST NOT 执行任何测试命令或环境探测

#### Scenario: 声明包含未知依赖或循环
- **WHEN** capability dependsOn/supersedes 引用未知 id 或 dependsOn 形成循环
- **THEN** doctor MUST 报告可定位的声明 finding
- **AND** provider MUST NOT 基于无效图启动动态编排

### Requirement: Project 验证声明必须显式表达资源处理策略
Project `verification.yml` MAY 登记稳定 verification resources，且能力 MAY 通过 resource claim 引用它们。每个资源 MUST 选择 `isolated`、`namespaced`、`coordinated` 或 `external` 策略，并 MUST 声明与策略一致的容量、namespace、清理和授权边界；未声明资源的既有 Project 与能力 MUST 保持兼容。

#### Scenario: task-local 临时目录天然独立
- **WHEN** Project 将资源声明为 `isolated`，能力只在 task environment 内写入该资源
- **THEN** provider MUST NOT 为该资源建立 Workspace 共享租约
- **AND** evidence MUST 披露 task-owned 或 provider-owned 清理责任

#### Scenario: 测试数据使用任务命名空间
- **WHEN** Project 将资源声明为 `namespaced` 并提供 namespace 环境变量
- **THEN** provider MUST 为当前 task/run 生成稳定且安全的 namespace 值并传给能力命令
- **AND** 两个并发 task environment MUST NOT 获得相同 namespace

#### Scenario: 浏览器或重型 fixture 容量有限
- **WHEN** Project 将资源声明为 `coordinated` 且容量为 N
- **THEN** 同一 canonical Workspace 同时持有该资源的 verification runs MUST 不超过 N
- **AND** 超出容量的 run MUST 等待、超时或取消，不得绕过声明启动

#### Scenario: 外部共享状态需要授权
- **WHEN** Project 将数据库租户、第三方账号或共享业务数据声明为 `external`
- **THEN** provider MUST 在执行前取得与实际副作用匹配的显式授权
- **AND** Buildr MUST NOT 自动创建、清理或把排队描述为外部状态隔离

#### Scenario: 声明包含未知或不完整资源
- **WHEN** capability 引用未知 resource，或 strategy 所需的 capacity、namespace、cleanup 或 authorization 不完整
- **THEN** Project doctor MUST 拒绝该声明并返回可定位 finding
- **AND** provider MUST NOT 启动对应 capability
