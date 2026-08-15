## MODIFIED Requirements

### Requirement: OpenSpec CLI help 不得恢复 Task Finish 的旧 Change authority
Buildr CLI MUST 把 `openspec convergence preflight`、`openspec converge` 与 `openspec convergence inspect`描述为当前OpenSpec maintenance入口：preflight只检查尚未开始的收敛语义就绪性，converge是唯一canonical writer，inspect只读取当前事务恢复现场。CLI MUST NOT注册或帮助展示`openspec audit`、`openspec baseline create`或`openspec check`。Task Finish current help MUST明确Change convergence、sync与archive在Development stable Content Target之前完成，且正常Converge成功后不再要求Inspect。

#### Scenario: 查询当前 OpenSpec 帮助
- **WHEN** 用户查询root或OpenSpec maintenance帮助
- **THEN** CLI MUST展示`buildr openspec convergence preflight`、`buildr openspec converge`与`buildr openspec convergence inspect`
- **AND** preflight help MUST明确它不写canonical/Receipt/archive且ready会随输入变化失效；Inspect help MUST明确它只读取当前事务Receipt且不用于归档后长期审计

#### Scenario: 查询 OpenSpec 兼容入口帮助
- **WHEN** 用户查询或调用`buildr openspec audit`、`buildr help openspec baseline create`或`buildr help openspec check`
- **THEN** CLI MUST返回标准unknown-command诊断，并在适用时建议`openspec convergence preflight`、`openspec convergence inspect`或`openspec converge`
- **AND** MUST NOT读取或写入旧baseline、Receipt、canonical spec或archive状态

#### Scenario: 查询 Task Finish 帮助
- **WHEN** 用户查询canonical Task Finish help
- **THEN** help MUST说明Finish只消费current Development Handoff并执行carrier/delivery/cleanup
- **AND** MUST NOT列出OpenSpec command、Change preflight、convergence、Inspect、sync或archive为Finish operation

## ADDED Requirements

### Requirement: OpenSpec Semantic Readiness Preflight必须提供公共CLI与JSON契约
Buildr CLI MUST让`buildr openspec convergence preflight <change> --project <project> --target <task-execution-root> --json`返回`buildr.openspec-convergence-preflight/v1`，并以`ready|blocked`表达当前语义就绪结果。Command catalog、topic help、dispatch、unknown-command candidates、JSON registry与验证 MUST从同一command descriptor发现该入口。

#### Scenario: Preflight ready
- **WHEN** 当前delta、canonical、active Changes和executable可形成唯一且strict有效的expected Project
- **THEN** JSON MUST包含change、project、status、readinessIdentity、convergence/plan identity、delta/executable/algorithm identity、activeChange observations、operations、validation、duration、commandCount、`effects: []`和nextActions
- **AND**命令 MUST以成功状态退出

#### Scenario: Preflight blocked
- **WHEN** planner、active conflict scan或projected strict validation返回blocker
- **THEN** JSON MUST返回`blocked`、稳定category、底层code、最小identity引用和`effects: []`
- **AND**命令 MUST以非零状态退出且不得创建Receipt、修改canonical或archive Change

#### Scenario: Planning root或Change无效
- **WHEN** Project、Task execution root、OpenSpec executable或active Change不能安全解析
- **THEN** CLI MUST在任何持久写入前返回具体diagnostic和matching Environment execution root提示
- **AND** MUST不扫描或猜测其他worktree
