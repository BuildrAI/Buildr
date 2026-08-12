## ADDED Requirements

### Requirement: Finish run必须支持原子identity recovery
Buildr MUST提供版本化identity recovery入口，在同一finish run中一次消费旧/新environment、candidate、target、runtime、change与assurance identities，原子计算失效范围、终结受影响attempt/lease、保留仍有效evidence，并自动推进已登记的确定性步骤。Recovery MUST复用现有step、fingerprint、effect、evidence与safe executor语义，不得建立第二套完成状态。

#### Scenario: Implementation修订改变candidate与checkout-local CLI
- **WHEN** consumer提交可核验的implementation-changed transition及完整新identities
- **THEN** recovery MUST一次计算真正需要重建的最早边界与下游
- **AND** MUST自动推进可安全重建的context、knowledge、convergence、candidate、target与runtime步骤，停在required formal assurance

#### Scenario: Runtime projection only转换
- **WHEN** source/projection digests与允许路径集合证明变化仅为政策允许的`runtime-projection-only`
- **THEN** recovery MUST保留仍与implementation candidate绑定的正式保证
- **AND** MUST记录transition evidence而不是仅接受调用方分类字符串

#### Scenario: 未知或证据不完整的转换
- **WHEN** changed paths、source identity或provider policy不能证明受限transition
- **THEN** recovery MUST按implementation-changed fail closed计算失效
- **AND** MUST NOT复用可能失效的formal assurance

### Requirement: Compact failure必须保留可恢复的结构化诊断
Task Finish compact result MUST从失败observation保留失败step/stage、child result的稳定code/status、bounded findings/nextActions与durable full diagnostic reference。通用process error message MUST NOT替代可解析的child stdout/stderr结果；full detail仍MUST有界且digest绑定。

#### Scenario: Child CLI返回结构化blocked JSON
- **WHEN** safe handler的child process非零退出但stdout包含登记schema的blocked result
- **THEN** compact result MUST显示child code/status、失败stage与next action
- **AND** MUST提供完整diagnostic path/digest而不是只返回`Command failed`

#### Scenario: Child输出不是登记JSON
- **WHEN**child stdout/stderr不能解析为受支持schema
- **THEN**compact result MUST返回bounded preview、byte count、digest和process exit
- **AND** MUST明确标记diagnostic为unstructured

### Requirement: Completion metrics必须声明可观察coverage
Task Finish MUST通过run-local append-only observation ledger汇总Buildr-owned command、safe handler、verification stage与recovery action的start/finish、cwd/command identity、exit、原始stdout/stderr byte count和diagnostic reference。Completion receipt MUST区分产品可观察执行、Agent orchestration gap与外部不可观察调用，并声明`product-complete|product-partial|external-unobserved` coverage；部分计数MUST NOT表述为完整tool round trips或token消耗。

#### Scenario: 全部动作由登记executor执行
- **WHEN**finish run的命令均由Buildr-owned wrapper记录且ledger连续
- **THEN**completion metrics MUST标记`product-complete`
- **AND**MUST返回真实invocation count、output bytes、product wall-clock、queue与retry waste

#### Scenario: Agent在checkpoint间手工执行外部动作
- **WHEN**run只能观察到checkpoint时间而不能观察Agent/tool调用
- **THEN**completion metrics MUST把对应区间标记为unobserved orchestration gap
- **AND**MUST NOT用已记录observation数量冒充全部tool round trips或Agent token

### Requirement: Recovery性能必须进入真实finish benchmark
Buildr MUST提供identity-bound真实finish benchmark，至少覆盖首次成功、candidate修订恢复、formal assurance失败后修复和runtime projection closeout，并报告端到端wall-clock、产品执行、orchestration gap、retry waste、invocation与output metrics coverage。

#### Scenario: 无重试正常路径
- **WHEN**benchmark以固定work class首次通过全部finish步骤
- **THEN**结果 MUST独立报告OpenSpec convergence、formal assurance和其他closeout wall-clock
- **AND**正常路径目标 MUST约为3分钟且不得通过跳过required assurance达成

#### Scenario: Candidate修订后恢复
- **WHEN**benchmark改变implementation candidate并提交typed recovery manifest
- **THEN**结果 MUST报告recovery产品调用次数、重建步骤和到formal assurance的wall-clock
- **AND**MUST证明没有重复已通过且identity未变的副作用
