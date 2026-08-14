## MODIFIED Requirements

### Requirement: Deterministic operation必须使用保守白名单
Planner MUST只自动接受能由结构与baseline证明唯一结果的完整ADDED、唯一REMOVED、无冲突RENAMED、baseline/current匹配的完整MODIFIED，以及identity唯一且内容完整的Scenario增改。未明确声明的Scenario缺失 MUST NOT被推断为删除。

当完整`MODIFIED`省略既有Scenario且两侧Scenario identity均唯一时，blocked item MUST保留既有capability、Requirement、operation与`semantic-resolution-required` code，并增加`reason: scenario-identities-omitted`及按确定顺序排列的`omittedScenarioIdentities`。该诊断 MUST只提供可移植identity，不复制Scenario正文，也不得授权Buildr自动保留或删除。

#### Scenario: 完整MODIFIED与baseline一致
- **WHEN** delta提供完整Requirement，baseline中有唯一原内容且current仍等于baseline
- **THEN** planner MUST生成完整替换operation并保留delta未要求删除之外的契约结构
- **AND** expected digest MUST绑定完整结果

#### Scenario: Partial MODIFIED省略既有Scenario
- **WHEN** planner确认canonical或baseline的唯一Scenario identities中存在delta未包含的identity
- **THEN** 整批plan MUST blocked且保持canonical零写入
- **AND** blocker MUST列出受影响Requirement、`scenario-identities-omitted` reason与全部`omittedScenarioIdentities`
- **AND** Agent MUST根据Change意图显式修订完整Requirement后重试，Buildr不得自行补回或删除Scenario
