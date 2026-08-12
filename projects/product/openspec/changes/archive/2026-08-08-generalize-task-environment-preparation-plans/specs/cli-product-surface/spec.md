## REMOVED Requirements

### Requirement: Task Environment 必须提供三个薄公共 CLI action

## ADDED Requirements

### Requirement: Task Environment 必须提供 Plan 与 Environment 薄公共 CLI actions
Buildr CLI MUST公开`task environment plan record|inspect`以及`task environment prepare|inspect|cleanup`。Plan record MUST只接收`--input <json-file>`中的closed Plan；prepare MUST支持可选`--plan <json-file>`并在省略时复用current Plan。所有CLI MUST只负责参数解析、Application调用、JSON/文本输出和退出码；Local App MUST使用saved-current reader。

#### Scenario: 查看 Task Environment 帮助
- **WHEN** 用户运行`buildr help task environment`或action help
- **THEN** 帮助 MUST展示Plan登记/读取以及prepare/inspect/cleanup
- **AND** MUST说明Plan由Agent形成、prepare执行、inspect零写入且Receipt不属于Task Record

#### Scenario: 登记 Plan
- **WHEN** Agent运行`task environment plan record <task-id> --input <file>`
- **THEN** CLI MUST把解析后的Plan交给Application并返回Plan identity/currentness
- **AND** MUST不执行Plan Steps或接受完整Receipt/next state

#### Scenario: 准备或恢复 Environment
- **WHEN** Agent运行prepare并可选传入Plan
- **THEN** CLI MUST返回ready/blocked、execution roots、Plan及逐Service/Step facts和effects
- **AND** MUST不选择技术栈、扫描manifest或直接调用Git provider形成总结果

#### Scenario: 只读检查 Environment
- **WHEN** 调用方运行inspect
- **THEN** CLI MUST只读返回current Plan、executable/input/output observations和Environment read model
- **AND** MUST不执行Step、创建output、创建checkout、启动/停止资源或cleanup

#### Scenario: cleanup 与内部资源边界
- **WHEN** 调用方运行cleanup或检查public registry
- **THEN** cleanup MUST只转交已授权handoff/abandon facts，resource register/release与saved-current read MUST保持内部
- **AND** CLI MUST不接受任意shell、删除路径或caller-authored provider result
