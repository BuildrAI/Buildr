## ADDED Requirements

### Requirement: Agent必须从Project声明选择Task Preparation Plan
Buildr MUST允许Agent提交closed `buildr.task-environment-plan-request/v1`，按active Task完整Project/Service scope选择Project `preparation.yml`中的Recipe，并由Task Environment Application生成`buildr.task-environment-plan/v2`执行快照。Plan MUST保存声明path/identity、Recipe id/identity、scope coverage、selection reason与规范化Step快照；MUST NOT主要依赖Agent重新抄写声明Step。

#### Scenario: Product多Service选择
- **WHEN** Task scope包含`product/buildr`与`product/buildr-web`且Agent分别选择两个Service Recipe
- **THEN** Plan MUST保存两个scope、两个Recipe identity与各自Step
- **AND** Receipt MUST逐Recipe与Step报告readiness

#### Scenario: Project-only选择
- **WHEN** Task只有Project scope且Agent选择Project Recipe
- **THEN** Plan MUST执行Project-relative Steps而不是强制not-applicable
- **AND** Task Environment MUST不要求建立虚假Service

#### Scenario: scope覆盖不完整
- **WHEN** Selection Request遗漏Task Project/Service scope、选择scope外Recipe或重复覆盖scope
- **THEN** Plan mutation MUST零写入blocked并指出selector
- **AND** MUST不扫描仓库或自动补选Recipe

### Requirement: Task-inline Plan必须是显式fallback
声明缺失或Task有一次性准备需求时，Buildr MUST允许Agent提交`task-inline`来源的Plan Request，其中包含完整scope coverage、Recipe与Steps。Receipt MUST明确标记无持久Project declaration来源并提供持久化next action；Buildr MUST不静默创建或更新`preparation.yml`。

#### Scenario: 首次Task使用task-inline
- **WHEN** Project没有Preparation Declaration且Agent已明确判断准备Steps
- **THEN** `prepare --plan` MUST能够形成v2 Task Plan并执行
- **AND** CLI与Local App MUST将来源显示为`task-inline`

### Requirement: Plan替换必须绑定当前声明
Plan record与`prepare --plan` MUST在mutation前从Task Environment拥有的execution root读取当前声明，验证Project ownership、path、Declaration identity与Recipe identity，并原子替换同一SQLite current中的Plan。任何验证失败 MUST保留旧Plan/Receipt；Plan record MUST不执行Step。

#### Scenario: 调用方提交旧声明identity
- **WHEN** Selection Request中的Declaration或Recipe identity与当前worktree不一致
- **THEN** mutation MUST返回stale/blocked和当前identity
- **AND** MUST不保存调用方旧快照或执行旧命令
