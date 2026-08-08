## ADDED Requirements

### Requirement: Receipt v5必须继续使用唯一Environment current slot
Workspace SQLite `task_environment_current` MUST继续作为每个Task唯一Environment authority，并 MUST以完整closed payload持久化Receipt v5。Buildr MUST不为Preparation Declaration、Recipe或Step创建第二套current store、history或lifecycle projection副本。

#### Scenario: v5 Receipt整值替换
- **WHEN** prepare或资源lifecycle成功形成新的Receipt v5
- **THEN** repository MUST在单一transaction中closed-normalize、整值替换并重读确认
- **AND** 失败 MUST rollback并保留旧current

#### Scenario: 只读旧版本
- **WHEN** repository读取v4 Receipt
- **THEN** reader MUST返回legacy read model
- **AND** MUST不在GET、inspect或migration open时回写v5
