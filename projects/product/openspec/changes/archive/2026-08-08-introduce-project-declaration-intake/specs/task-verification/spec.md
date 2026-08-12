# task-verification Delta

## ADDED Requirements

### Requirement: Verification coverage gap必须触发Declaration Intake提示
Task Verification形成或读取coverage gap时 MUST提供只读Declaration Intake next action。Verification Result MUST继续只保存gap事实，且Task Verification MUST不在record或inspect中创建测试或写`verification.yml`。

#### Scenario: Project没有verification declaration
- **WHEN**完整Result记录`project:<code>` coverage gap
- **THEN**operation result MUST提示用户可启动Declaration Intake
- **AND** current Result MUST保持原gap，不因后续声明候选而改写

#### Scenario: 声明存在但Service coverage缺失
- **WHEN**完整Result记录`service:<project>/<service>` coverage gap
- **THEN**next action MUST携带该scope供Agent只读发现
- **AND**用户未授权时 MUST不更新Project声明
