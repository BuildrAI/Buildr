## ADDED Requirements

### Requirement: Buildr Web 必须只读投影任务研发 read model
Buildr Web MUST 为正式 Task 提供只读“研发”视图，并 MUST 通过 Task Development Application `inspect` 展示 Development presence、最近一次正式 Development action 同row保存的适用性、planning nodes/dispositions、Task context、Content Target、verification policy、Candidate/generation、Planning/Verification/Completion gates、decision、明确风险与最近一次 Development handoff。HTTP 与 Web 层 MUST NOT 直接读取或解析 `development.yml`、重新计算 identity/currentness、复制专业 artifact/Result body、提供 Receipt mutation 或注册公共`buildr task development` CLI。`inspect` MUST只查询Development current row与读取terminal facts所需的Task/Finish current rows。

#### Scenario: 查看 current Development
- **WHEN** 保存的Development applicability status为`planning`、`developing`、`candidate-current`或`handoff-current`
- **THEN** 页面 MUST用中文分别显示“规划中”“研发中”“候选已就绪”或“研发交接已就绪”
- **AND** MUST将planning、Task context、Content Target、policy、Candidate与handoff的保存时current/stale/missing/disposition作为独立事实展示，不得在GET中改写Task Record或重新计算

#### Scenario: Development 尚未形成
- **WHEN** Application `inspect`返回`status: missing`且没有Development Receipt
- **THEN** 页面 MUST显示“尚未形成研发回执”的空状态
- **AND** 概览、证据和环境视图 MUST继续正常工作，不得创建空Receipt或提供浏览器写操作

#### Scenario: 只有planning facts
- **WHEN** Receipt已经记录proposal、design、review disposition或其他planning nodes，但Content Target仍为null
- **THEN** 页面 MUST展示节点authority、reference、disposition与适用的waiver来源，并显示“规划中”
- **AND** MUST NOT把尚未形成的Content Target、policy或Candidate显示为stale或failed

#### Scenario: 当前环境不可观察但历史交接存在
- **WHEN** Receipt存在但迁移后没有保存applicability，或observedAt早于已知外部变化
- **THEN** 页面 MUST保留展示planning、候选、决定和最近一次研发交接摘要，并明确显示“状态来自最近一次正式研发动作”或unknown
- **AND** 页面 MUST NOT在读取时重新观察Environment、Git、Content Target或declaration

#### Scenario: 安全读取 Development
- **WHEN** 客户端对已登记Workspace和真实Task发起`GET /api/v1/workspaces/:workspaceId/tasks/:taskId/development`
- **THEN** API MUST返回Task Development Application operation read model并使用no-store语义
- **AND** query参数、未知Task、POST、PUT、PATCH与DELETE MUST fail closed，且Task及全部专业current bytes MUST保持不变

#### Scenario: 展示最小研发信息
- **WHEN** Development Receipt包含长identity、多个planning nodes/handoff或专业Result reference
- **THEN** 页面 MUST默认只展示完整但次级排版的当前identity、节点disposition、候选代次、三个gate摘要、决定、风险数量和最近一次handoff
- **AND** MUST NOT展示开发日志、source diff、完整命令输出、隐藏推理、专业artifact/Result body或全部历史handoff列表

## MODIFIED Requirements

### Requirement: Task Development 必须维护唯一 current Receipt
Buildr MUST 为每个正式 Task 在 Workspace SQLite 中提供至多一份 `buildr.task-development-receipt/v2` current Receipt。Task Development Application MUST 是 Receipt normalization、identity、persistence、失效、planning snapshot、Candidate generation、decision 与 handoff 的唯一 writer 和 reader；Skill、Finish、Task Record、Environment、Review 与 Verification MUST NOT 直接读写 repository 或 SQLite。

#### Scenario: 首次观察 Development context
- **WHEN** active Task 具有 matching ready Task Environment，且调用方请求建立 Development current facts
- **THEN** Application MUST 在 transaction 中创建唯一 Development current Receipt并返回 read model，不要求 Planning Review ready或Content Target已经形成
- **AND** store MUST NOT 创建 Candidate、decision、handoff或历史占位记录

#### Scenario: 其他模块需要 Development facts
- **WHEN** Finish、Buildr Web 或 Skill 需要当前研发事实、Candidate或handoff
- **THEN** consumer MUST 调用 Task Development Application inspect或专用 action
- **AND** persistence reader 的静态调用方 MUST 只有 Task Development Application

#### Scenario: 读取既有v1 Receipt
- **WHEN** 旧File Store中存在合法`buildr.task-development-receipt/v1`
- **THEN** Application MUST将该文件保持inert且返回SQLite current Receipt或missing
- **AND** inspect与下一次合法Development mutation MUST NOT读取、投射或迁移v1文件

#### Scenario: 旧 Development YAML 存在
- **WHEN** `.buildr/tasks/<task-id>/development.yml` 仍存在或使用旧 schema
- **THEN** Application MUST 将其保持 inert且只读取 SQLite current Receipt
- **AND** MUST NOT 导入、升级、删除或生成兼容 YAML

### Requirement: Task Development operation 必须限制重复 Workspace 观察

Task Development Application MUST把每个公开 action 作为独立 operation scope；同一同步 action 内对相同 canonical Workspace 的重复 Structured Store访问 MUST复用已成功验证的 canonical root与不可变package migration assets，并 MAY复用由Task Record与Task Environment owner Application对相同输入形成的完整read model。scope MUST在返回或失败时结束，后续 action MUST重新观察 current Workspace；系统 MUST NOT跨process或跨action缓存Task、Environment、Review、Verification、Development read model或SQLite connection。

#### Scenario: 同一 action 重复访问 Structured Store

- **WHEN** 一个 Task Development action 通过多个专业 Application或repository重复访问相同 canonical Workspace
- **THEN** 系统 MUST在该action内最多执行一次Git checkout canonical observation
- **AND**相同Task Record或Environment输入的复用值 MUST来自对应owner Application，不得由Task Development直接读取专业repository
- **AND**每个repository MUST继续保留自身读取、transaction、validation与close语义

#### Scenario: action 结束后重新确认

- **WHEN** 前一个Task Development action已成功、失败或抛出异常，随后启动新的action
- **THEN** 新action MUST重新确认canonical Workspace与current专业facts
- **AND**前一个scope的缓存 MUST不可见

#### Scenario: 长寿命 runtime 中 Workspace 发生变化

- **WHEN** Buildr Web或其他长寿命consumer复用同一runtime并在两个Task Development action之间发生Git或Workspace变化
- **THEN** 第二个action MUST不复用第一个action的canonical判定或专业read model
- **AND**系统 MUST保持现有fail-closed诊断

## REMOVED Requirements

### Requirement: Local App 必须只读投影任务研发 read model
Buildr Local App MUST 为正式 Task 提供只读“研发”视图，并 MUST 通过 Task Development Application `inspect` 展示 Development presence、最近一次正式 Development action 同row保存的适用性、planning nodes/dispositions、Task context、Content Target、verification policy、Candidate/generation、Planning/Verification/Completion gates、decision、明确风险与最近一次 Development handoff。HTTP 与 Web 层 MUST NOT 直接读取或解析 `development.yml`、重新计算 identity/currentness、复制专业 artifact/Result body、提供 Receipt mutation 或注册公共`buildr task development` CLI。`inspect` MUST只查询Development current row与读取terminal facts所需的Task/Finish current rows。

#### Scenario: 查看 current Development
- **WHEN** 保存的Development applicability status为`planning`、`developing`、`candidate-current`或`handoff-current`
- **THEN** 页面 MUST用中文分别显示“规划中”“研发中”“候选已就绪”或“研发交接已就绪”
- **AND** MUST将planning、Task context、Content Target、policy、Candidate与handoff的保存时current/stale/missing/disposition作为独立事实展示，不得在GET中改写Task Record或重新计算

#### Scenario: Development 尚未形成
- **WHEN** Application `inspect`返回`status: missing`且没有Development Receipt
- **THEN** 页面 MUST显示“尚未形成研发回执”的空状态
- **AND** 概览、证据和环境视图 MUST继续正常工作，不得创建空Receipt或提供浏览器写操作

#### Scenario: 只有planning facts
- **WHEN** Receipt已经记录proposal、design、review disposition或其他planning nodes，但Content Target仍为null
- **THEN** 页面 MUST展示节点authority、reference、disposition与适用的waiver来源，并显示“规划中”
- **AND** MUST NOT把尚未形成的Content Target、policy或Candidate显示为stale或failed

#### Scenario: 当前环境不可观察但历史交接存在
- **WHEN** Receipt存在但迁移后没有保存applicability，或observedAt早于已知外部变化
- **THEN** 页面 MUST保留展示planning、候选、决定和最近一次研发交接摘要，并明确显示“状态来自最近一次正式研发动作”或unknown
- **AND** 页面 MUST NOT在读取时重新观察Environment、Git、Content Target或declaration

#### Scenario: 安全读取 Development
- **WHEN** 客户端对已登记Workspace和真实Task发起`GET /api/v1/workspaces/:workspaceId/tasks/:taskId/development`
- **THEN** API MUST返回Task Development Application operation read model并使用no-store语义
- **AND** query参数、未知Task、POST、PUT、PATCH与DELETE MUST fail closed，且Task及全部专业current bytes MUST保持不变

#### Scenario: 展示最小研发信息
- **WHEN** Development Receipt包含长identity、多个planning nodes/handoff或专业Result reference
- **THEN** 页面 MUST默认只展示完整但次级排版的当前identity、节点disposition、候选代次、三个gate摘要、决定、风险数量和最近一次handoff
- **AND** MUST NOT展示开发日志、source diff、完整命令输出、隐藏推理、专业artifact/Result body或全部历史handoff列表
