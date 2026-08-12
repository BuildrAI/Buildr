## ADDED Requirements

### Requirement: Development applicability 必须由正式 action 原子保存
Task Development Application MUST 在每个成功的begin、planning、observe、policy、gate、freeze、decide与handoff action中，基于该action已取得的Task、Environment、Content Target、declaration与专业Result facts形成一次完整applicability observation，并与新的Development Receipt在同一repository transaction中保存。`inspect` MUST只返回保存的Receipt、applicability与observed time，MUST NOT重新执行这些observations。

#### Scenario: Development action 成功
- **WHEN** Application完成专业观察并形成合法Receipt与applicability
- **THEN** repository MUST原子保存两者并在commit前写后验证
- **AND** operation result MUST返回与数据库同一份保存applicability

#### Scenario: applicability 保存失败
- **WHEN** Receipt或applicability任一serialization、constraint、busy或post-read阶段失败
- **THEN** transaction MUST完整rollback并保留上一份Receipt与applicability
- **AND** MUST NOT留下新Receipt配旧applicability或反向组合

#### Scenario: 旧row没有可迁移observation
- **WHEN** 升级后的Development row有合法Receipt但applicability fields为空
- **THEN** inspect MUST返回保存Receipt与稳定unknown/migration diagnostic
- **AND** MUST NOT在GET中观察Environment、Git、Content Target或declaration补算

## MODIFIED Requirements

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

### Requirement: terminal Task 必须提供交付时研发快照且不得伪造 live currentness
Task Development 的只读 consumer MUST 能以 Development Receipt 中已冻结的 Task Context、planning、Content Target、verification policy、Candidate/generation 与 immutable handoff，以及matching Finish completion association构造terminal delivery snapshot。该snapshot MUST与Development row最近一次正式action保存的applicability分离，MUST NOT因历史事实已交付而把任一实时轴标记为current，也MUST NOT为读取terminal Task恢复或重建Environment。

#### Scenario: completed Task 的 Environment 已清理
- **WHEN** Task已completed、matching Finish completion已证明交付且Environment cleanup已完成
- **THEN** read model MUST返回交付时研发快照与delivered主结论
- **AND** 六个实时currentness轴 MUST NOT被伪装为current
- **AND** Terminal Delivery inspect MUST只读取SQLite保存的Development与Finish facts

#### Scenario: active Task 的 Environment 不可用
- **WHEN** active Task最近一次Development action保存的applicability表示Environment相关axis blocked、cleaned、unavailable或unknown
- **THEN** 原有保存applicability MUST继续返回对应状态或unknown
- **AND** terminal delivery projection MUST NOT误报delivered，也不得在读取时重新判断Environment

#### Scenario: abandoned Task
- **WHEN** Task status为abandoned且存在历史Development Receipt
- **THEN** read model MUST只返回历史快照、保存applicability与abandoned结论
- **AND** MUST NOT重新判断、恢复或生成Candidate
