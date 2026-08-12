## MODIFIED Requirements

### Requirement: Local App 必须只读投影任务研发 read model
Buildr Local App MUST 为正式 Task 提供只读“研发”视图，并 MUST 通过 Task Development Application `inspect` 展示 Development presence、最近一次正式 Development action 保存的适用性、planning nodes/dispositions、Task context、Content Target、verification policy、Candidate/generation、Planning/Verification/Completion gates、decision、明确风险与最近一次 Development handoff。HTTP 与 Web 层 MUST NOT 直接读取或解析 `development.yml`、重新计算 identity/currentness、复制专业 artifact/Result body、提供 Receipt mutation 或注册公共`buildr task development` CLI。`inspect` MUST 只查询 SQLite current records 与 lifecycle read model。

#### Scenario: 查看 current Development
- **WHEN** Task Development Application返回`planning`、`developing`、`candidate-current`或`handoff-current`
- **THEN** 页面 MUST用中文分别显示“规划中”“研发中”“候选已就绪”或“研发交接已就绪”
- **AND** MUST将planning、Task context、Content Target、policy、Candidate与handoff的保存时current/stale/missing/disposition作为独立事实展示，不得在GET中改写Task Record status或重新计算

#### Scenario: Development 尚未形成
- **WHEN** Application `inspect`返回`status: missing`且没有Development Receipt
- **THEN** 页面 MUST显示“尚未形成研发回执”的空状态
- **AND** 概览、证据和环境视图 MUST继续正常工作，不得创建空Receipt或提供浏览器写操作

#### Scenario: 只有planning facts
- **WHEN** Receipt已经记录proposal、design、review disposition或其他planning nodes，但Content Target仍为null
- **THEN** 页面 MUST展示节点authority、reference、disposition与适用的waiver来源，并显示“规划中”
- **AND** MUST NOT把尚未形成的Content Target、policy或Candidate显示为stale或failed

#### Scenario: 当前环境不可观察但历史交接存在
- **WHEN** Application返回已有Receipt且lifecycle snapshot的`observedAt`早于当前外部变化，或snapshot缺失
- **THEN** 页面 MUST保留展示已保存的planning、候选、决定和最近一次研发交接摘要，并明确显示“状态来自最近一次生命周期确认，尚未重新确认”或unknown
- **AND** 页面 MUST NOT在读取时重新观察Environment、Git、Content Target或declaration

#### Scenario: 安全读取 Development
- **WHEN** 客户端对已登记Workspace和真实Task发起`GET /api/v1/workspaces/:workspaceId/tasks/:taskId/development`
- **THEN** API MUST返回Task Development Application operation read model并使用no-store语义
- **AND** query参数、未知Task、POST、PUT、PATCH与DELETE MUST fail closed，且Task、Receipt、Review、Verification、Environment bytes与lifecycle read model MUST保持不变

#### Scenario: 展示最小研发信息
- **WHEN** Development Receipt包含长identity、多个planning nodes/handoff或专业Result reference
- **THEN** 页面 MUST默认只展示完整但次级排版的当前identity、节点disposition、候选代次、三个gate摘要、决定、风险数量和最近一次handoff
- **AND** MUST NOT展示开发日志、source diff、完整命令输出、隐藏推理、专业artifact/Result body或全部历史handoff列表

### Requirement: terminal Task 必须提供交付时研发快照且不得伪造 live currentness
Task Development 的只读 consumer MUST 能以 Development Receipt 中已冻结的 Task Context、planning、Content Target、verification policy、Candidate/generation 与 immutable handoff 构造 terminal delivery snapshot。该 snapshot MUST 与最近一次生命周期确认的 applicability 分离，MUST NOT 因历史事实已交付而把任一实时轴标记为 current，也 MUST NOT 为读取 terminal Task 恢复或重建 Environment。

#### Scenario: completed Task 的 Environment 已清理
- **WHEN** Task 已 completed、matching Formal Finish Result 已证明交付且 Environment cleanup 已完成
- **THEN** read model MUST 返回交付时研发快照与 delivered 主结论
- **AND** 六个实时 currentness 轴 MUST NOT 被伪装为 current
- **AND** Terminal Delivery inspect MUST 只读取 SQLite 保存的 terminal summary

#### Scenario: active Task 的 Environment 不可用
- **WHEN** active Task 最近一次 lifecycle snapshot 表示 Environment blocked、cleaned 或 unavailable
- **THEN** 原有保存的 lifecycle applicability MUST 继续返回对应状态或 unknown
- **AND** terminal delivery projection MUST NOT 误报 delivered，也不得在读取时重新判断 Environment

#### Scenario: abandoned Task
- **WHEN** Task status 为 abandoned 且存在历史 Development Receipt
- **THEN** read model MUST 只返回历史快照与 abandoned 结论
- **AND** MUST NOT 重新判断、恢复或生成 Candidate
