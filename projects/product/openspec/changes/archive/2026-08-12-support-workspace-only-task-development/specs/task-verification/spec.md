## MODIFIED Requirements

### Requirement: Result 必须使用关闭且最小的数据模型
Result MUST绑定非空Content Target `target.identity`和可移植`target.summary`；Project模式的declarations MUST非空且每个declaration MUST绑定Project、相对path与当前content identity或`absent`；仅工作区模式 MAY保存空declarations，但 MUST同时保存空capabilities、唯一`scope: workspace` coverage gap与`not-passed`结论。每个实际capability MUST绑定Project、capability identity、`passed|failed` outcome与至少一个portable fact；结论MUST只使用`passed|not-passed`。

#### Scenario: 调用方提交 lifecycle authority 字段
- **WHEN** record输入或持久Result包含Candidate identity/generation、verification policy decision、assurance level、proceed、blocked decision、Task status、revision、history、CAS、execution path或raw output字段
- **THEN** Application MUST拒绝整个值
- **AND** 原current MUST保持不变

#### Scenario: 完整失败结论
- **WHEN** 已完成的能力执行产生失败事实且整体结论已经形成
- **THEN** Agent MAY记录`not-passed` current Result
- **AND** Result MUST NOT决定是否带风险继续推进

#### Scenario: 仅工作区缺少验证能力
- **WHEN** current Task的有效Project集合为空且没有适用workspace验证能力
- **THEN** Result MUST以空declarations、空capabilities、唯一workspace coverage gap与`not-passed`形成完整负向事实
- **AND** MUST不自动生成declaration、capability fact、passed结论或风险处置

### Requirement: Applicability 必须由 target 与 declaration identities 派生
Task Verification `record` MUST在正式action中观察并保存Content Target与Task有效Project集合内全部Project declaration identities，并返回该action时点的current applicability；仅工作区Task MUST观察并保存空declarations。后续`inspect` MUST只读取保存的Result/查询字段，并只对调用方显式提供的target/declaration identity值做纯值比较；MUST NOT接受路径作为读取时观察authority，不得读取Project registry、`verification.yml`、Git、Content Target或Environment来刷新applicability。未提供某axis的current identity值时，该axis MUST为unknown或明确表达最近一次record action的历史观察，MUST NOT声称live current。

#### Scenario: record 时 target 与 declarations 已确认
- **WHEN** Application在合法record action中观察的target与全部Project declarations被写入同一Result
- **THEN** operation result MUST返回该action observedAt下的current applicability
- **AND** Result与查询字段 MUST在同一transaction中保存

#### Scenario: target 与 declarations 均未变化
- **WHEN** caller提供Content Target与declaration identity值且分别等于Result保存值
- **THEN** inspect MUST通过纯值比较返回对应axis current
- **AND** MUST NOT打开caller path或重新读取declaration bytes

#### Scenario: Local App 没有当前 target identity
- **WHEN** Local App只读inspect但没有提供current target/declaration identity值
- **THEN** Application MUST返回已有Result、record observedAt与unknown/last-observed语义
- **AND** MUST NOT从HEAD、Candidate、dirty tree、Environment、Project文件或时间伪造live identity

#### Scenario: policy 内容变化
- **WHEN** caller显式提供的任一Project declaration identity与Result保存值不同
- **THEN** overall applicability MUST为`stale`并返回可解释的declaration reason
- **AND** reader MUST NOT打开`verification.yml`或从path自行观察变化

#### Scenario: 显式 identity 已变化
- **WHEN** caller提供的target或任一declaration identity与Result保存值不同
- **THEN** 对应axis与overall applicability MUST为stale并返回保存值差异reason
- **AND** MUST NOT删除、覆盖或改写current Result

#### Scenario: 仅工作区declarations保持空集合
- **WHEN** caller提供的target与保存值相同，且current Task有效Project集合与declaration observations仍为空
- **THEN** declarations axis MUST通过空数组纯值比较返回current
- **AND** Task新增Project、Service或Project-bound Change后 MUST以非空observations使旧Result返回stale

## ADDED Requirements

### Requirement: Task Verification 必须为仅工作区Task记录类型化coverage gap
Task Verification MUST从Task Record的显式Project、Service所属Project与Change所属Project派生按code排序的有效Project集合，并观察该集合中的全部Project declarations。只有集合为空时，Application MUST允许Result保存空declarations；该Result MUST包含唯一`scope: workspace` coverage gap、空capabilities与`not-passed` conclusion。有效Project集合非空时，Application MUST要求非空且完整的Project declarations，并 MUST拒绝workspace gap。

#### Scenario: workspace-only Result不自动passed
- **WHEN** workspace-only Task没有已声明或适用的workspace验证能力
- **THEN** record MUST保存空Project declarations、唯一workspace coverage gap与`not-passed` conclusion
- **AND** MUST不自动创建测试、声明、capability fact或passed结论

#### Scenario: Project Task仍拒绝空declarations
- **WHEN** Task具有显式Project、Service所属Project或Change所属Project
- **THEN** declaration observer MUST返回每个有效Project的current declaration或absent observation
- **AND** Application/repository新写入 MUST拒绝空declarations和workspace coverage gap

#### Scenario: Service-only Task观察父Project
- **WHEN** Task只在`scope.services`引用一个或多个Service且未冗余填写`scope.projects`
- **THEN** Task Verification MUST观察每个Service所属Project的declaration并执行现有Service applicability检查
- **AND** MUST不把该Task分类为workspace-only

#### Scenario: 多Project与Project-bound Change完整观察
- **WHEN** 有效Project集合来自显式Project、多个Service或多个Change且存在重复Project
- **THEN** Application MUST去重排序并精确绑定全部Project declaration identities
- **AND**任一 declaration新增、删除或identity变化 MUST使旧Result declaration applicability stale

#### Scenario: workspace Result currentness
- **WHEN** caller提供的Content Target与保存值相同且current declaration observations仍为空
- **THEN** inspect MUST通过纯值比较返回target与declarations current
- **AND**Content Target变化或有效Project集合变为非空 MUST返回stale而不是修改、回填或删除旧Result

#### Scenario: workspace Result closed shape不完整
- **WHEN** 空declarations与缺失workspace gap、Project/Service gap、非空capabilities、overrides语义或passed conclusion组合
- **THEN** domain或Application MUST拒绝整个Result并保留原current值
- **AND** MUST返回稳定类型化diagnostic
