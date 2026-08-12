## ADDED Requirements

### Requirement: Sync planner必须证明唯一结果
Buildr MUST 提供只读deterministic sync planner，比较change delta、contract baseline与当前canonical facts，并为每个operation返回`safe`、`already-applied`或`blocked`、稳定identity、输入digests、expected digest和decision reason。Planner MUST NOT依据Agent或模型置信度判定确定性。

#### Scenario: 完整ADDED Requirement不存在
- **WHEN** delta提供结构完整且identity唯一的ADDED Requirement，当前canonical中不存在同名Requirement
- **THEN** planner MUST生成唯一append operation与expected canonical digest
- **AND** plan MUST标记该operation为`safe`

#### Scenario: ADDED Requirement已存在且内容相同
- **WHEN** canonical中同名Requirement的规范内容已等于delta预期结果
- **THEN** planner MUST标记operation为`already-applied`
- **AND** apply MUST NOT重复写入

#### Scenario: 输入存在语义歧义
- **WHEN** identity重复、baseline drift、partial MODIFIED无法证明Scenario保全、rename目标已存在或删除对象无法唯一定位
- **THEN** planner MUST返回`blocked`与`semantic-resolution-required`
- **AND** MUST NOT生成可执行写入operation

### Requirement: Deterministic operation必须使用保守白名单
Planner MUST只自动接受能由结构与baseline证明唯一结果的完整ADDED、唯一REMOVED、无冲突RENAMED、baseline/current匹配的完整MODIFIED，以及identity唯一且内容完整的Scenario增改。未明确声明的Scenario缺失 MUST NOT被推断为删除。

#### Scenario: 完整MODIFIED与baseline一致
- **WHEN** delta提供完整Requirement，baseline中有唯一原内容且current仍等于baseline
- **THEN** planner MUST生成完整替换operation并保留delta未要求删除之外的契约结构
- **AND** expected digest MUST绑定完整结果

#### Scenario: Partial MODIFIED省略既有Scenario
- **WHEN** planner无法证明delta是完整Requirement或省略内容是否应保留
- **THEN** 整批plan MUST blocked
- **AND** result MUST列出受影响Requirement和需要Agent判断的最小上下文

### Requirement: Sync apply必须原子且identity-bound
Buildr MUST提供sync apply入口，只消费未过期且identity匹配的plan receipt；写入前MUST重验change、delta、baseline、canonical与expected file digests。任一operation blocked或identity变化时整批MUST零写入。

#### Scenario: Safe批次成功应用
- **WHEN**全部operations为safe/already-applied且receipt identity仍匹配
- **THEN**apply MUST先生成并验证完整expected files，再以原子替换提交
- **AND**result MUST返回actual digests、effects和passed receipt

#### Scenario: Apply前canonical漂移
- **WHEN**plan生成后canonical digest发生变化
- **THEN**apply MUST返回`receipt-stale`并保持全部canonical文件不变
- **AND**consumer MUST回到plan/pre-sync边界而不是刷新事后授权

#### Scenario: 中间文件写入失败
- **WHEN**temporary生成、验证或rename准备阶段任一步骤失败
- **THEN**apply MUST不提交任何canonical目标变化
- **AND**result MUST保留失败阶段与安全恢复引用

### Requirement: Deterministic sync必须提供Agent fallback证据
当plan blocked时，Buildr MUST返回`semantic-resolution-required`、blocked operations、权威输入引用和未执行effects；Agent-driven fallback完成后仍MUST重新经过strict validation与post-sync guard。

#### Scenario: Task Finish遇到blocked plan
- **WHEN**convergence orchestrator收到blocked deterministic plan
- **THEN**Task Finish MUST停在最后成功阶段并返回Agent fallback action
- **AND**MUST NOT把convergence composite或canonical sync标记passed
