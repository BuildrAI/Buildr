## ADDED Requirements

### Requirement: 当前认知必须支持独立事实收敛
Buildr MUST 允许 Agent 在没有 OpenSpec Change 时，对已由 canonical specs、当前实现、registries 或已确认决定证明的 Project 当前事实执行 `maintain`；该 operation MUST 只更新真实受影响的 current knowledge，MUST NOT 引入新业务语义、创建 Brief 或 Change sidecar。

#### Scenario: 已有事实缺少解释性文档
- **WHEN** 当前行为和 authority 已明确，但 overview、architecture、flow、service 或 glossary 缺失、陈旧或表述错误
- **THEN** provider MUST 依据明确 fact sources 创建或更新真实受影响的当前认知
- **AND** MUST 返回 changed assets、source identities 与当前 tree identity

#### Scenario: 维护中发现需要新业务决定
- **WHEN** 候选文档内容会改变 canonical Requirement、API、状态流、权限、业务规则或数据语义
- **THEN** provider MUST 返回 `change-required` 并停止写入该候选事实
- **AND** consumer MUST 重新进入 `change-flow`

#### Scenario: Authority 无法确认
- **WHEN** canonical specs、实现、registries 或已确认决定之间存在当前授权无法解决的冲突
- **THEN** provider MUST 返回 `unresolved` 和最少决策问题
- **AND** MUST NOT 通过只改 knowledge 选择任意一方

## MODIFIED Requirements

### Requirement: Buildr 必须提供当前认知维护能力契约
Buildr MUST 提供兼容的 `buildr.current-knowledge-maintenance/v1` 与 `v2` capability contracts 和默认 workspace Skill provider；v1 MUST 保持 `assess`、`reconcile` 和 `inspect` 三种 Change lifecycle actions，v2 MUST 增加独立 `maintain` 及其授权、副作用、失败语义和 result evidence。默认 provider MUST 同时提供 v1/v2，并 required 依赖 `buildr.terminology-governance/v1`。

#### Scenario: 评估 Change 影响
- **WHEN** v1 或 v2 consumer 请求 `assess`
- **THEN** provider MUST 分类 Brief、overview、product architecture、technical architecture、flows、services 和 glossary 的可能影响、目标与理由
- **AND** 无真实影响的目标 MUST NOT 被转化为空文档任务

#### Scenario: 收敛最终事实
- **WHEN** implementation content 已完成且 v1 或 v2 consumer 请求 `reconcile`
- **THEN** provider MUST 按最终 specs、实现、registries、Brief 和现有 knowledge 创建或更新实际受影响资产
- **AND** provider MUST 使用绑定的 terminology capability 解决或披露术语影响

#### Scenario: 检查收尾就绪
- **WHEN** Task Finish 请求 `inspect`
- **THEN** provider MUST 核对 assess impacts 已处理、Brief 与权威 artifacts 一致、current knowledge 对应最终 tree 且没有 unresolved terms
- **AND** 任一 required 条件不满足时 MUST 返回阻塞结果和可执行下一步

#### Scenario: 独立维护当前事实
- **WHEN** v2 consumer 请求 `maintain` 并提供 Project、targets、fact sources、授权范围和 tree identity
- **THEN** provider MUST 只维护已确认且真实受影响的 current knowledge
- **AND** result MUST 明确为 `aligned`、`updated`、`unresolved`、`not-applicable` 或 `change-required`
