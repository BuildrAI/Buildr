## REMOVED Requirements

### Requirement: 推进项必须与已有 Task 做 n:n 关联
**Reason**: 日报改为以当日 Git 提交为输入；没有 Task 的提交也必须能写入并展示。
**Migration**: 使用「提交可与已有 Task 做 0..N 关联」；他人提交禁止挂 Task。

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
**Reason**: 按人分组改为 Git commit author，不再使用自由署名显示名。
**Migration**: 使用提交上的 author name/email 与写入时声明的 `authorship`。

推进项 MAY 包含非空署名显示名，供按人分组。Buildr MUST NOT 把署名解释为 Person registry、Git author、Agent identity、登录账号或权限主体，MUST NOT 因署名缺失拒绝合法 record。

#### Scenario: 按人展示
- **WHEN** inspect/list 请求按人分组且推进项带有署名
- **THEN** 响应 MUST 按署名显示名分组
- **AND** 没有署名的推进项 MUST 进入明确的未署名分组

## ADDED Requirements

### Requirement: 日摘要必须回答项目当日四问
一份每日演进文件 MUST 包含非空日摘要 `daySummary`，字段为 `added`（新增了什么）、`updated`（更新了什么）、`deleted`（删除了什么）、`drawbacks`（有什么弊端）。这些正文 MUST 来自调用方已构造的 payload。Buildr MUST NOT 在读取路径根据 Git 或 Task 列表撰写这些字段。

#### Scenario: 合法日摘要写入
- **WHEN** Agent 提交包含四个非空摘要字段的合法 record payload
- **THEN** 写入后的文件 MUST 保留这四个字段
- **AND** inspect MUST 原样返回它们

#### Scenario: 缺少四问之一
- **WHEN** record payload 的 `daySummary` 缺少任一必填字段或字段为空
- **THEN** Buildr MUST fail closed 且不覆盖当天文件

### Requirement: 提交可与已有 Task 做 0..N 关联
一份每日演进文件 MUST 包含 0..N 条提交（Commit Entry）。每条提交 MUST 包含稳定 identity、subject、author name、author email、`authorship`（`self` 或 `other`），以及 0..N 个 Task ID。Application 在写入前 MUST 对非空 Task ID 通过 Task Record Application 确认存在于同一 canonical Workspace。Daily Progress Application MUST NOT 创建、激活、修改或结束 Task，MUST NOT 因 `taskIds` 为空拒绝合法提交。

#### Scenario: 自己的提交不关联 Task
- **WHEN** Agent 提交 `authorship=self` 且 `taskIds` 为空的提交
- **THEN** Buildr MUST 接受并写入
- **AND** inspect MUST 展示该提交且不含可导航 Task

#### Scenario: 自己的提交关联多个 Task
- **WHEN** Agent 提交 `authorship=self` 且包含两个已存在 Task ID
- **THEN** 写入后的文件 MUST 保留这两个引用
- **AND** 按 Task 读取时两个 Task 都 MUST 能看到该提交

#### Scenario: Task ID 不存在
- **WHEN** record payload 包含当前 Workspace 中不存在的 Task ID
- **THEN** Buildr MUST fail closed 且不覆盖当天文件

### Requirement: 他人提交必须展示且禁止关联 Task
`authorship=other` 的提交 MUST 被写入并在项目每日演进中展示。此类提交的 `taskIds` MUST 为空。Buildr MUST NOT 把他人提交绑定到本机 Task，也 MUST NOT 在 Web 上为他人提交渲染可导航 Task 芯片。

#### Scenario: 他人提交带 Task
- **WHEN** 某条提交声明 `authorship=other` 且 `taskIds` 非空
- **THEN** Buildr MUST 拒绝整次 record
- **AND** MUST NOT 写入部分提交

#### Scenario: 他人提交合法写入
- **WHEN** 某条提交声明 `authorship=other` 且 `taskIds` 为空
- **THEN** 文件 MUST 保留其 subject 与作者
- **AND** Task 反向查询 MUST NOT 返回该提交

### Requirement: 变更文件必须随提交一并保存
一份每日演进文件 MUST 包含当天更改过的文件列表（path 与变更类型）。该列表 MUST 来自调用方 payload，MUST NOT 由 inspect/GET 现场扫描 working tree。

#### Scenario: 写入包含变更文件
- **WHEN** Agent 提交含非空或空 `files` 数组的合法 payload
- **THEN** inspect MUST 返回同一文件列表
- **AND** MUST NOT 暴露本机绝对路径

## MODIFIED Requirements

### Requirement: 产品不得生成摘要或内置定时器
Buildr 产品核心 MUST NOT 在 inspect、list 或 HTTP GET 时扫描 Git 提交、读取 `git config user.email`、推断 commit author、根据 Task updatedAt 自动撰写摘要，也 MUST NOT 提供每日演进 cron。record 的日摘要、提交列表、作者归属与 Task 关联 MUST 来自调用方已构造的 payload。是否定时再次调用由 Agent 宿主决定。产品 Skill MUST 在写入前收集 Git，但这不属于产品读取路径。

#### Scenario: 用户要求展示今天的演进但当天文件不存在
- **WHEN** Web 或 inspect 读取某 Project 的当天文件且文件不存在
- **THEN** Buildr MUST 返回明确空态或 not-found
- **AND** MUST NOT 根据 Git 或 Task 列表合成一份日报

#### Scenario: 读取到 v1 旧文件
- **WHEN** inspect 遇到 `buildr.project-daily-progress/v1` 文件
- **THEN** Buildr MUST 返回 incompatible 或等价不可展示结果
- **AND** MUST NOT 把旧推进项改写成提交列表

### Requirement: Skill 必须在写入前同步最新代码
产品 Skill MUST 在调用 record 之前，对 Git 管理的 Workspace 执行与「更新 workspace」相同的最新代码同步：将已选定 upstream 的安全 Git update 交给 `buildr.git-operations/v1`，成功后再运行 `buildr sync <agent>`。同步成功后 Skill MUST 收集目标日期的全部 Git 提交与更改文件，读取本机 `git config user.email`，按大小写不敏感比较 author email，声明每条提交的 `authorship`，由 Agent 撰写四问摘要并判断自己的提交是否关联已有 Task。working tree dirty、分叉冲突、upstream 不明、provider blocked、最终 Doctor 未 ready 或无法收集 Git 时，Skill MUST 停止且 MUST NOT 调用 record。

#### Scenario: 同步因 dirty tree 停止
- **WHEN** 写入前 Git update 因本地未提交改动 blocked
- **THEN** Agent MUST 报告 blocked 原因
- **AND** 当天每日演进文件 MUST 保持调用前状态

#### Scenario: 同步成功后写入
- **WHEN** Git update 与适用 sync/Doctor 均成功，Agent 已收集当日提交与文件且 payload 校验通过
- **THEN** Application MUST 写入或覆盖当天 v2 文件
- **AND** 文件中的 Task 关联 MUST 仍指向本机 Task Record

### Requirement: CLI 与 JSON 必须提供 record、inspect 与 list
Buildr MUST 提供 Agent-machine CLI，至少支持对明确 Project 的 `record`、`inspect` 与 `list`，并 MUST 在 `--json` 时使用稳定 schema identity。`record` MUST 只写调用方提供的 closed payload（日摘要、提交、变更文件、可选 Task）；`inspect`/`list` MUST 只读已保存文件并解析仍存在的 Task 摘要。输出 MUST NOT 暴露本机绝对路径或 SQLite 路径。

#### Scenario: Agent 记录当天演进
- **WHEN** Agent 对已登记 Project 运行 JSON `record` 且 payload 合法
- **THEN** stdout MUST 返回单一 JSON 对象，包含 schema identity、Project、日期、提交计数与 Task 关联计数
- **AND** 对应 YAML 文件 MUST 成为该日 current

#### Scenario: 读取不存在的日期
- **WHEN** inspect 指定的 Project/日期没有文件
- **THEN** JSON MUST 返回 not-found 或等价空结果
- **AND** MUST NOT 创建文件

### Requirement: Buildr Web 必须只读展示每日演进
Buildr Web 项目详情 MUST 提供「每日演进」视图，默认展示本机今天，并 MUST 支持按日、按人、按任务切换。按日 MUST 展示日摘要四问、提交列表与变更文件。自己的、已关联 Task 的提交 MUST 提供可导航 Task 芯片；自己的未关联提交 MUST 展示且无 Task 芯片；他人提交 MUST 展示作者且无 Task 芯片。Task 详情 MUST 只展示引用了该 Task 的条目。页面 MUST NOT 提供写入、删除或编辑控件；生成或重跑 MUST 交给 Agent。本机 HTTP API MUST 只读、Project-scoped 或 Task-scoped，MUST NOT 接受文件系统路径。

#### Scenario: 项目页按日查看
- **WHEN** 用户打开已有当天 v2 文件的 Project 每日演进视图
- **THEN** 页面 MUST 展示四问摘要、提交列表与变更文件
- **AND** MUST NOT 修改文件或现场扫描 Git

#### Scenario: 项目页按人查看
- **WHEN** 用户在同一天切换到按人分组
- **THEN** 页面 MUST 按 commit author 分组提交
- **AND** MUST NOT 为他人提交显示 Task 芯片

#### Scenario: Task 详情反查
- **WHEN** 某 Task 被当天一或多条自己的提交引用
- **THEN** Task 详情 MUST 展示这些条目的日期、摘要与所属 Project
- **AND** MUST NOT 把条目当作 Task 状态或进度 authority

#### Scenario: 当天尚无文件
- **WHEN** 用户打开没有当天文件的 Project 每日演进视图
- **THEN** 页面 MUST 展示空态并说明需要 Agent 生成
- **AND** MUST NOT 根据 Git 或 Task 列表自动填充
