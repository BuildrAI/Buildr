# openspec-deterministic-sync Specification

## Purpose

定义 Buildr 如何从 delta、contract baseline 与 canonical facts 证明唯一同步结果，原子应用 identity-bound plan，并在语义歧义、输入漂移或验证失败时保持零写入和可恢复的 Agent fallback。

## Requirements

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

### Requirement: Deterministic apply必须在提交前验证完整expected Project
Buildr MUST 在替换真实canonical前，把本批次全部expected OpenSpec files投射到task-owned temporary Project surface，并使用receipt绑定的OpenSpec executable/version执行strict validation。只有expected surface验证通过且input/output digests仍匹配时才能原子提交；失败时整批MUST零写入并返回validation diagnostic与Agent fallback。

#### Scenario: 新capability缺少严格结构
- **WHEN** deterministic plan生成的新capability缺少`Purpose`、`Requirements`或其他当前strict validator要求的结构
- **THEN** apply MUST在真实canonical写入前返回blocked
- **AND** actual canonical files MUST保持不变

#### Scenario: Expected surface严格验证通过
- **WHEN**全部expected files在temporary Project中通过绑定版本的strict validation且receipt identity未变化
- **THEN** apply MUST原子提交完整批次
- **AND** result MUST记录expected digests、validator identity、duration和diagnostic reference

### Requirement: 新capability Purpose必须来自明确authority
Planner MUST只从proposal中对应New Capability的唯一非空描述取得新canonical Purpose authority，并 MUST NOT由Requirement正文、模型补写或默认模板推断语义。Purpose缺失、重复或不能形成可strict验证的expected surface时，整批plan MUST返回`semantic-resolution-required`。

#### Scenario: Proposal描述不足以形成合法Purpose
- **WHEN** new capability的proposal描述缺失、重复或导致expected strict validation失败
- **THEN** planner或apply MUST返回blocked与最小修复引用
- **AND** MUST NOT创建部分canonical capability

### Requirement: 持久化OpenSpec convergence receipt必须可移植
Buildr MUST将运行时OpenSpec executable定位与持久化identity分离。任何进入Workspace或Project候选树的新增或重写convergence receipt MUST只保存portable source reference、OpenSpec version和可核验executable/package identity，MUST NOT保存用户home、task worktree、临时目录或其他机器绝对路径。

#### Scenario: Task checkout执行convergence
- **WHEN** orchestrator使用task checkout内的绝对OpenSpec executable完成plan、apply和strict validation
- **THEN** 运行期间MUST核对同一executable identity
- **AND** 落盘receipt MUST使用相对Product/Service reference或逻辑source identity，不得包含task checkout绝对路径

#### Scenario: 读取历史绝对路径receipt
- **WHEN** Buildr读取旧schema中包含绝对`openspecExecutable`的历史receipt
- **THEN** reader MAY兼容解析该receipt用于诊断
- **AND** 任何更新或新生成结果MUST迁移为portable schema，不得复制旧绝对路径

#### Scenario: 开源候选覆盖持久化receipt
- **WHEN** open-source candidate或contract fixture检查tracked active/archive convergence receipts
- **THEN** verification MUST拒绝新生成的机器/用户绝对路径并报告具体receipt字段
- **AND** portable receipt MUST保留足够identity证明同一OpenSpec executable/version参与确定性流程
