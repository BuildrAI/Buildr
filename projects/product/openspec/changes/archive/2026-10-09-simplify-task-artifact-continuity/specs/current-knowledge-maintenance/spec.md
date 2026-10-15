## MODIFIED Requirements

### Requirement: Buildr 必须提供当前认知维护能力契约
Buildr MUST 提供 `buildr.current-knowledge-maintenance/v4` 协作约定（Capability Contract）和默认技能（Skill），支持 `assess|reconcile|inspect|maintain`；内置调用方 MUST 同步采用 v4，默认包 MUST 保留旧契约内容而仅迁移内置提供与调用声明，MUST NOT 静默改写用户自有旧依赖或绑定。术语治理 MUST 作为可选依赖，仅在实际术语影响需要时消费已选提供者（Provider）。授权、来源、逐项结果和局部失败边界 MUST 保持有效；v4 MUST 不再创建、刷新或要求额外变更说明（Change Brief），MUST NOT 接管任务材料关联或默认收纳任务过程报告。

#### Scenario: 评估 Change 影响
- **WHEN** v4 consumer 请求 `assess`
- **THEN** provider MUST 分类本次代码地图、技术图和解释文档的可能影响、目标与理由；任务整体需求 MUST 通过 TaskRecord.brief 读取而非复制
- **AND** 无真实影响的目标 MUST NOT 被转化为空文档任务

#### Scenario: 收敛最终事实
- **WHEN** implementation content 已完成且 v4 consumer 请求 `reconcile`
- **THEN** provider MUST 按最终 specs、实现、registries和现有 knowledge 完成已授权的实际受影响资产；新建授权以明确成果范围为准
- **AND** provider MUST 仅在真实术语影响下使用绑定的 terminology capability 解决或披露术语影响

#### Scenario: 检查收尾就绪
- **WHEN** Task Finish 请求 `inspect`
- **THEN** provider MUST 核对 assess impacts 已处理、current knowledge 对应最终 tree，并按实际术语影响检查适用结果
- **AND** 仅会导致相关动作产生错误结论、越权或覆盖他人工作的问题 MUST 返回局部阻塞和具体下一步；辅助记录缺失或非关键漂移 MUST 作为提醒

#### Scenario: 独立维护当前事实
- **WHEN** v4 consumer 请求 `maintain` 并提供 Project、targets、fact sources、授权范围和 tree identity
- **THEN** provider MUST 只维护已确认且真实受影响的 current knowledge
- **AND** result MUST 逐项明确为 `aligned`、`updated`、`attention`、`blocked`、`not-applicable` 或 `change-required`

#### Scenario: 无 Change 的任务说明形成
- **WHEN** 正式任务需要形成或更新独立 Task Brief，但没有 Change 或长期知识影响
- **THEN** 该动作 MUST 由任务管理技能（task-manager）通过TaskRecord.brief承接，不要求 current-knowledge provider 或 `assess`
- **AND** MUST NOT 因缺少 brief.md 而判定任务说明缺失，或为普通任务补造 OpenSpec 变更

### Requirement: 长期知识与任务过程材料必须按真实用途分工
当前知识维护（Current Knowledge Maintenance）MUST 只承担可长期复用、有当前事实来源的知识，MUST NOT 创建或维护额外 brief.md，MUST NOT 成为独立任务说明（Task Brief）、方案、实施或交付文档、审查及验证报告的默认收纳处。已有任务文档位于 `knowledge/` 时 MUST 保留原位置与历史，可由任务显式引用；文件位置本身 MUST 不改变正文、材料引用或专业结果的权威。过程材料中确有长期价值的内容，只能在明确授权与真实事实核对后维护对应当前知识，不复制全部报告或创建新的任务状态来源。

#### Scenario: 普通任务只有过程成果
- **WHEN** 无 OpenSpec 的任务需要说明、方案或交付文档，但不改变长期知识
- **THEN** 材料 MUST 保存在适用的真实项目或任务本机位置，由独立任务材料引用读取
- **AND** MUST NOT 为收纳这些材料机械调用知识建设或生成空知识文件

#### Scenario: 已有知识目录中的任务文档
- **WHEN** 旧任务文档已保存在 `knowledge/` 且适用于当前阅读
- **THEN** 任务 MUST 可显式引用原文而不复制、移动或重写其历史
- **AND** 读取 MUST 不自动把它登记为新的长期知识成果或改变 Task 状态

#### Scenario: 过程经验值得长期保留
- **WHEN** 已确认过程成果包含可复用知识且相关建设范围已获授权
- **THEN** 智能体（Agent）MUST 按长期阅读目标核对来源并维护实际受影响知识及引用
- **AND** 原专业报告与任务材料 MUST 保留自身权威，不复制其状态或完整执行历史进入 knowledge
