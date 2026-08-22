## MODIFIED Requirements

### Requirement: Task Finish 必须支持 Agent 主导的交付收敛
Buildr MUST提供不依赖既有Finish run或Delivery Carrier的交付收敛入口。该入口 MUST从current immutable Development handoff取得Task Contribution，并优先复用matching current Environment repository set；Environment不存在、已清理或局部不可用时，MUST从Task scope、canonical Project/Service registry、真实Git topology以及明确或唯一解析的remote/target branch构造只读delivery context。事实成立时 MUST保存与自动Finish相同的逐repository Delivery evidence并通过Task Record Application提交交付终态。调用方声明、commit message、run token、文件存在或“由Buildr执行” MUST NOT替代远端观察。

#### Scenario: Agent 已通过其他合法路径交付
- **WHEN** Agent使用Git Operations、PR或其他已授权路径把current Task Contribution交付到明确目标，并调用交付收敛
- **THEN** Buildr MUST从真实remote重建每个repository的包含证明并登记delivered
- **AND** MUST NOT要求重新执行固定五阶段、创建Delivery Carrier、恢复Environment或重复push

#### Scenario: ready Environment 可用
- **WHEN** matching Environment仍current且repository set identity与handoff一致
- **THEN** reconciliation MUST复用其selector、source checkout identity与目标默认值构造delivery context
- **AND** MUST NOT修改Environment Receipt、执行Preparation或把Delivery写入Environment authority

#### Scenario: Environment 不可用但交付上下文可独立证明
- **WHEN** Environment不存在、已清理或局部blocked，但current handoff、Task scope、registry、Git boundary、remote与target branch可唯一解析
- **THEN** reconciliation MUST继续只读验证真实远端并形成同形逐repositoryDelivery evidence
- **AND** Cleanup MUST保持`not-applicable`或`attention`，不得补造Receipt或声称资源已清理

#### Scenario: 远端不包含任务贡献
- **WHEN** 任一applicable repository的目标ref不包含current Task Contribution或目标identity有歧义
- **THEN** Buildr MUST只拒绝该repository的交付登记和依赖它的Task终态
- **AND** MUST返回可供Agent处理的实际refs、changed paths和唯一危险动作边界

#### Scenario: 多仓库部分交付
- **WHEN** 部分repository已证明Delivery而其他repository仍缺少包含证明或目标identity不明确
- **THEN** reconciliation MUST保留已证明repository的delivery checkpoint并只阻塞未证明部分
- **AND** MUST NOT把部分成功伪装成跨repository原子完成或撤销已成立事实
