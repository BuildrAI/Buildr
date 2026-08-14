## ADDED Requirements

### Requirement: Task Development driver 必须提供紧凑 current 与 next-action 投影

Task Development 内部 driver MUST 在显式 compact 请求下，从同一次 `buildr.task-development-operation-result/v1` 生成 response-only `buildr.task-development-driver-compact/v1` 投影。投影 MUST保留 operation、status、Task ID、Receipt digest、保存的observed time、current applicability axes、相关planning/content/policy/Candidate/handoff identities、Candidate generation、current gates、decision、reasons、effects、diagnostic与next actions；MUST NOT创建第二authority、再次inspect Workspace或改变Application effect。

Next actions MUST只根据同一次Application已保存的Receipt与applicability给出建议性方向，MUST NOT执行专业动作、修改Task/Receipt/gate/Candidate或根据timing、调用次数和其他效率指标自动skip/advance。默认未请求compact时 MUST继续返回完整 `buildr.task-development-operation-result/v1`。

#### Scenario: 显式请求紧凑反馈
- **WHEN** Agent对一个普通Task Development action显式传入compact选项
- **THEN** driver MUST只执行一次对应Application action并返回版本化compact投影
- **AND** `current`与`nextActions` MUST来自该次完整operation result，不得额外观察或持久化

#### Scenario: 需要完整研发事实
- **WHEN** Agent未请求compact或需要读取完整Receipt snapshot
- **THEN** driver MUST保持现有完整operation result shape与authority
- **AND** compact projection MUST NOT替代Application、repository或Development Receipt

#### Scenario: 建议不能自动推进
- **WHEN** current facts指向Planning Review、Formal Verification、Completion Review、risk decision或Finish等下一阶段
- **THEN** result MAY返回对应建议动作
- **AND** Agent MUST仍按selected provider、专业Result与明确授权决定是否执行，指标不得成为gate

## MODIFIED Requirements

### Requirement: Planning snapshot 必须最小、可移植且不是事件历史
Development Receipt MUST 保存一个 closed current `planning` snapshot，包含确定性 identity 与按稳定 id 排序的 nodes。Node MUST 只包含 `id`、`kind`、`authority`、portable `reference`、内容 `identity`、`pending|current|stale|not-applicable|waived` disposition、最小 `summary` 与按需 `source`；MUST NOT保存正文、diff、命令、attempt、progress、transition event或完整历史。

`begin|planning` action MUST把`planning`作为显式必填的完整整值snapshot；即使没有实际node，consumer也 MUST提交`{ "targetIdentity": null, "nodes": [] }`。省略`planning` MUST在任何Receipt写入前失败关闭，MUST NOT被解释为空replacement、preserve、patch或由Buildr推断。

#### Scenario: 专业 artifact 已形成
- **WHEN** proposal、design 或 Project 自定义规划 artifact 已由其专业 authority 保存
- **THEN** Development planning node MUST 只引用该 authority 的portable reference与content identity
- **AND** artifact内容变化后旧node MUST 不得继续解释为current

#### Scenario: 节点不适用
- **WHEN** Task性质决定某节点不适用
- **THEN** Development MAY 保存`not-applicable`与最小依据，或在没有治理价值时不创建该node
- **AND** MUST NOT创建空artifact、空Result或虚假identity

#### Scenario: begin或planning省略完整snapshot
- **WHEN** consumer调用`begin|planning`但没有提交顶层`planning`
- **THEN** shared action contract与Application MUST返回required-field diagnostic并保持零写入
- **AND** 既有planning、Candidate、gates、decision与handoffs MUST保持不变
