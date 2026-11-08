## MODIFIED Requirements

### Requirement: task preview 必须保证任务数据可读

`--task` 预览 MUST 将任务代码来源与工作空间数据目标分开。默认 `--workspace-mode shared` MUST 从任务受管工作树运行产品代码，以证据中的 canonical workspace 为服务目标并使用开发版共享登记；MUST NOT 为此登记同 ID 的工作树或播种其数据库。显式 `--workspace-mode snapshot` MUST 以工作树为服务目标：目标 `.buildr/local/workspace.sqlite` 缺失时从 canonical workspace 播种一致的 SQLite 副本，已存在时复用并不覆盖。快照写入 MUST 只作用于副本。共享模式 MUST 保留所有既有业务写入和候选来源校验，不将读取共享登记解释为解除写入保护。

#### Scenario: 默认直接使用真实工作空间

- **WHEN** 任务预览未显式选择 snapshot，开发版已登记其 canonical workspace
- **THEN** 预览 MUST 使用任务工作树代码成功启动并访问该真实工作空间
- **AND** MUST NOT 将同 ID 工作树再登记或创建工作树数据库副本

#### Scenario: 首次启动播种快照

- **WHEN** 显式选择 snapshot 且目标工作树没有本地 workspace.sqlite
- **THEN** 预览 MUST 从 canonical workspace 生成一致副本并继续启动
- **AND** 结果 MUST 标识本次数据为指定时点的快照来源

#### Scenario: 已存在本地副本复用

- **WHEN** 显式选择 snapshot 且目标工作树已有本地 workspace.sqlite
- **THEN** 预览 MUST 复用现有副本
- **AND** MUST NOT 静默以 canonical 最新数据覆盖

#### Scenario: canonical 库不可读

- **WHEN** snapshot 模式需要播种而 canonical workspace.sqlite 缺失或损坏
- **THEN** 预览启动 MUST fail closed 并报告数据不可准备
- **AND** MUST NOT 创建空库冒充任务数据

### Requirement: 预览实例可见共享登记工作空间

shared 模式 Preview MUST 在保留自身独立 Workspace registry 的同时，提供开发版共享 Profile 登记列表的只读来源视图；共享条目标记来源，移除或其他登记写操作 MUST 不作用于共享登记文件。snapshot 模式 MUST 不合并共享登记，以免同 ID 的 canonical 与任务副本同时出现。该选择 MUST NOT 改变预览实例、会话、启动锁和自身登记的独立边界。

#### Scenario: 预览展示共享登记条目

- **WHEN** 共享 Profile 已登记真实 Workspace，shared 模式的 Task 或 standalone Preview 查询列表
- **THEN** 结果 MUST 合并共享条目并标注来源，保留自身登记
- **AND** 共享登记文件 MUST 保持不变

#### Scenario: 快照不产生同 ID 冲突

- **WHEN** snapshot 模式启动，工作树与开发版主目录拥有相同 UUID
- **THEN** 列表 MUST 仅解析预览自身的任务副本而不合并共享主目录
- **AND** MUST NOT 因共享主目录同 ID 拒绝启动

#### Scenario: 同一真实目录的路径别名

- **WHEN** shared 登记根与服务目标是同一物理目录的不同路径拼写
- **THEN** MUST 解析为同一工作空间，不尝试重复登记
- **AND** 浏览共享条目 MUST NOT 写入本地或共享登记文件

#### Scenario: 从页面直接进入共享工作空间

- **WHEN** 用户在 shared 预览列表点击已登记的真实工作空间
- **THEN** 打开接口 MUST 返回可导航的工作空间身份，页面 MUST 能进入该空间
- **AND** MUST NOT 将导航变成资源准备、投射刷新、管理归属接管或共享登记写入

## ADDED Requirements

### Requirement: 预览数据模式必须可观察且不可无声切换

预览 MUST 接受 `--workspace-mode shared|snapshot`，默认 shared，非法值 MUST 在预览写入和启动前失败。owner、启动与列表结果 MUST 表达工作空间模式和实际服务数据根 `environmentRoot`，同时保留任务工作树代码身份。健康实例的模式或数据根不同 MUST 拒绝复用，旧 owner 缺少模式时 MUST 按旧快照语义比较，但继续支持安全停止。

#### Scenario: 模式不同拒绝复用

- **WHEN** 同实例名已有健康快照预览，调用方以 shared 模式启动
- **THEN** MUST 拒绝复用，提示使用新实例名或由原 owner 停止
- **AND** MUST NOT 修改工作树数据库或原预览数据

#### Scenario: 启动身份如实说明来源

- **WHEN** 任务 shared 预览启动成功
- **THEN** owner MUST 同时报告任务工作树代码身份、shared 模式和 canonical 数据根

#### Scenario: 旧运行实例未声明数据模式

- **WHEN** 健康旧实例没有显式的数据根记录
- **THEN** MUST 拒绝直接复用以承诺新模式语义，仍允许按原 owner 安全停止
- **AND** 普通停止后保留的快照登记 MUST NOT 无声混入 shared 模式
