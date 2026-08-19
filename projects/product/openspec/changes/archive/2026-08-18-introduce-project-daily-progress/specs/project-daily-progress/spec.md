## ADDED Requirements

### Requirement: 每日演进必须按 Project 落在本机文件目录
Buildr MUST 将 Project 每日演进（Project Daily Progress）的权威存储为 canonical Workspace 根下的本机 YAML 文件 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`。`<project-code>` MUST 是当前 Workspace 已登记 Project code。该目录 MUST 被 root `.gitignore` 忽略，MUST NOT 进入 Git、Work Asset publication、Content Target 或跨机器同步，也 MUST NOT 被描述为 Buildr Server/Cloud 协作 authority。

#### Scenario: 为已登记 Project 写入当天文件
- **WHEN** Agent 对已登记 Project 提交合法当天 record payload
- **THEN** Buildr MUST 只在 `.buildr/daily-progress/<project-code>/` 创建或原子替换 `<YYYY-MM-DD>.yml`
- **AND** MUST NOT 写入 Task SQLite、其他 Project 目录或 Git 跟踪路径

#### Scenario: Project 未登记
- **WHEN** record 引用的 Project code 在当前 Workspace registry 中不存在
- **THEN** Buildr MUST fail closed 且零文件写入
- **AND** MUST NOT 创建对应子目录

#### Scenario: Git 检查每日演进目录
- **WHEN** Git scope 或 Work Asset discovery 遇到 `.buildr/daily-progress/`
- **THEN** Buildr MUST 将其保持为 machine-local ignored data
- **AND** MUST NOT stage、commit、push 或把目录缺失解释为远端数据丢失

### Requirement: 每天一份且允许覆盖重跑
每个 Project 的每个本机日历日 MUST 最多有一份 current 文件。显式 `--date` 或 payload 日期 MUST 使用 `YYYY-MM-DD`。省略日期时 MUST 使用本机本地时区日历日。对同一 Project 与同一日期再次成功 record MUST 原子覆盖该文件，MUST NOT 追加 run 历史或保留旧摘要副本。

#### Scenario: 同一天重复执行
- **WHEN** 同一 Project 在同一日期已有文件，且新的 record payload 校验通过
- **THEN** Buildr MUST 用新文件完整替换旧文件
- **AND** 旧推进项与旧 Task 关联 MUST 不再作为 current

#### Scenario: 另一天的文件不受影响
- **WHEN** record 写入 `2026-08-18.yml`
- **THEN** 同目录下其他日期文件 MUST 保持不变

### Requirement: 推进项必须与已有 Task 做 n:n 关联
一份每日演进文件 MUST 包含 0..N 条推进项（Progress Item）。每条推进项 MUST 包含稳定 item identity、非空摘要、可选署名显示名，以及 1..N 个本机已存在的 Task ID。Application 在写入前 MUST 通过 Task Record Application 确认每个 Task ID 存在于同一 canonical Workspace。一个推进项可以引用多个 Task；一个 Task 可以出现在同一天的多个推进项中。Daily Progress Application MUST NOT 创建、激活、修改或结束 Task。

#### Scenario: 一条推进项关联多个 Task
- **WHEN** Agent 提交的推进项包含两个已存在 Task ID
- **THEN** 写入后的文件 MUST 保留这两个引用
- **AND** 按 Task 读取当天演进时两个 Task 都 MUST 能看到该推进项

#### Scenario: 一个 Task 出现在多条推进项
- **WHEN** 同一天两件推进项都引用同一 Task ID
- **THEN** 该 Task 的反向查询 MUST 返回这两件推进项
- **AND** MUST NOT 声称其中一件是该 Task 的唯一 owner

#### Scenario: Task ID 不存在
- **WHEN** record payload 包含当前 Workspace 中不存在的 Task ID
- **THEN** Buildr MUST fail closed 且不覆盖当天文件

#### Scenario: 推进项没有 Task
- **WHEN** 某条推进项的 Task ID 列表为空
- **THEN** Buildr MUST 拒绝整次 record
- **AND** MUST NOT 写入部分推进项

### Requirement: 署名只是展示维度
推进项 MAY 包含非空署名显示名，供按人分组。Buildr MUST NOT 把署名解释为 Person registry、Git author、Agent identity、登录账号或权限主体，MUST NOT 因署名缺失拒绝合法 record。

#### Scenario: 按人展示
- **WHEN** inspect/list 请求按人分组且推进项带有署名
- **THEN** 响应 MUST 按署名显示名分组
- **AND** 没有署名的推进项 MUST 进入明确的未署名分组

### Requirement: 产品不得生成摘要或内置定时器
Buildr 产品核心 MUST NOT 扫描 Git 提交、推断 commit author、根据 Task updatedAt 自动撰写摘要，也 MUST NOT 提供每日演进 cron。record 的摘要正文 MUST 来自调用方已构造的 payload。是否定时再次调用由 Agent 宿主决定。

#### Scenario: 用户要求展示今天的演进但当天文件不存在
- **WHEN** Web 或 inspect 读取某 Project 的当天文件且文件不存在
- **THEN** Buildr MUST 返回明确空态或 not-found
- **AND** MUST NOT 根据 Git 或 Task 列表合成一份日报

### Requirement: Skill 必须在写入前同步最新代码
产品 Skill MUST 在调用 record 之前，对 Git 管理的 Workspace 执行与「更新 workspace」相同的最新代码同步：将已选定 upstream 的安全 Git update 交给 `buildr.git-operations/v1`，成功后再运行 `buildr sync <agent>`。working tree dirty、分叉冲突、upstream 不明、provider blocked 或最终 Doctor 未 ready 时，Skill MUST 停止且 MUST NOT 调用 record。非 Git Workspace MUST 跳过 Git update，但仍须在 sync/Doctor 适用时保持当前资产 current。

#### Scenario: 同步因 dirty tree 停止
- **WHEN** 写入前 Git update 因本地未提交改动 blocked
- **THEN** Agent MUST 报告 blocked 原因
- **AND** 当天每日演进文件 MUST 保持调用前状态

#### Scenario: 同步成功后写入
- **WHEN** Git update 与适用 sync/Doctor 均成功，且 payload 校验通过
- **THEN** Application MUST 写入或覆盖当天文件
- **AND** 文件中的 Task 关联 MUST 仍指向本机 Task Record，而不是远端协作者的 Task

### Requirement: init 与 sync 必须忽略每日演进目录
Git 管理的 Workspace 在 `init`、`update` 或 `sync` 时 MUST 幂等确保 root `.gitignore` 包含 `/.buildr/daily-progress/`。重复执行 MUST NOT 产生重复条目或改写无关 ignore 规则，也 MUST NOT 因此忽略整个 `/.buildr/`。

#### Scenario: 初始化新 Workspace
- **WHEN** Buildr 初始化 Git 管理的 Workspace
- **THEN** root `.gitignore` MUST 包含 `/.buildr/daily-progress/`

#### Scenario: 更新旧 Workspace
- **WHEN** `sync` 或 `update` 处理缺少该 ignore 条目的旧 Workspace
- **THEN** Buildr MUST 通过受管 source transaction 幂等补齐
- **AND** 已有每日演进文件 MUST 保持 ignored

### Requirement: CLI 与 JSON 必须提供 record、inspect 与 list
Buildr MUST 提供 Agent-machine CLI，至少支持对明确 Project 的 `record`、`inspect` 与 `list`，并 MUST 在 `--json` 时使用稳定 schema identity。`record` MUST 只写调用方提供的 closed payload；`inspect`/`list` MUST 只读已保存文件并解析仍存在的 Task 摘要。输出 MUST NOT 暴露本机绝对路径或 SQLite 路径。

#### Scenario: Agent 记录当天演进
- **WHEN** Agent 对已登记 Project 运行 JSON `record` 且 payload 合法
- **THEN** stdout MUST 返回单一 JSON 对象，包含 schema identity、Project、日期、写入的推进项计数与 Task 关联计数
- **AND** 对应 YAML 文件 MUST 成为该日 current

#### Scenario: 读取不存在的日期
- **WHEN** inspect 指定的 Project/日期没有文件
- **THEN** JSON MUST 返回 not-found 或等价空结果
- **AND** MUST NOT 创建文件

### Requirement: Buildr Web 必须只读展示每日演进
Buildr Web 项目详情 MUST 提供「每日演进」视图，默认展示本机今天，并 MUST 支持按日、按人、按任务切换。Task 详情 MUST 展示反向关联的推进项（含日期与摘要）。页面 MUST NOT 提供写入、删除或编辑推进项的控件；生成或重跑 MUST 交给 Agent。本机 HTTP API MUST 只读、Project-scoped 或 Task-scoped，MUST NOT 接受文件系统路径。

#### Scenario: 项目页按日查看
- **WHEN** 用户打开已有当天文件的 Project 每日演进视图
- **THEN** 页面 MUST 列出当天推进项、署名与可导航的关联 Task
- **AND** MUST NOT 修改文件

#### Scenario: 项目页按人查看
- **WHEN** 用户在同一天切换到按人分组
- **THEN** 页面 MUST 按署名显示名分组推进项
- **AND** 未署名推进项 MUST 单独分组

#### Scenario: Task 详情反查
- **WHEN** 某 Task 被当天一或多条推进项引用
- **THEN** Task 详情 MUST 展示这些推进项的日期、摘要与所属 Project
- **AND** MUST NOT 把推进项当作 Task 状态或进度 authority

#### Scenario: 当天尚无文件
- **WHEN** 用户打开没有当天文件的 Project 每日演进视图
- **THEN** 页面 MUST 展示空态并说明需要 Agent 生成
- **AND** MUST NOT 根据 Git 或 Task 列表自动填充
