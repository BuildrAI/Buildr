## ADDED Requirements

### Requirement: Verification producer 必须映射为 closed execution record
Registered Verification command runner MUST把一次formal Task invocation映射为一条`task-verification/verification-execution` record：`run_identity` MUST使用执行前生成的run ID，`target_identity` MUST使用请求的stable Content Target identity，`producer` MUST使用稳定registered identity。执行后生成的`executionIdentity`、verification scope、checks与diagnostics MUST进入受控正文而不是新增SQLite列、任意JSON metadata或Consumer/Adoption关系。

#### Scenario: Verification record metadata映射
- **WHEN** formal Task runner已通过调用前校验并生成run ID
- **THEN** producer MUST以`taskId + task-verification + verification-execution + runId`幂等open record并绑定请求target identity
- **AND** retry MUST使用新的run ID，执行后digest MUST NOT替代open时run identity

#### Scenario: Task外runner执行
- **WHEN** command runner没有合法formal Task Environment context
- **THEN** producer MUST NOT打开Task execution record
- **AND**既有transient evidence lifecycle MUST保持唯一runner evidence authority

### Requirement: Verification record正文必须使用closed body dictionary
Verification producer MUST只提交现有closed正文文件名。`summary.json` MUST保存versioned portable run/scope/execution identity、Project/declaration、selected capability/authorization IDs、安全runtime identity、check/timing与execution outcome；`timeline.json` MUST只保存closed execution milestones；`diagnostics.json` MUST只保存失败、resource coordination、interruption与target drift的有界诊断；stdout/stderr MUST按capability边界进入对应text文件。Producer MUST在persistent write前移除transient locator、本机root/executable、resource token、env、stdin与raw敏感argv，并 MUST继续由正文Store执行最终redaction和截断。

#### Scenario: passed execution seal
- **WHEN**全部checks通过、target稳定且runner形成完整正文
- **THEN** producer MUST提交`summary.json`、适用输出与timeline并以`passed` seal
- **AND** SQLite MUST只保存正文locator/digest/size/truncation与既有governance metadata

#### Scenario: failed或drift execution seal
- **WHEN** capability失败、timeout或target drift且已有完整terminal诊断
- **THEN** producer MUST以`failed` seal并提交`diagnostics.json`及已有partial output
- **AND** diagnostics MUST只包含portable code、exit/signal、resource ID/status、fingerprint与相对变化路径

#### Scenario: catchable cancellation
- **WHEN**runner有界处理显式取消或signal
- **THEN** producer MUST以`cancelled` seal并保存已有partial facts
- **AND** failure-class retention与pending resolution MUST由既有execution record Domain建立

### Requirement: Verification transient cleanup 必须晚于record seal
Formal Task runner MUST只在execution record seal已返回retained且正文完整性可确认后，调用existing Verification cleanup删除精确provider-owned transient run。seal、metadata post-read或cleanup失败 MUST返回各自可诊断状态；seal失败 MUST保留transient evidence，cleanup失败 MUST保留已retained record且不得回滚其事实。

#### Scenario: record retained后cleanup成功
- **WHEN** formal execution record已retained且transient summary identity匹配
- **THEN** runner MUST只删除该run目录并报告transient cleanup成功
- **AND** retained正文与metadata MUST保持不变

#### Scenario: seal失败
- **WHEN**body publish或metadata seal无法证明retained
- **THEN**runner MUST保留transient run并把formal execution报告为failed或attention
- **AND** MUST NOT写current Verification Result、删除未知目录或声称execution evidence已安全保留
