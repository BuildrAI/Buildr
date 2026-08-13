## ADDED Requirements

### Requirement: Agent CLI 必须开放 Task execution record list 与 inspect
Buildr CLI MUST登记`buildr task execution-record list --task <task-id> [--view all|verification|finish] [--target <canonical-workspace>] [--json]`与`buildr task execution-record inspect --task <task-id> --record <record-id> [--target <canonical-workspace>] [--json]`。两项命令MUST只调用Task Execution Record Application的portable read model，MUST不接受locator、path、owner mutation、resolution、cleanup、retry或任意SQL输入。根帮助和专题帮助MUST说明它们用于在原终端不可用后恢复同一execution事实，且不写Verification Result或Finish current。

#### Scenario: Agent列出Verification records
- **WHEN** Agent使用Task ID与`--view verification`调用list
- **THEN** CLI MUST返回该Task的portable Verification records与稳定identity
- **AND** MUST不列出其他Task记录、读取正文或启动verification

#### Scenario: Agent检查单条record
- **WHEN** Agent提供matching Task ID与record ID调用inspect
- **THEN** CLI MUST返回current lifecycle或terminal compact摘要和正文文件入口
- **AND** record不属于Task时 MUST fail closed且不泄漏实际owner Task

#### Scenario: verification run 显式retry
- **WHEN** Agent查看`buildr help verification run`
- **THEN** help MUST说明默认阻止相同active invocation重复执行，`--retry`会创建独立run/record
- **AND** MUST不把retry描述为恢复、覆盖或采用既有execution
