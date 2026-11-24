## MODIFIED Requirements

### Requirement: Buildr 必须提供当前认知维护能力契约
Buildr MUST 提供 `buildr.current-knowledge-maintenance/v4` 协作约定（Capability Contract）和默认技能（Skill），支持 `assess|reconcile|inspect|maintain`；内置调用方 MUST 同步采用 v4，默认包 MUST 保留旧契约内容而仅迁移内置提供与调用声明，MUST NOT 静默改写用户自有旧依赖或绑定。术语治理 MUST 按需使用已选提供者（默认由本技能承接），仅在实际术语影响需要时消费已选提供者（Provider）。授权、来源、逐项结果和局部失败边界 MUST 保持有效；v4 MUST 不再创建、刷新或要求额外变更说明（Change Brief），MUST NOT 接管任务材料关联或默认收纳任务过程报告。

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

### Requirement: 映射维护必须组合专业能力而不接管事实建设
当前知识维护（Current Knowledge Maintenance）MUST 将 OpenSpec 对规范建设、`code-architecture` 对代码建设的指导与映射制作区分；MUST 按真实需要采用当前可用的 Archify、本技能的代码地图参考 和已选术语治理（Terminology Governance）能力，维护技术图（Technical Diagram）、代码地图（Code Map）、术语及解释之间的关联。已有 v3 范围、授权、结果和局部失败保证 MUST 保持有效，不把全部专业能力设为所有调用的必需条件。

#### Scenario: 只有代码定位改变
- **WHEN** 当前授权变更包含相关知识维护，且只移动实现文件且不改变术语或图中关系
- **THEN** 维护对应地图和引用，核对后保留相关图示，不要求执行无关术语治理（Terminology Governance）
