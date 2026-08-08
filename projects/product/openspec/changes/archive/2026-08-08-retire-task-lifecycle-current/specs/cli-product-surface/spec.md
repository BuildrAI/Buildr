## MODIFIED Requirements

### Requirement: CLI 必须提供最小 Task Verification Result 管理入口
Buildr CLI MUST只通过`task verification inspect|record`管理一个Task current Result。`inspect` MUST接受Task ID与可选current target identity，只比较保存值并MUST NOT接受filesystem/declaration path；`record` MUST接受完整target、实际capability facts、coverage gaps和`passed|not-passed` conclusion，并MAY接受matching ready Task Environment根作为`--declaration-root`，但MUST通过Task Verification Application完成ownership、领域校验与持久化。

#### Scenario: inspect current Result
- **WHEN** Agent调用`buildr task verification inspect <task-id> [--target-identity <identity>] --json`
- **THEN** stdout MUST返回稳定operation envelope、current Result、digest与保存值applicability
- **AND** 命令 MUST不接受`--declaration-root`、准备Environment、执行capability或改变任何记录

#### Scenario: record观察Task Environment declaration
- **WHEN** Agent为尚未集成的target调用record并追加`--declaration-root <task-environment-root>`
- **THEN** Application MUST证明该root属于当前Task的ready Environment后再观察declaration
- **AND** 任意其他本机目录 MUST被拒绝且原current不变

#### Scenario: inspect Task Environment declaration
- **WHEN** Agent为inspect追加`--declaration-root <task-environment-root>`
- **THEN** CLI MUST在读取任何声明路径前拒绝该参数并指向record action
- **AND** 原current与Task Environment MUST保持不变

#### Scenario: record 完整 Result
- **WHEN** Agent为active Task提供完整合法facts与conclusion
- **THEN** CLI MUST调用Application原子整值替换current
- **AND** 返回effects MUST只披露created/updated的Workspace SQLite logical locator

#### Scenario: record 不完整
- **WHEN** target、capability fact、coverage gap或conclusion不能构成完整closed-schema Result
- **THEN** CLI MUST返回blocked operation result与具体field diagnostic
- **AND** 原current MUST保持不变
