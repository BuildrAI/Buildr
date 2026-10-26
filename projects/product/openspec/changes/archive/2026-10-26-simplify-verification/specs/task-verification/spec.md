## REMOVED Requirements

### Requirement: 任务验证报告必须有意义且保持closed
**Reason**: 清理旧分类、重复执行和技能职责，保留实际行为证明。
**Migration**: 由本变更四类检查、两个项目技能及同文件的新要求承接。

## ADDED Requirements

### Requirement: 任务验证报告必须记录实际检查和未覆盖项并保持闭合
报告MUST至少包含一个实际check或gap。每个check MUST说明Project、可选Service、testing family、`focus|task-related|full`选择范围、实际targets、source、`passed|failed`结果、摘要和可选耗时；每个gap MUST说明未覆盖scope/testing及原因。Application MUST为每个check派生`declared|map-unavailable`地图状态，caller MUST NOT自行声明该状态。

`passed` MUST至少包含一个实际check且所有check均为passed；`not-passed` MUST至少包含一个failed check；`incomplete` MUST不包含failed check且至少包含一个gap。gap MAY与passed共存，但不能单独证明passed。

#### Scenario: 只有测试通过一句话
- **WHEN** caller提交没有checks和gaps的报告，或提交未知字段、绝对路径、非法outcome或矛盾passed结论
- **THEN** Application MUST拒绝整个报告
- **AND** 原current报告MUST保持不变

#### Scenario: 所需环境检查未执行
- **WHEN** Agent完成任务相关测试，但当前尚未进入测试环境
- **THEN** 报告MUST允许以gap记录所需环境检查未执行及原因
- **AND** Application MUST NOT自动把gap解释为Task blocked、风险接受或完成授权

#### Scenario: 只有gap却声明passed
- **WHEN** caller没有提交实际check，只提交gap并声明passed
- **THEN** Application MUST拒绝整个报告
- **AND** 原current报告MUST保持不变

#### Scenario: 结论与实际检查不一致
- **WHEN** caller声明not-passed但没有failed check，或声明incomplete却存在failed check或没有gap
- **THEN** Application MUST拒绝整个报告
- **AND** MUST不替caller猜测另一种结论

## MODIFIED Requirements

### Requirement: Task Verification Application不得生成Agent提示词
Task Verification Application MUST只维护Project测试地图绑定、正式报告和确定性适用性；Agent验证指令由界面或调用方基于Skill与当前Task形成。Application MUST不生成、保存或返回prompt。

#### Scenario: Agent开始任务验证
- **WHEN** 用户从Buildr Web或对话要求验证正式Task
- **THEN** Agent MUST读取项目验证技能（project-verification）、当前Task、真实改动和测试地图
- **AND** Application MUST不参与审阅范围选择或prompt生成
