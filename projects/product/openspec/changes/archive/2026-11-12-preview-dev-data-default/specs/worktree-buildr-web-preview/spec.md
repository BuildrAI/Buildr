## MODIFIED Requirements

### Requirement: 预览必须表达组件级来源且身份条可见

在数据目标与 reuse 来源可观察的基础上，任务预览的启动输出、列表结果、受认证 health 与页面预览身份条 MUST 进一步表达组件级来源：宿主工作树与 Product checkout、前端产物来源、Agent 运行单元 digest/generation 与 accepting 状态。预览身份条 MUST 对预览页面可见并表达上述来源；默认 Buildr Web MUST NOT 显示预览身份条。来源表达 MUST NOT 暴露凭证、令牌或来源数据根的敏感路径细节。新增来源字段 MUST 以可选字段出现，缺少该字段的旧实例 MUST 仍可被安全停止。

#### Scenario: 启动输出含组件来源

- **WHEN** 任务预览启动成功
- **THEN** 输出 MUST 同时表达宿主工作树/Product checkout、前端产物来源、Agent digest/generation、数据目标与 reuse 来源
- **AND** Agent 未就绪时 MUST NOT 输出冒充就绪的来源

#### Scenario: 页面身份条可见

- **WHEN** 用户打开任务预览页面
- **THEN** 页面 MUST 显示预览身份条，表达实例、工作树、Product checkout 与 Agent 组件来源
- **AND** 该身份 MUST 只读，MUST NOT 写入 Workspace 源资产

#### Scenario: 默认 Web 不显示

- **WHEN** 用户打开默认 Buildr Web（非预览）
- **THEN** 页面 MUST NOT 显示预览身份条

#### Scenario: 旧实例缺少来源字段仍可停止

- **WHEN** 健康旧实例的 owner 缺少新增组件来源字段
- **THEN** 预览 MUST 允许按原 owner 安全停止
- **AND** MUST NOT 因缺少新字段拒绝停止或清理

## REMOVED Requirements

### Requirement: task preview 必须保证任务数据可读

**Reason**: snapshot 播种与模式选项退役，数据目标单一化；由新增要求“task preview 必须使用单一真实数据目标”承接。

**Migration**: 旧 `--workspace-mode` 参数按未知选项显式失败；不再播种工作树任务库副本。

### Requirement: 预览实例可见共享登记工作空间

**Reason**: 模式分支退役；共享登记只读视图承诺由新增要求“预览共享登记只读视图与旧实例边界”承接，旧 snapshot 实例不合并边界保留为兼容条款。

**Migration**: 新实例默认合并共享登记；仍在运行的旧 snapshot 实例保持不合并。

### Requirement: 预览数据模式必须可观察且不可无声切换

**Reason**: 数据模式选项退役，预览数据目标单一化（任务工作树代码 + canonical workspace 数据）。模式可观察、旧实例安全停止与拒绝混用的承诺由新增要求“预览配置沿用默认开发版且旧实例兼容”承接。

**Migration**: 旧 `--workspace-mode` 参数按未知选项显式失败；旧 snapshot 实例由原 owner 停止或改用新实例名，不自动迁移数据。

## ADDED Requirements

### Requirement: task preview 必须使用单一真实数据目标

`--task` 预览 MUST 将任务代码来源与工作空间数据目标分开：从任务受管工作树运行产品代码，以证据中的 canonical workspace 为服务目标并使用开发版共享登记；MUST NOT 为此登记同 ID 的工作树或播种其数据库。预览 MUST NOT 提供工作空间数据模式选项；传入旧 `--workspace-mode` 参数 MUST 按未知选项在预览写入和启动前显式失败。共享数据目标 MUST 保留所有既有业务写入和候选来源校验，不将读取共享登记解释为解除写入保护。

#### Scenario: 默认直接使用真实工作空间

- **WHEN** 任务预览启动，开发版已登记其 canonical workspace
- **THEN** 预览 MUST 使用任务工作树代码成功启动并访问该真实工作空间
- **AND** MUST NOT 将同 ID 工作树再登记或创建工作树数据库副本

#### Scenario: 旧模式参数显式失败

- **WHEN** 调用方传入 `--workspace-mode shared` 或 `--workspace-mode snapshot`
- **THEN** 预览 MUST 按未知选项失败并给出明确诊断
- **AND** MUST NOT 播种、登记或启动任何进程

#### Scenario: canonical 数据不可读

- **WHEN** 任务预览的 canonical workspace 未登记或数据不可读
- **THEN** 预览启动 MUST fail closed 并报告数据不可准备
- **AND** MUST NOT 创建空库或工作树副本冒充任务数据

### Requirement: 预览共享登记只读视图与旧实例边界

Preview MUST 在保留自身独立 Workspace registry 的同时，提供开发版共享 Profile 登记列表的只读来源视图；共享条目标记来源，移除或其他登记写操作 MUST 不作用于共享登记文件。仍在运行的旧 snapshot 实例 MUST 保持不合并共享登记的既有边界，以免同 ID 的 canonical 与任务副本同时出现。该选择 MUST NOT 改变预览实例、会话、启动锁和自身登记的独立边界。

#### Scenario: 预览展示共享登记条目

- **WHEN** 共享 Profile 已登记真实 Workspace，Task 或 standalone Preview 查询列表
- **THEN** 结果 MUST 合并共享条目并标注来源，保留自身登记
- **AND** 共享登记文件 MUST 保持不变

#### Scenario: 旧快照实例不产生同 ID 冲突

- **WHEN** 旧 snapshot 实例仍在运行，工作树与开发版主目录拥有相同 UUID
- **THEN** 该实例列表 MUST 仅解析其自身的任务副本而不合并共享主目录
- **AND** MUST NOT 因共享主目录同 ID 拒绝启动或停止

#### Scenario: 同一真实目录的路径别名

- **WHEN** shared 登记根与服务目标是同一物理目录的不同路径拼写
- **THEN** MUST 解析为同一工作空间，不尝试重复登记
- **AND** 浏览共享条目 MUST NOT 写入本地或共享登记文件

#### Scenario: 从页面直接进入共享工作空间

- **WHEN** 用户在预览列表点击已登记的真实工作空间
- **THEN** 打开接口 MUST 返回可导航的工作空间身份，页面 MUST 能进入该空间
- **AND** MUST NOT 将导航变成资源准备、投射刷新、管理归属接管或共享登记写入

### Requirement: 预览配置沿用默认开发版且旧实例兼容

预览 MUST 默认以 `development` 为配置沿用来源，从开发版应用数据根沿用模型目录与智能体运行配置；调用方 MUST 能以 `--reuse none` 显式不沿用，或以 `--reuse development[:facet,…]` 显式选择 facet。`--refresh-reuse` MUST 可单独作用于默认沿用并刷新已沿用内容。默认沿用来源不可用时预览 MUST fail closed，报告明确 codedError 并提示显式退出方式，MUST NOT 无声降级为不沿用。owner、启动与列表结果 MUST 表达实际服务数据根 `environmentRoot` 与 reuse 来源，同时保留任务工作树代码身份。旧 owner 记录（含 snapshot 模式或缺失模式字段）MUST 仍可被原 owner 安全停止；健康旧实例的数据目标或模式与新请求不一致时 MUST 拒绝复用；保留工作树快照登记的实例 MUST 拒绝混用真实工作空间。

#### Scenario: 默认沿用开发版配置

- **WHEN** 任务预览未提供 `--reuse` 启动且开发版数据根可用
- **THEN** 预览 MUST 沿用 development 的默认 facet 并在 owner 与启动结果中如实表达 reuse 来源
- **AND** 沿用写入 MUST 限定在预览实例根内

#### Scenario: 显式不沿用

- **WHEN** 调用方提供 `--reuse none`
- **THEN** 预览 MUST 不沿用任何配置并成功启动
- **AND** owner MUST NOT 携带 reuse 事实

#### Scenario: 单独刷新默认沿用

- **WHEN** 调用方仅提供 `--refresh-reuse` 启动或复用实例
- **THEN** 预览 MUST 对默认 development 沿用执行刷新并如实记录 refreshed 结果
- **AND** `--reuse none --refresh-reuse` MUST 显式失败

#### Scenario: 开发版来源不可用

- **WHEN** 默认沿用所需开发版数据根不存在或不可读
- **THEN** 预览 MUST fail closed 并报告来源不可用与显式退出方式
- **AND** MUST NOT 以空配置冒充已沿用

#### Scenario: 健康旧快照实例拒绝复用

- **WHEN** 同实例名已有健康 snapshot 预览，调用方以新逻辑启动
- **THEN** MUST 拒绝复用，提示使用新实例名或由原 owner 停止
- **AND** MUST NOT 修改工作树数据库或原预览数据

#### Scenario: 旧记录安全停止

- **WHEN** 旧 owner 记录声明 snapshot 或缺失模式字段，停止请求的 owner 与 secret 匹配
- **THEN** MUST 允许按原 owner 安全停止并只清理该实例命名空间
- **AND** 普通停止后保留的快照登记 MUST NOT 无声混入新逻辑实例