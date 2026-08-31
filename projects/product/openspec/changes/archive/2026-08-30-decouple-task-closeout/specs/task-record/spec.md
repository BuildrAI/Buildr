## ADDED Requirements

### Requirement: 完成命令必须传递已观察任务版本
已有 `task complete` MUST支持 `--expected-record <recordDigest>`，通过既有任务记录应用在同一写事务中校验。独立收尾 MUST传入刚观察的摘要；冲突 MUST保留记录，不覆盖新目标。旧自动收尾专用完成写入口 MUST退役。

#### Scenario: 并发更新
- **WHEN** 智能体观察记录后其他入口更新任务
- **THEN** 原摘要完成请求 MUST拒绝写入，重读后才能重新判断。

#### Scenario: 摘要匹配
- **WHEN** 任务结果真实完成且当前摘要匹配
- **THEN** 原完成动作 MUST保存结果，不创建交接或旧执行记录。
