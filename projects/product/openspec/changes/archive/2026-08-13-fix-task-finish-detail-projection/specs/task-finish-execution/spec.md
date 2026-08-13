## ADDED Requirements

### Requirement: Task Finish CLI detail 投影必须与执行 authority 分离
Task Finish Application MUST从同一个canonical `buildr.task-finish-result/v2`确定性生成CLI detail投影。`full` MUST原样保留canonical Result；`compact` MUST通过closed字段白名单生成`buildr.task-finish-compact-result/v1`，且 MUST不写SQLite、不改变run/result、不查询第二authority、不创建新的恢复或diagnostics store。detail选择 MUST只影响CLI JSON序列化，不得改变五阶段执行、resume、Delivery Carrier、Execution Record、Task terminal或Environment cleanup。

#### Scenario: complete Result 的两种投影
- **WHEN** 同一complete terminal Result分别以compact与full读取
- **THEN** 两者 MUST表达相同run、Task、handoff、Candidate、Content Target、status、delivery与completion结论
- **AND** compact MUST省略full diagnostics并使用独立schema identity

#### Scenario: blocked Result 可恢复
- **WHEN** current run因Delivery Adaptation、target race、retained Doctor或cleanup暂态条件blocked
- **THEN** compact MUST保留current phase、primary failure、唯一next action或workflow、matching resume与恢复所需关键refs
- **AND** Agent MUST不需要读取full Result才能识别并恢复同一run

#### Scenario: compact 投影失败
- **WHEN** canonical Result缺少compact契约要求的run、identity、status或恢复事实
- **THEN** Application MUST fail closed并返回受控CLI错误
- **AND** MUST不补造identity、修改canonical Result或降级为对象展开
