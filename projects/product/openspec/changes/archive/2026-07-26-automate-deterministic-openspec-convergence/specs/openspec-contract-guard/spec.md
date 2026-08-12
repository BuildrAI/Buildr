## ADDED Requirements

### Requirement: Contract guard必须与sync receipt共享identity
Pre-sync guard、deterministic sync plan/apply与post-sync guard MUST消费同一change、delta、baseline、canonical和OpenSpec executable identity。Receipt MUST记录每次合法stage transition并拒绝跳步、事后baseline或identity漂移。

#### Scenario: Guard与apply正常衔接
- **WHEN**pre-sync通过且planner/apply消费相同identity
- **THEN**post-sync guard MUST核对actual canonical digest等于receipt expected digest
- **AND**未触达Requirements MUST保持不变

#### Scenario: Agent fallback后恢复
- **WHEN**deterministic plan blocked且Agent完成语义sync
- **THEN**consumer MUST以原pre-sync authority核对delta与actual canonical结果
- **AND**identity变化时MUST重新进入允许的pre-sync边界，不得直接伪造post-sync receipt

### Requirement: Convergence receipt必须持久化阶段恢复证据
产品orchestrator MUST持久化compatibility scan、rehearsal、pre-sync、plan、apply、strict validation与post-sync的status、timing、input/output digests和diagnostic references。单个命令退出码MUST NOT替代阶段契约。

#### Scenario: 中间阶段失败后resume
- **WHEN**apply或strict validation失败
- **THEN**receipt MUST保留最后成功阶段和失败diagnostic
- **AND**resume MUST只重做失败阶段及其真实下游
