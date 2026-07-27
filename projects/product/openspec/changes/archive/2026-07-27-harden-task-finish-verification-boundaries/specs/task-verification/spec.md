## ADDED Requirements

### Requirement: 正式保证前必须执行候选感知的确定性preflight
Task verification provider MUST在完整affected或Candidate execute前，根据当前candidate changed paths、Project verification registry ownership、selector和artifact dependencies生成preflight plan。只有声明为低成本、无共享副作用、可独立判定且被candidate直接命中的检查才能自动执行；preflight不得替代required assurance。

#### Scenario: Skill修改命中聚焦contract
- **WHEN** candidate修改Task Finish Skill且registry声明对应低成本sequencing contract selector
- **THEN** provider MUST在启动完整affected前执行该聚焦contract
- **AND** preflight失败时MUST返回失败并且MUST NOT启动完整affected

#### Scenario: Preflight通过
- **WHEN** 所有候选感知preflight检查通过
- **THEN** provider MUST继续执行原required affected或Candidate capabilities
- **AND** preflight evidence MUST绑定candidate identity并独立报告duration

#### Scenario: 选择器无法确定
- **WHEN** changed path没有owner、存在selector歧义或依赖声明不完整
- **THEN** provider MUST fail closed并报告registry finding
- **AND** MUST NOT通过硬编码文件名或Agent猜测选择测试

### Requirement: Verification evidence 必须区分首次验证与重新验证
Task verification provider MUST为每次execute保留独立candidate identity、wall-clock、失败项和supersession关系，并 MUST标记该execute属于initial verification或repair后的re-verification；provider不得把多次run合并为一个虚构成功耗时。

#### Scenario: 修复后重新执行正式保证
- **WHEN** repair transition使前序失败candidate被新candidate替代
- **THEN** 新evidence MUST标记`phase: re-verification`并引用被替代的失败evidence与transition reason
- **AND** initial与re-verification wall-clock MUST分别保留

### Requirement: Verification failure summary 必须区分失败与warning
Task verification provider MUST在统一summary中返回primary failed capability/check/test和非阻塞warnings；当exit code非零时，warning不得成为唯一failure reason。

#### Scenario: 并行能力中单项失败
- **WHEN** 多个required capabilities并行执行且一个contract capability失败、其他能力只产生budget warnings
- **THEN** summary MUST将contract capability及其失败check标记为primary failure
- **AND** warning列表MUST保留但不得改变真实失败identity
