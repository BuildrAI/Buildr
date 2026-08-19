## MODIFIED Requirements

### Requirement: Task Finish CLI detail 投影必须与执行 authority 分离
Task Finish Application MUST从同一个canonical `buildr.task-finish-result/v3`确定性生成CLI detail投影。`full` MUST原样保留repository-set Result；`compact` MUST通过closed字段白名单生成`buildr.task-finish-compact-result/v1`，且 MUST不写SQLite、不改变run/result、不查询第二authority、不创建新的恢复或diagnostics store。`self-bootstrap` MUST通过稳定投影保留唯一Workspace repository的冻结`leaseTargetIdentity`，不得从`remote + targetBranch`或本机路径重新计算repository identity。detail选择 MUST只影响CLI JSON序列化，不得改变五阶段执行、逐repository resume、Delivery Carrier、Execution Record、Task terminal或Environment cleanup。旧v2 Result只允许有界读取与兼容compact/self-bootstrap投影，新写入 MUST使用v3。

#### Scenario: complete Result 的两种投影
- **WHEN** 同一complete v3 Result分别以compact与full读取
- **THEN** 两者 MUST表达相同run、Task、handoff、Candidate、Content Target、status与completion结论
- **AND** full MUST保留repository-scoped delivery authority，compact MUST保持既有closed字段并省略repository数组和full diagnostics

#### Scenario: Self-bootstrap 投影保留 Workspace lease identity
- **WHEN** v3 Result的唯一Workspace repository适用且冻结了repository-scoped `leaseTargetIdentity`
- **THEN** self-bootstrap detail MUST在该Workspace repository上原样投影同一identity
- **AND** MUST不以同名branch、remote或其他repository的lease identity替代

#### Scenario: blocked Result 可恢复
- **WHEN** current run因某个repository的Delivery Adaptation、target race、containment或cleanup暂态条件blocked
- **THEN** full MUST标识该repository的真实状态，compact MUST保留primary failure、唯一next action与matching resume
- **AND** detail投影 MUST不重复交付已完成repository或改写repository checkpoints

#### Scenario: compact 投影失败
- **WHEN** canonical Result缺少compact契约要求的run、identity、status或恢复事实
- **THEN** Application MUST fail closed并返回受控CLI错误
- **AND** MUST不补造identity、修改canonical Result或降级为对象展开

## ADDED Requirements

### Requirement: 历史逻辑 target lease identity 必须唯一解析到冻结 repository
Retained Task Finish target lease authority MUST以matching canonical Workspace、Task、run与current或terminal complete row作为owner边界。repository-set run请求精确冻结`leaseTargetIdentity`时 MUST原样使用；旧consumer请求`remote:targetBranch`逻辑identity时，只有冻结repository set中恰有一个applicable repository同时匹配remote与target branch，authority才 MUST把它解析为该repository的精确identity。该兼容 MUST不把逻辑identity重新作为canonical lease key。

#### Scenario: 旧 runner 唯一命中 Workspace repository
- **WHEN** matching terminal complete run中只有一个applicable repository命中旧runner请求的`origin:dev`
- **THEN** authority MUST以该repository冻结的`leaseTargetIdentity`取得、刷新和释放lease
- **AND** driver Result MUST同时报告requested logical identity与resolved exact identity，使旧consumer可迁移而新consumer可校验

#### Scenario: 两个 repository 共享同一 logical target
- **WHEN** matching run中两个或以上applicable repository都使用相同remote与target branch
- **THEN** 旧logical identity请求 MUST以ambiguous diagnostic fail closed
- **AND** MUST不按selector、数组顺序、Workspace优先级或retained路径猜测repository

#### Scenario: logical target 没有匹配 repository
- **WHEN** requested remote或target branch不匹配matching run中的任何applicable repository
- **THEN** authority MUST返回target identity mismatch且lease effects为空
- **AND** MUST不回退到Task顶层remote/branch或其他run的repository facts

#### Scenario: Workspace、Task或 run 不匹配
- **WHEN** 请求指向另一个canonical Workspace、另一个Task、另一个run或不合格current/terminal row
- **THEN** authority MUST在lease acquisition、refresh与release前fail closed
- **AND** MUST不跨Workspace扫描或借用其他owner的repository identity

#### Scenario: release 保持 owner 与 token fencing
- **WHEN** 旧consumer以logical identity释放已解析为exact identity的activation lease
- **THEN** authority MUST重新验证matching Task/run、唯一解析结果、实际lease identity与token后才释放
- **AND** 错误run、错误repository identity或错误token MUST不释放当前owner
