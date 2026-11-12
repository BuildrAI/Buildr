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

### Requirement: 任务预览必须准备并钉住候选运行产物

任务预览（`--task`）启动 MUST 在拉起候选宿主前，于该任务工作树内准备候选运行产物：构建 Agent 私有包并物化到工作树宿主的 `node_modules/@buildr-ai/buildr-agent`，并构建 `web-dist`（含所需 DTO）。工作树相关源码相对上次准备发生变化时 MUST 重新准备；未变化时 MAY 复用已准备产物。准备的所有写入 MUST 限定在任务工作树内，MUST NOT 写入开发版应用数据根、canonical Workspace 或其他预览。准备失败 MUST 在启动宿主前 fail closed 并报告失败阶段，MUST NOT 以陈旧或未准备的私有包冒充候选代码。

#### Scenario: 首次启动准备候选产物
- **WHEN** 任务工作树尚无已准备的候选私有包或 `web-dist`，调用方启动任务预览
- **THEN** 预览 MUST 先在工作树构建 Agent 私有包与 `web-dist`，再拉起宿主
- **AND** 构建写入 MUST 只出现在该任务工作树内

#### Scenario: 源码变化后重新准备
- **WHEN** 工作树 Agent 或前端源码相对上次准备已变化，再次启动同一任务预览
- **THEN** 预览 MUST 重新准备受影响的候选产物
- **AND** MUST NOT 复用与当前源码不一致的陈旧私有包或 `web-dist`

#### Scenario: 准备失败不启动
- **WHEN** 候选产物准备在某一阶段失败
- **THEN** 预览 MUST 在拉起宿主前失败关闭并报告失败阶段与原因
- **AND** MUST NOT 报告 `started`，MUST NOT 写入开发版数据根或 canonical Workspace

### Requirement: 任务预览必须等待候选后台就绪

任务预览 MUST 以工作树已物化私有包计算候选 Agent 运行单元 digest，并使候选宿主以该运行单元连接其独立数据根下的后台。预览 MUST 观察后台运行状态，仅当实际 `currentDigest` 与候选 digest 一致、`accepting` 为真且无待切换运行单元时才宣告 `started`。候选 digest 不符、后台未 accepting、换版待定或观察超时 MUST fail closed，报告明确 codedError 并回收已启动进程；MUST NOT 静默回退开发版后台，MUST NOT 在后台未就绪时报告启动成功。候选后台 MUST 只绑定预览独立数据根，MUST NOT 接管、恢复或重放开发版执行。

#### Scenario: 候选后台就绪才宣告启动
- **WHEN** 候选宿主后台以候选 digest 启用且 accepting
- **THEN** 预览 MUST 在观察到该一致状态后返回 `started`
- **AND** 启动结果 MUST 包含该候选 digest 与后台 generation

#### Scenario: 实际 digest 与候选不符
- **WHEN** 后台实际 `currentDigest` 与候选 digest 不一致
- **THEN** 预览 MUST fail closed 并报告来源不一致
- **AND** MUST NOT 报告 `started` 或回退开发版后台

#### Scenario: 就绪超时回收
- **WHEN** 在超时内后台仍未达到候选 digest 且 accepting
- **THEN** 预览 MUST 报告候选后台未就绪的 codedError，并认证停止已启动的预览进程
- **AND** 停止未确认时 MUST 保留现场并报告，MUST NOT 冒充清理成功

#### Scenario: 不接管开发版执行
- **WHEN** 候选后台在预览独立数据根下启动
- **THEN** 候选后台 MUST NOT 读取开发版进程记录作为控制入口，MUST NOT 恢复或重放开发版中断执行
- **AND** 开发版后台与其执行 MUST 保持不变

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
