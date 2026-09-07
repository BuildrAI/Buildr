## ADDED Requirements

### Requirement: Parent Coordination CLI必须只提供v4只读结果
`task parent inspect --json` MUST输出Parent Coordination v4 closed对象。旧`record|refresh-planning|bind-child|reconcile|accept`命令 MUST不存在且不提供兼容转发。

#### Scenario: inspect成功
- **WHEN** Agent运行`task parent inspect <task-id> --json`
- **THEN** stdout MUST是单一v4对象且stderr为空
- **AND** MUST不包含v3 Contribution或Handoff字段

#### Scenario: mutation被拒绝
- **WHEN** 调用方运行任一旧Parent mutation
- **THEN** CLI MUST返回标准unknown-command错误与非零退出
- **AND** MUST保持Task与专业事实零写入

## MODIFIED Requirements

### Requirement: OpenSpec Semantic Readiness Preflight必须提供公共CLI与JSON契约
Buildr CLI MUST让`buildr openspec convergence preflight <change> --project <project> --target <actual-work-root> --json`返回`buildr.openspec-convergence-preflight/v1`，并以`ready|blocked`表达当前语义就绪结果。Command catalog、topic help、dispatch、JSON registry与验证 MUST从同一command descriptor发现该入口。

#### Scenario: Preflight ready
- **WHEN** 当前delta、canonical、active Changes和executable可形成唯一且strict有效的expected Project
- **THEN** JSON MUST包含change、project、status、identity、operations、validation、duration、effects与nextActions
- **AND** 命令 MUST以成功状态退出

#### Scenario: Preflight blocked
- **WHEN** planner、active conflict scan或projected strict validation返回blocker
- **THEN** JSON MUST返回blocked、稳定category、底层code、最小identity引用与零effects
- **AND** 命令 MUST以非零状态退出且不创建Receipt、修改canonical或archive Change

#### Scenario: Planning root或Change无效
- **WHEN** Project、实际工作根、OpenSpec executable或active Change不能安全解析
- **THEN** CLI MUST在任何持久写入前返回具体diagnostic和实际工作根修复提示
- **AND** MUST不扫描或猜测其他worktree

## REMOVED Requirements

### Requirement: Parent coordination CLI 必须只输出v3 canonical字段
**Reason**: v3及其写命令已经退役。
**Migration**: 使用`task parent inspect`的v4只读结果。
