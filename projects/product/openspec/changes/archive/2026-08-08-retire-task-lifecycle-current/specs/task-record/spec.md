## ADDED Requirements

### Requirement: Local App Task Overview 必须组合专业 current 摘要且不扩张 Task Record authority
Buildr MUST为单个Task提供独立只读Task Overview Application。它MUST以Task Record为任务身份/顶层状态authority，并通过一个Workspace SQLite联表查询组合Development、Planning/Completion Review、Verification、Environment与Finish的最小current摘要；MUST NOT把专业status/identity/outcome写入`tasks`、Task Record JSON、record digest或Task Record mutation input。

#### Scenario: 打开 Task 概览
- **WHEN** Local App请求真实Task的Overview
- **THEN** Application MUST返回Task Record、直接Parent/Children摘要、各专业row presence/status/target/outcome/updated time与Finish current/terminal摘要
- **AND** MUST不调用Environment probe、Git、Change resolver、专业writer或filesystem reader

#### Scenario: 顶层状态与专业状态不一致
- **WHEN** Task Record status与Environment、Development或Finish保存摘要形成可诊断不一致
- **THEN** Overview MUST以Task Record表达顶层status，并分别展示专业保存事实与一致性diagnostic
- **AND** MUST不选择任一专业状态反写Task Record或自动修复数据库

#### Scenario: Overview mutation请求
- **WHEN** client对Overview resource发送POST、PUT、PATCH或DELETE
- **THEN** HTTP interface MUST拒绝该请求且effects为空
- **AND** Task Record与全部专业current rows MUST保持不变

## MODIFIED Requirements

### Requirement: Local App Task 详情必须使用四个一级信息视图
Buildr Local App MUST 将 Task 详情核心一级导航保持为“概览、研发、证据、环境”，并由Task Retrospective能力独立增加“复盘”Tab。“概览”MUST以Task Record为主体，并通过只读Task Overview Application附加各专业current最小摘要；“研发”MUST只读投影Task Development；“证据”MUST组合Task Review与Task Verification两个独立reader；“环境”MUST继续只读投影Task Environment。页面 MUST NOT为组合展示建立聚合store、第二writer或新的Task lifecycle state。

#### Scenario: 打开 Task 详情
- **WHEN** 用户进入`/workspaces/:workspaceId/tasks/:taskId`
- **THEN** 页面 MUST提供“概览、研发、证据、环境”四个核心页签、继续提供独立“复盘”Tab，并默认打开“概览”
- **AND** MUST NOT同时保留独立一级“审查”或“验证”页签

#### Scenario: 查看概览摘要
- **WHEN** 用户查看“概览”
- **THEN** 页面 MUST显示Task Record顶层事实与Task Overview联表返回的专业presence/status/target/outcome/time摘要
- **AND** MUST明确Task status仍由Task Record拥有，不得把摘要写回Task Record

#### Scenario: 查看研发依据
- **WHEN** 用户从“研发”中的Planning、Verification或Completion gate查找依据
- **THEN** 页面 MUST在“证据”视图展示对应审查结果或验证结果
- **AND** 研发视图 MUST只展示最小gate reference与保存结论，不得复制完整Result

#### Scenario: 证据 reader 部分不可用
- **WHEN** Task Review或Task Verification任一读取失败或缺失
- **THEN** “证据”视图 MUST独立展示对应诊断或空状态，并保留另一reader的有效内容
- **AND** 概览、研发、复盘与环境视图 MUST不受影响
