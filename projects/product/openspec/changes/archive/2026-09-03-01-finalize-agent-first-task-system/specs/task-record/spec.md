## MODIFIED Requirements

### Requirement: Task Record mutation 必须由产品动作完成
Buildr MUST通过`create`、`inspect`、`update`、`activate`、`complete`和`abandon`六个明确Task Record Application action管理Task Record。CLI、Buildr Web和上层Skill MUST只作为Application客户端；除create外的全部mutation MUST提交已观察`recordDigest`，并在同一write transaction内比较当前值。调用方MUST不直接编辑SQLite、提交完整next-state document或生成系统字段。

#### Scenario: 创建 Task
- **WHEN** create收到合法且尚不存在的Task ID、title、intent、可选`todo|active` status与scope/reference
- **THEN** Application MUST生成Task Record与系统时间并在一个transaction写入
- **AND** MUST不创建Change、Review、Verification、Worktree或其他专业事实

#### Scenario: 更新 Task
- **WHEN** update收到当前`recordDigest`和至少一个明确字段或关系mutation
- **THEN** Application MUST在transaction内重读、比较、应用并验证完整记录
- **AND** omitted字段 MUST保持不变

#### Scenario: 激活、完成或放弃 Task
- **WHEN** activate、complete或abandon收到当前`recordDigest`
- **THEN** Application MUST只执行对应Task Record mutation
- **AND** MUST不执行Git、验证、交付、环境或清理动作

#### Scenario: 并发修改
- **WHEN** 任一非create mutation提交的`recordDigest`不再匹配
- **THEN** Application MUST拒绝写入并返回当前digest
- **AND** caller MUST重新读取和判断，不得自动重放

#### Scenario: 更正已有终态业务事实
- **WHEN** update收到当前digest、明确原因及终态Task的合法业务事实修订
- **THEN** Application MUST保存旧status、title、intent、scope、Change、parent、isParent、result和时间
- **AND** 既有历史缺失字段 MUST原样保留，不得补造

#### Scenario: 更新 active Task
- **WHEN** update收到active Task当前digest与明确mutation
- **THEN** Application MUST原子更新并重算digest

#### Scenario: 更新 todo Task
- **WHEN** update收到todo Task当前digest与明确mutation
- **THEN** MUST使用相同CAS规则且继续拒绝Change引用

#### Scenario: 激活 todo Task
- **WHEN** activate收到todo Task当前digest
- **THEN** MUST只执行todo-to-active transition

#### Scenario: inspect Task
- **WHEN** inspect读取有效Task ID
- **THEN** MUST零写入返回当前Record、relations与digest

#### Scenario: mutation 输入不明确
- **WHEN** update没有mutation、字段冲突或缺少digest
- **THEN** MUST拒绝并保持记录不变

#### Scenario: 两个客户端执行同一动作
- **WHEN** CLI或Buildr Web修改同一Task
- **THEN** MUST调用相同Application、validator与repository
- **AND** 任一客户端 MUST不维护第二状态机

### Requirement: Task Record 必须支持最小 Parent Task 层级
Buildr MUST允许Task保存至多一个canonical Workspace内的直接`parentTaskId`，并 MUST从同一Task authority动态投影排序后的直接Child摘要。反向`childTaskIds`与Child数量 MUST不进入Task Record schema、SQLite column、record digest或mutation input。

#### Scenario: 创建或修改 Parent 关系
- **WHEN** caller创建Child或把Task关联到一个合法active Parent
- **THEN** Application MUST只在Child row保存`parentTaskId`
- **AND** Parent relation projection MUST从反向查询返回该Child

#### Scenario: 读取没有 Child 的 Task
- **WHEN** Task没有直接Child
- **THEN** relation projection MUST返回空children
- **AND** Task Record MUST不返回`childTaskIds`

#### Scenario: 创建带 Parent 的 Task
- **WHEN** caller创建Task并提供合法active Parent
- **THEN** MUST原子创建Task与正向Parent关系

#### Scenario: 创建没有 Parent 的 Task
- **WHEN** caller创建独立Task
- **THEN** MUST保存`parentTaskId: null`

#### Scenario: 修改或清除 Parent
- **WHEN** caller以当前digest设置或清除Parent
- **THEN** MUST原子更新关系且不修改其他Task事实

### Requirement: Task 顶层状态与结果必须保持一致并允许显式更正
Task Record status MUST只有`todo`、`active`、`completed`和`abandoned`。`result`在todo或active时 MUST为`null`，在终态时 MUST只保存非空`summary`及适用的`parentCompletion`；MUST不保存`noChange`、交付、Git、验证、环境、发布或执行事实。状态变化和终态更正 MUST绑定当前digest；终态更正 MUST提供原因并保存历史。

#### Scenario: 完成 Task
- **WHEN** caller以当前digest和真实摘要完成todo或active Task
- **THEN** Buildr MUST写入`completed`和summary
- **AND** MUST不要求或保存`noChange`

#### Scenario: 放弃 Task
- **WHEN** caller以当前digest和原因放弃todo或active Task
- **THEN** Buildr MUST写入`abandoned`和summary
- **AND** MUST不伪造完成或交付事实

#### Scenario: 父任务完成
- **WHEN** parent completion包含当前父子snapshot、总体验收、逐Child处置和明确授权
- **THEN** Application MUST重验当前完成相关事实后保存依据
- **AND** snapshot MUST不包含旧Parent Plan、复盘、专业可选结果或更正历史

#### Scenario: 激活待办 Task
- **WHEN** Agent以当前digest激活todo Task
- **THEN** MUST只写`active`且不创建其他专业事实

#### Scenario: 正常完成
- **WHEN** caller以当前digest和摘要完成active Task
- **THEN** MUST保存completed与summary且不保存结果分类

#### Scenario: 无变更完成
- **WHEN** todo或active Task确认目标无需产生修改
- **THEN** caller MUST在summary中表达该结果并正常完成
- **AND** MUST不保存`noChange`

#### Scenario: todo 尝试声明有变更完成
- **WHEN** caller完成todo Task
- **THEN** Application MUST只判断目标结果、摘要和父任务授权
- **AND** MUST不从旧`noChange`推导是否允许

#### Scenario: 终态再次 mutation
- **WHEN** caller以当前digest和原因更正终态Task
- **THEN** MUST保存历史并更新当前事实

#### Scenario: 更新不能绕过完成授权
- **WHEN** update把父任务设为completed但缺少当前授权或snapshot
- **THEN** MUST拒绝写入

#### Scenario: 陈旧或伪造更正
- **WHEN** digest陈旧、缺少原因或试图写系统/专业事实
- **THEN** MUST拒绝并保留当前记录与历史

## REMOVED Requirements

### Requirement: Formal Finish 正常完成必须复用 Task Record Application
**Reason**: 旧Formal Finish和delivery reconciler已删除；Task Record不得提供“经过验证交付”的内部setter。
**Migration**: Agent在真实交付后调用普通`task complete`；交付由Git、文件或外部系统证明。

### Requirement: 直接 Child 数量必须是非持久化查询派生事实
**Reason**: 当前Buildr Web不消费`childTaskCount`，`hasChildren`可直接通过关系过滤。
**Migration**: 删除响应字段和专属计数；Parent详情继续返回直接children。

### Requirement: Buildr Web Task Overview 必须组合专业 current 摘要且不扩张 Task Record authority
**Reason**: 独立Task Overview整体退役。
**Migration**: Task detail展示Task Record；专业结果只由各自inspect展示。
