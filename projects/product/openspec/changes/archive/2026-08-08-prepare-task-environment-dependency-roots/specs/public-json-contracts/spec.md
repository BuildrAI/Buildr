## MODIFIED Requirements

### Requirement: Task Environment CLI 必须提供稳定公开 JSON identity
`buildr task environment prepare|inspect|cleanup --json` MUST返回`buildr.task-environment-result/v2`顶层identity，并 MUST至少包含operation、`status: ready|blocked|unavailable|cleaned`、taskId、SQLite-backed current availability/locator、observedAt、sanitized Environment read model、逐dependency-root facts、diagnostic、effects与nextActions；checkout和npm tarball CLI MUST保持schema parity。read model MUST区分Environment总事实、scope聚合、dependency roots与provider summary，并 MUST NOT把这些字段解释为Task Record内容或暴露SQLite path、完整Receipt、resource handle或完整npm输出。

#### Scenario: Environment 操作成功
- **WHEN** 三个action中任一成功并请求JSON
- **THEN** stdout MUST是单一有效`buildr.task-environment-result/v2`对象且stderr为空
- **AND** payload MUST返回实际operation、status、观察时间、SQLite locator、read model与精确effects

#### Scenario: Environment 业务阻塞
- **WHEN** action因identity/drift、scope/provider、Runtime/CLI、某dependency root、projection、resource、cleanup authorization或migration conflict blocked
- **THEN** stdout MUST仍返回`buildr.task-environment-result/v2`blocked对象并以非零状态退出
- **AND** payload MUST包含稳定error code、具体root/scope、已发生effects、可用Environment identity与next action

#### Scenario: Inspect 尚无 Environment Receipt
- **WHEN** 有效Task尚未形成current row且调用方执行inspect JSON
- **THEN** payload MUST返回成功的只读unavailable结果、stable diagnostic、observedAt、空read model、SQLite locator与prepare next action
- **AND** MUST NOT创建row、解析environment.json或伪造preparation effect

#### Scenario: JSON 暴露敏感或越权字段
- **WHEN** public result包含凭证、完整npm输出、任意cleanup shell、resource handle、完整provider receipt、Agent session handle、SQLite database path或Task Record环境字段
- **THEN** public schema verification MUST失败
- **AND** checkout/npm两端同时漂移 MUST NOT被视为parity通过

#### Scenario: JSON coverage 未登记 Environment action
- **WHEN** command registry已启用任一Task Environment JSON action，但schema registry、关键字段检查或checkout/npm parity没有覆盖
- **THEN** 产品验证 MUST失败并报告遗漏的command/schema family
- **AND** 内部`resource register/release`与saved-current read MUST NOT被误列为public JSON命令
