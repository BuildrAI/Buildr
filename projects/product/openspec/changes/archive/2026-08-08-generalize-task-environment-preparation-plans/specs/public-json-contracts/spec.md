## MODIFIED Requirements

### Requirement: Task Environment CLI 必须提供稳定公开 JSON identity
`task environment prepare|inspect|cleanup --json` MUST返回`buildr.task-environment-result/v3`；Plan `record|inspect --json` MUST返回`buildr.task-environment-plan-result/v1`。Environment result MUST包含operation、status、taskId、SQLite current locator、observedAt、sanitized read model、Plan identity、逐Service/Step facts、diagnostic、effects与nextActions，并 MUST不暴露SQLite path、resource handle、凭证或完整命令输出。

#### Scenario: Environment 操作成功
- **WHEN** action成功并请求JSON
- **THEN** stdout MUST是单一匹配schema对象且stderr为空
- **AND** payload MUST返回实际operation、status、观察时间、locator、read model与精确effects

#### Scenario: Environment 业务阻塞
- **WHEN** action因plan-missing/invalid、scope、identity/drift、Step failure、provider、Runtime/CLI、projection、resource或cleanup authorization blocked
- **THEN** stdout MUST返回v3 blocked对象并以非零状态退出
- **AND** payload MUST包含稳定code、具体Service/Step、已发生effects与next action

#### Scenario: Inspect 尚无 Environment Receipt
- **WHEN** 有效Task尚无current且执行inspect
- **THEN** payload MUST返回只读unavailable、空read model与prepare next action
- **AND** MUST不创建row或伪造Plan/effect

#### Scenario: JSON 暴露敏感或越权字段
- **WHEN** result包含secret、环境变量值、完整stdout/stderr、任意shell、resource handle、provider receipt、Agent session或SQLite path
- **THEN** public schema verification MUST失败
- **AND** checkout/npm parity同时漂移 MUST不视为通过

#### Scenario: JSON coverage 未登记 Environment action
- **WHEN** public command registry启用Plan或Environment action但schema/parity未覆盖
- **THEN** package verification MUST失败并指出遗漏family
- **AND** 内部resource/saved-current actions MUST不进入public registry
