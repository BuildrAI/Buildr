# task-retrospectives Specification

## Purpose

定义终态Task按需生成本机复盘文档、Task Record两态摘要、用户决定和普通后续Task边界。

## Requirements

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
