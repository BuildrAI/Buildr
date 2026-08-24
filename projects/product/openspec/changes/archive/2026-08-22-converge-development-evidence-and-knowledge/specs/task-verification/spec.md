## MODIFIED Requirements

### Requirement: Task Verification 必须维护一个 Task-scoped current Result
Buildr MUST为每个正式Task在Workspace SQLite中提供至多一份current Result。current writer MUST只写`buildr.task-verification-result/v2`，并绑定Task Candidate、stable Content Target、Project declaration identities、实际capability facts、可独立读取的evidence authority、coverage gaps、整体结论与完成时间；reader MUST兼容v1但 MUST把缺少Candidate/evidence绑定的v1 Result标记为legacy-unbound且不得用于新Candidate gate。Result MUST保持可移植值语义但不进入Git，且MUST NOT生成或推进Task Candidate。

#### Scenario: 完整验证形成 current Result
- **WHEN** Agent选择了与current Candidate精确匹配且可独立读取的terminal Verification Execution Records，并请求Application reconciliation
- **THEN** Application MUST从authority提炼完整capability facts并原子写入唯一current Result
- **AND** Result MUST绑定Candidate、Content Target、declarations与每项evidence identity，不得包含stdout、stderr、临时目录、本机绝对路径、Environment Receipt或applicability

#### Scenario: 没有测试能力
- **WHEN** Task scope内某个目标没有可用声明或适用能力
- **THEN** Result MUST通过`coverageGaps`如实记录缺口
- **AND** Verification MUST NOT自动创建测试、脚本、capability declaration或伪造evidence authority

#### Scenario: 旧 Verification YAML 存在
- **WHEN** `.buildr/tasks/<task-id>/verification.yml`存在、损坏或与SQLite不同，或者SQLite current slot保存合法v1 Result
- **THEN** Application MUST只读取SQLite current Result，并对v1返回legacy-unbound applicability reason
- **AND** MUST NOT迁移、回填Candidate/evidence、双写、删除或自动覆盖旧Result

### Requirement: Result 必须使用关闭且最小的数据模型
v2 Result MUST绑定非空Candidate `identity`、正整数`generation`和`contentTargetIdentity`，且target identity MUST等于Candidate content target。Project模式declarations MUST非空并绑定Project、相对path与current content identity或`absent`；仅工作区模式 MAY保存空declarations，但 MUST同时保存空capabilities、唯一`scope: workspace` coverage gap与`not-passed`结论。每个实际capability MUST绑定Project、capability identity、`passed|failed` outcome、至少一个portable fact与closed evidence authority identity；结论MUST只使用`passed|not-passed`。

#### Scenario: 调用方提交 lifecycle authority 字段
- **WHEN** reconciliation输入提交capability outcome/fact、declaration identity、evidence digest、verification policy decision、proceed、blocked、Task status、history、execution path或raw output字段
- **THEN** Application MUST拒绝整个值并只允许从matching authority派生这些事实
- **AND** 原current MUST保持不变

#### Scenario: 完整失败结论
- **WHEN** matching terminal authority包含完整失败事实且整体结论已经形成
- **THEN** Application MUST记录`not-passed` current Result
- **AND** Result MUST NOT决定是否带风险继续推进

#### Scenario: 仅工作区缺少验证能力
- **WHEN** current Task有效Project集合为空且没有适用workspace验证能力
- **THEN** Result MUST以Candidate、空declarations、空capabilities、唯一workspace coverage gap与`not-passed`形成完整负向事实
- **AND** MUST不自动生成declaration、capability fact、passed结论或风险处置

## ADDED Requirements

### Requirement: Verification reconciliation 必须只消费可独立核验的 execution authority
Task Verification Application MUST提供`reconcile` action，并只接受当前Workspace中matching Task拥有的terminal `task-verification/verification-execution` record identities。Application MUST独立读取record metadata与受控summary body，核验Task、Candidate、generation、Content Target、Project、declaration、selected capability、target stability、terminal outcome与body integrity，再从checks提炼portable capability facts；任一不匹配或body不可用时 MUST零写入失败。

#### Scenario: matching managed execution
- **WHEN** terminal record精确绑定current Candidate/target/declaration且每个selected capability有完整passed或failed check
- **THEN** reconcile MUST按capability提炼outcome与portable facts并保存record/run/invocation/body identities
- **AND** caller MUST不能覆盖或补充authority中的outcome与facts

#### Scenario: claimed external success
- **WHEN** caller只提交CI URL、Git ref、文件、聊天摘要、自由文本fact或没有受控producer的evidence bundle
- **THEN** reconcile MUST拒绝并保持current Result不变
- **AND** next action MUST要求先由具名producer形成可独立读取的execution authority，而不是把claim包装成Result

#### Scenario: authority target或Candidate不匹配
- **WHEN** record绑定旧Candidate、旧generation、旧Content Target、不同Task或不同declaration
- **THEN** reconcile MUST返回类型化stale/mismatch diagnostic并零写入
- **AND** MUST NOT通过相同Git commit、相同文件存在或Agent声明语义等价来放宽

#### Scenario: authority正文已清理或不完整
- **WHEN** record body不可用、integrity校验失败、execution仍open/cancelled/unknown或target drift
- **THEN** reconcile MUST返回evidence-unavailable或incomplete并保留旧current Result
- **AND** MUST NOT从list摘要、stdout preview或历史Result猜测事实

### Requirement: Formal Verification execution 必须绑定 current Candidate
带正式Task context的`verification run` MUST在任何capability、resource或process副作用前要求Development consumer提供current Candidate lease，并把Candidate identity/generation与请求Content Target加入invocation identity、Execution Record metadata和summary。runner MUST NOT反向依赖或写入Task Development；Task Verification reconciliation与后续Development inspect MUST独立核验Result绑定的Candidate是否仍current。Task外transient execution MUST不接受Candidate lease，且MUST不能被formal reconciliation采用。

#### Scenario: current Candidate执行
- **WHEN** consumer从current Development Receipt取得Candidate identity/generation，且run target identity等于该Candidate content target
- **THEN** runner MUST把Candidate identity/generation写入可独立核验的execution authority并执行selected capabilities
- **AND** Candidate MUST不因execution outcome改变

#### Scenario: Candidate lease缺失或target不匹配
- **WHEN** formal run未提交Candidate identity/generation，或请求target不等于consumer持有的Candidate content target
- **THEN** runner MUST在open Execution Record或启动副作用前返回action-local blocked diagnostic
- **AND** 无关开发、Task外transient checks与只读调查 MUST不受阻止
