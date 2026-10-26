## REMOVED Requirements

### Requirement: Project与Service注册必须触发Declaration Intake提示
**Reason**: 清理旧分类、入口及技能职责，保留对应行为证明。
**Migration**: 由本变更四类检查、两个项目技能及同文件的新要求承接。

## ADDED Requirements

### Requirement: Project与Service注册必须触发声明核对提示
Project或Service成功注册后，Buildr MUST向Agent提供对应scope的声明核对 next action，准备声明由 `buildr` 指引维护，测试登记由 `project-testing` 维护。该提示 MUST只启动只读发现，注册事务 MUST不创建或修改`preparation.yml`或`verification.yml`。

#### Scenario: 注册Project
- **WHEN** `project create`成功完成Project与registry写入
- **THEN**结果 MUST提示检查Project Preparation与Verification声明
- **AND**缺失声明 MUST不使Project注册失败

#### Scenario: 注册Service
- **WHEN** `service create`成功完成Service与registry写入
- **THEN**结果 MUST提示只读刷新所属Project及该Service的声明候选
- **AND** MUST不静默把Service加入任一声明
