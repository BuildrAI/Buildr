## ADDED Requirements

### Requirement: 任务复盘必须由Agent按用户意图直接完成
用户明确要求复盘终态Task时，Agent MUST使用`task-retrospective` Skill读取当前事实、生成固定本机Markdown并通过Task Record登记。Task完成本身 MUST不自动提示、生成、登记或要求复盘。

#### Scenario: 用户在任务完成后要求复盘
- **WHEN** 用户明确要求复盘指定终态Task
- **THEN** Agent MUST直接组合Task、Git、代码、测试和适用专业结果形成文档
- **AND** MUST不调用独立Retrospective Application、内部Driver或统一流程门禁

### Requirement: Task Review与任务复盘必须保持职责独立
Task Review MUST继续审查方案或完成结果；任务复盘Skill MUST只分析实际执行过程与改进。两者 MUST不合并为通用审查平台，也不得互相成为门禁。

#### Scenario: Task没有复盘
- **WHEN** Agent记录或读取Task Review、执行Verification或完成Task
- **THEN** 动作 MUST不要求复盘文档或决定状态

## REMOVED Requirements

### Requirement: Task Review 与 Task Retrospective 必须保持独立 authority
**Reason**: Retrospective不再是独立Application authority。
**Migration**: 保留两个Skill的语义职责分离。

### Requirement: 终态 Task 提供非阻塞任务复盘提示
**Reason**: 用户没有要求时不应产生形式化复盘工作。
**Migration**: 只在用户明确请求时使用Skill。

### Requirement: 受管内部入口必须只覆盖仍存在的专业能力
**Reason**: 当前受管Task内部route只服务Retrospective Driver，现整体退役。
**Migration**: 删除route inventory、driver和对应Doctor检查；保留其他产品内部动作原有边界。
