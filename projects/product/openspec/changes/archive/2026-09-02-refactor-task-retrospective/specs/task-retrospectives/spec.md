## ADDED Requirements

### Requirement: Agent按需生成本机任务复盘文档
用户明确要求复盘已完成或已放弃Task时，`task-retrospective` Skill MUST指导Agent只根据当前可见的Task、Git、代码、测试、专业结果、工具输出和用户事实生成自由Markdown，并写入`.buildr/local/task-retrospectives/<task-id>.md`。正文 MUST NOT进入SQLite、Git、发布物、Current Knowledge或其他专业Result。

#### Scenario: 用户要求复盘终态Task
- **WHEN** 用户明确要求复盘一个`completed`或`abandoned` Task
- **THEN** Agent MUST区分已观察事实、推断和缺失数据并生成本机Markdown
- **AND** 精确耗时或Token不可得时 MUST明确缺失且不得估算、回放隐藏上下文或新增采集

#### Scenario: 用户没有要求复盘
- **WHEN** Task完成或放弃但用户没有要求复盘
- **THEN** Agent与Buildr MUST不生成文档、不写复盘状态且不自动提示
- **AND** 其他Task、Review、Verification、Git、交付和清理行为 MUST正常工作

### Requirement: 复盘文档必须使用固定本机路径
每个Task的复盘正文 MUST只使用由canonical Workspace与Task ID派生的`.buildr/local/task-retrospectives/<task-id>.md`。写入和读取 MUST拒绝路径参数、路径逃逸、符号链接、非普通文件、空正文和超过固定安全上限的内容。

#### Scenario: Agent生成复盘文件
- **WHEN** Agent已获用户授权并为合法终态Task生成复盘
- **THEN** Agent MUST先安全写入固定文件，再通过Task Record登记当前内容摘要
- **AND** 文件写入成功但登记失败时 MUST保留文件并只恢复登记动作

#### Scenario: 文档路径或文件类型非法
- **WHEN** 调用方尝试指定其他路径，或固定位置是符号链接、目录或非法文件
- **THEN** Buildr MUST拒绝读取或登记且保持Task Record不变

### Requirement: Task Record维护最小复盘决策事实
Task Record MUST为终态Task维护可空的复盘文档事实，只保存`documentDigest`与`pending-decision | decided`。`null` MUST只表示没有登记文档；`pending-decision` MUST表示文档等待人的明确决定；`decided` MUST只表示人已经决定是否继续行动，不得表示改进已实施或形成任何工作许可。

#### Scenario: 登记新文档版本
- **WHEN** Agent以当前Task版本登记固定路径的实际Markdown摘要
- **THEN** Task Record MUST保存该摘要并设为`pending-decision`
- **AND** MUST不复制正文、创建后续Task或修改其他专业结果

#### Scenario: 用户明确完成决定
- **WHEN** 用户已查看当前文档版本并明确决定继续行动或不行动
- **THEN** Task Record MAY把匹配文档版本设为`decided`
- **AND** 查看文档、Agent建议或文件存在本身 MUST NOT自动产生该写入

#### Scenario: 文档内容变化
- **WHEN** 固定文件的实际摘要与Task Record登记摘要不同
- **THEN** 详情读取 MUST显示内容已变化并将有效解释保持为等待重新决定
- **AND** MUST不自动写SQLite、覆盖文档或改变Task顶层状态

### Requirement: 后续行动必须使用普通Task
复盘中的建议 MUST只作为文档内容和用户讨论。用户明确决定继续行动后，Agent MUST复用或创建普通Task，并 MAY在普通目标中引用来源Task或本机复盘路径；Buildr MUST不保存专用来源关系、行动项或复盘处置说明。

#### Scenario: 已有普通Task覆盖建议
- **WHEN** 当前todo或active Task已经覆盖用户接受的改进目标
- **THEN** Agent MUST复用该Task且不得创建重复Task
- **AND** Task Record MUST不增加专用Retrospective relation

#### Scenario: 用户决定不行动
- **WHEN** 用户明确决定当前复盘无需继续行动
- **THEN** Agent MAY把当前文档标记为`decided`
- **AND** MUST不保存`no-action`、处置说明或自动修改Rule、Skill、Application、测试或工作流

### Requirement: 任务复盘不得成为任何门禁
复盘文档缺失、不可读、摘要变化、`pending-decision`或Skill不可用 MUST NOT阻止Task、Parent、Review、Verification、OpenSpec、Git、交付、发布或清理。

#### Scenario: 本机复盘不可用
- **WHEN** Task没有复盘、文件被移除或本机副本不可访问
- **THEN** Buildr MUST返回局部复盘提示并保留其他事实与动作
- **AND** MUST不把Task降级为未完成、blocked或未交付

## REMOVED Requirements

### Requirement: Task Retrospective 保存单一当前执行效率复盘
**Reason**: 正文改为固定本机Markdown，不再是SQLite专业Result。
**Migration**: 旧current正文直接删除；新文档只在用户明确要求后生成。

### Requirement: Task Retrospective 只基于当前可见证据
**Reason**: 该方法已并入新的按需本机文档Requirement。
**Migration**: 使用精简`task-retrospective` Skill。

### Requirement: 旧 observation 保持不可见且不迁移
**Reason**: 独立Retrospective implementation退役，不再拥有旧observation边界。
**Migration**: 不从`.buildr/asset-review/`读取或迁移内容；随合法本机数据升级直接删除该旧目录。

### Requirement: Task Retrospective 必须维护复盘处置 current metadata
**Reason**: 三态处置和专用current row删除。
**Migration**: Task Record只保留`pending-decision|decided`文档决策事实。

### Requirement: 复盘处置 mutation 必须防止陈旧覆盖
**Reason**: 专用handle和currentDigest删除。
**Migration**: 使用Task Record `recordDigest`和文档摘要保护当前版本。

### Requirement: 重做复盘必须重置处置状态
**Reason**: SQLite正文和处置状态删除。
**Migration**: 登记新文件摘要时进入`pending-decision`。

### Requirement: 处理复盘必须形成基于当前事实的完整意见
**Reason**: 不再存在专用处理流程。
**Migration**: Agent直接重读当前事实和本机文档，与用户讨论后决定。

### Requirement: 有效复盘事项必须由 Task Record 承接
**Reason**: 专用来源关系不属于Task最小事实。
**Migration**: 使用普通Task目标表达来源和行动。

### Requirement: 复盘 inspect 必须展示当前承接 Task
**Reason**: 专用inspect和承接关系删除。
**Migration**: 查看普通Task及其目标。

### Requirement: Agent 处置复盘必须取得针对具体写入的明确授权
**Reason**: 处置Application删除，授权边界已收敛到Task Record状态和普通Task写入。
**Migration**: 用户查看零写入；决定状态和普通Task effects分别取得明确授权。

### Requirement: Task Retrospective Application 必须是 Buildr Web 与 CLI 的唯一读写 authority
**Reason**: 独立Application整体退役。
**Migration**: Agent写本机文档，Task Record维护摘要和决定状态。

### Requirement: Buildr Web 展示只读复盘 Tab
**Reason**: 独立复盘Tab删除。
**Migration**: Task概览显示本机复盘卡片。

### Requirement: Task Retrospective 必须提供有界批量只读检查
**Reason**: 不再维护复盘报告队列或批量正文传输。
**Migration**: 使用普通Task查询按Task-owned决策状态筛选。

### Requirement: 内部 Task Retrospective driver 必须开放批量 list action
**Reason**: 内部Driver整体删除。
**Migration**: 无替代内部入口。

### Requirement: Task Retrospective 必须探索并共同确认确定性流程候选
**Reason**: 每份复盘强制候选分析会继续制造结构化管理需求。
**Migration**: 证据充分时Agent可在自由Markdown中提出建议，用户另行决定。

### Requirement: Task Retrospective 不成为任何任务动作门禁
**Reason**: 由新的本机文档非门禁Requirement替代。
**Migration**: 复盘文档与决定状态保持局部、可选和非门禁。
