# worktree-buildr-web-preview Specification

## Purpose

Define isolated Buildr Web previews for concurrent task worktrees.

## Requirements

### Requirement: 预览必须提供可核验的运行身份
每个preview MUST持久化并返回实例名、task id、matching Worktree、运行Buildr Product的repository checkout、branch、HEAD、dirty状态与URL。CLI启动/查看输出、受认证health响应和页面开发预览身份条 MUST表达同一身份；默认Buildr Web MUST不显示preview身份条。

#### Scenario: Agent 启动预览后交接验收链接
- **WHEN** `buildr web preview start <instance>` 成功启动或复用实例
- **THEN** 输出 MUST包含URL、实例名、task id、Worktree、Product checkout、branch、HEAD与dirty状态
- **AND** Agent MUST 能仅凭该输出向用户提供可区分的验收链接

#### Scenario: 用户查看并行预览页面
- **WHEN** 用户打开任一 preview 的页面
- **THEN** 页面 MUST展示只读的开发预览实例名、Task Worktree和Product checkout identity
- **AND** 页面 MUST NOT 将该身份写入 Workspace 源资产或允许页面修改它

### Requirement: 预览实例必须可枚举并安全停止
Buildr MUST提供`buildr web preview list`与`buildr web preview stop <instance>`。list MUST只枚举Buildr preview命名空间中的实例及其健康状态；stop MUST仅能认证停止matching Preview owner的实例，且不得停止默认实例、其他Task Worktree或其他实例。

#### Scenario: 查看多个 preview 状态
- **WHEN** Agent 运行 `buildr web preview list`
- **THEN** Buildr MUST分别返回每个preview的实例名、owner identity、Product checkout、URL、PID与健康或陈旧状态
- **AND** MUST NOT 枚举或管理非 Buildr 进程

#### Scenario: 停止当前任务 preview
- **WHEN** Agent停止一个健康preview、请求Worktree evidence与owner匹配且状态记录的secret可认证该实例
- **THEN** Buildr MUST 请求该 preview 的显式退出并确认其不再健康
- **AND** MUST 只清理该 preview 命名空间内的实例记录

#### Scenario: 停止陈旧 preview 记录
- **WHEN** Agent停止一个无法通过健康检查且owner仍匹配当前Task Worktree的preview
- **THEN** Buildr MUST 只清理该 preview 命名空间内的陈旧记录
- **AND** MUST NOT 影响其他 preview、默认 Buildr Web 或 Workspace 源资产

### Requirement: task preview 不得改变 development launcher
`buildr web preview` MUST直接使用请求Task Worktree中的Buildr Product checkout启动预览，且 MUST NOT安装、更新、替换、停止或重新指向`Buildr Web Dev.app`、全局开发CLI或默认Buildr Web。

#### Scenario: Task Worktree启动preview
- **WHEN** Agent从Task Worktree启动preview
- **THEN** 运行identity MUST指向该Worktree中明确的Buildr Product checkout
- **AND** `/Applications/Buildr Web Dev.app` 的安装 identity MUST 保持不变

### Requirement: task worktree 必须支持隔离的 Buildr Web 预览实例

Buildr MUST提供`buildr web preview start <instance>`，让Agent从指定Task Worktree或独立Git checkout的Buildr Product入口启动或复用独立loopback Preview。实例名 MUST通过稳定安全校验；Preview MUST使用独立于默认Buildr Web和其他Worktree的状态目录、Workspace registry、实例记录与启动锁，并默认随机选择可用端口。Task-owned preview 的可执行性、目标归一与数据可读性按本 capability 的对应要求约束。

#### Scenario: 启动两个不同任务预览

- **WHEN** 两个不同Task Worktrees分别使用不同实例名启动Preview
- **THEN** Buildr MUST让两个健康实例同时监听各自loopback URL
- **AND** 两个Preview MUST NOT复用实例记录、启动锁或Workspace registry，默认Buildr Web保持不受影响

#### Scenario: 同一Task Worktree复用健康预览

- **WHEN** 同一Task、Workspace、Worktree evidence与Product checkout使用相同实例名再次启动健康Preview
- **THEN** Buildr MUST复用原实例并返回同一URL与owner identity
- **AND** MUST NOT额外启动第二个进程

#### Scenario: 不同Task Worktree请求已被占用的实例名

- **WHEN** 健康Preview的Task、Workspace或Worktree owner与新请求不一致
- **THEN** Buildr MUST拒绝复用或停止该Preview
- **AND** MUST返回当前owner并要求更换实例名或由真实owner停止

### Requirement: Task Preview 的公开标签必须使用 Buildr Web Preview
Task Preview 的页面、日志、验证结果和文档 MUST 使用 Buildr Web Preview；`local-app-preview` provider、`BUILDR_LOCAL_APP_PREVIEW` 和 preview JSON schema MUST 作为稳定兼容 identity 保留。

#### Scenario: 启动 Task Preview
- **WHEN** Agent为Task Worktree启动preview
- **THEN** 可见标签 MUST 为 Buildr Web Preview
- **AND** 旧 provider、环境变量和 schema reader MUST 继续可用

### Requirement: Task Preview 必须由 Preview Application 持有资源所有权
Buildr Web Preview MUST在自身实例store中保存Task ID、canonical Workspace、matching Worktree evidence、实际Buildr Product checkout、repository、branch、HEAD、PID、URL、secret与provider identity。Preview MUST独立执行start/list/stop和失败回收，不得要求Environment ready或写Environment Receipt。

#### Scenario: 从Task Worktree启动Preview
- **WHEN** Agent提供Task ID与canonical Workspace，且matching Worktree evidence证明实际checkout
- **THEN** Preview MUST从该checkout中的Buildr Product入口启动独立loopback实例
- **AND** 只有进程健康且owner写入成功后才 MUST返回started

#### Scenario: Preview启动后owner写入失败
- **WHEN** 子进程已经健康但Preview owner无法安全保存
- **THEN** Preview MUST使用刚创建的ChildProcess/secret认证停止该实例并确认回收
- **AND** MUST NOT报告资源已由Task或Worktree代管

#### Scenario: Preview停止
- **WHEN** stop请求的Task、Workspace、Worktree evidence、实例owner与secret完全匹配
- **THEN** Preview MUST停止目标实例并删除本实例状态
- **AND** MUST NOT修改Task Record或Worktree evidence

### Requirement: task preview 启动必须可调用且目标解析一致

`buildr web preview start <instance> --task <task-id>` 与对应 `stop` MUST 在组合好的运行时中直接可执行；target 为 canonical workspace 根或该任务的 linked worktree 根时 MUST 归一到同一证据身份并解析出同一工作树。runtime 端口缺失、workspace 未初始化或工作树证据不可用 MUST 按既有 codedError 语义失败并给出明确诊断与 nextActions，MUST NOT 以运行时类型错误（如 `is not a function`）作为最终失败。

#### Scenario: canonical 目标启动任务预览

- **WHEN** Agent 提供 `--task` 且 `--target` 为 canonical workspace 根
- **THEN** 预览 MUST 从匹配工作树证据指向的 checkout 内 Buildr Product 入口启动
- **AND** owner MUST 记录 taskId、canonical workspace、证据路径与 planDigest

#### Scenario: 工作树目标启动任务预览

- **WHEN** `--target` 直接指向该任务的 linked worktree 根
- **THEN** 预览 MUST 解析到与 canonical 目标一致的证据与工作树 checkout
- **AND** MUST NOT 因目标拼写形式报工作树不可读取

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

### Requirement: 安全追加工作树成员不得改变既有预览归属

同一任务（Task）安全追加工作树（Worktree）成员后，预览（Preview）MUST 通过同一任务（Task）、主工作空间（Canonical Workspace）、已有根目录、登记文件及原有成员路径和分支（Branch）的当前核验继续判断归属，MUST NOT 仅因 `planDigest` 改变而拒绝复用或停止。已有成员减少或身份变化 MUST 继续拒绝；停止仍须认证目标实例并保持原有资源边界。

#### Scenario: 新增来源后停止已有预览

- **WHEN** 当前完整集合扩展，原预览（Preview）记录的所有成员仍由当前事实核验为同一对象
- **THEN** 停止 MUST 继续通过归属核验，并只停止指定实例

#### Scenario: 追加失败但原预览成员有效

- **WHEN** 新增成员未创建成功，原预览（Preview）全部成员仍有效
- **THEN** 停止 MUST 允许依照有效成员核验原预览（Preview），不要求失败新增成员就绪

#### Scenario: 原有成员身份改变

- **WHEN** 同名记录的原有成员被移除、路径或分支（Branch）改变，或当前事实无法核验其身份
- **THEN** 预览（Preview）MUST 拒绝复用或停止，不把摘要变化本身当成安全追加证明

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
