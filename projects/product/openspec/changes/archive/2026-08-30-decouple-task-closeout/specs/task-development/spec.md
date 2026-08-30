

## REMOVED Requirements

### Requirement: Finish carrier 必须由Development证明内容等价
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: 恢复 evidence 不得成为 normal Child 流程替代
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

## MODIFIED Requirements

### Requirement: Task Development 必须拥有终态 Contribution reconciliation evidence
已有贡献登记 MUST支持直接完成的子任务；必须明确贡献映射、reason、source、expectedTaskDigest 与当前父计划，校验直接关系、规范归档、结果身份和其他子任务归属。MUST不要求旧候选、收尾关联或Child研发记录；不能仅从completed推断贡献或父任务验收。旧v1证据只读，新v2写同一已有表并保持事务、幂等与冲突保护。

#### Scenario: 写入一次恢复 evidence
- **WHEN** 子任务已完成，调用方已核对真实成果并提交完整且当前的贡献处置
- **THEN** MUST通过既有入口记录并显示贡献判断；相同重放保持不变，父任务仍独立验收

#### Scenario: 写入失败
- **WHEN** 身份、内容、父计划、任务结果版本或归属存在冲突
- **THEN** MUST拒绝相关写入或不采用陈旧证据，保留已有结果并报告精确原因

### Requirement: 终态恢复输入必须由 action contract 发现
已有贡献登记 MUST支持直接完成的子任务；必须明确贡献映射、reason、source、expectedTaskDigest 与当前父计划，校验直接关系、规范归档、结果身份和其他子任务归属。MUST不要求旧候选、收尾关联或Child研发记录；不能仅从completed推断贡献或父任务验收。旧v1证据只读，新v2写同一已有表并保持事务、幂等与冲突保护。

#### Scenario: 查看恢复schema
- **WHEN** 只查询输入定义
- **THEN** MUST返回含任务结果版本的closed输入，不读取工作空间或执行写入
