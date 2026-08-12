## ADDED Requirements

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
