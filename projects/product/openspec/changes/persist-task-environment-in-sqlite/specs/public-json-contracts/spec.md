## MODIFIED Requirements

### Requirement: Task Environment CLI 必须提供稳定公开 JSON identity
`buildr task environment prepare|inspect|cleanup --json` MUST 返回 `buildr.task-environment-result/v1` 顶层 identity，并 MUST 至少包含 operation、`status: ready|blocked|unavailable|cleaned`、taskId、SQLite-backed Environment current availability/locator、`observedAt`、sanitized environment read model、diagnostic、effects 与 nextActions；checkout 和 npm tarball CLI MUST 保持 schema parity。read model MUST 区分 Environment 总事实与 provider evidence summary，并 MUST NOT 把这些字段解释为 Task Record 内容或暴露 SQLite path、数据库页、完整 Receipt 与内部 resource handle。

#### Scenario: Environment 操作成功
- **WHEN** 三个 action 中任一成功并请求 JSON
- **THEN** stdout MUST 是单一有效 `buildr.task-environment-result/v1` 对象且 stderr 为空
- **AND** payload MUST 返回实际 operation、对应 `ready|unavailable|cleaned` status、当前观察时间、SQLite current locator、read model 与精确 effects；不得用 status 重复建立通用生命周期状态机

#### Scenario: Environment 业务阻塞
- **WHEN** action 因 Task 不存在、identity/drift、scope/provider、Runtime/CLI/依赖/projection、资源、cleanup authorization 或 migration conflict 被 blocked
- **THEN** stdout MUST 仍返回 `buildr.task-environment-result/v1` blocked 对象并以非零状态退出
- **AND** payload MUST 包含稳定 error code、已发生/未发生 effects、可用 Environment identity 与唯一 next action

#### Scenario: Inspect 尚无 Environment current
- **WHEN** 有效 Task 尚未形成 `task_environment_current` row 且调用方执行 `inspect --json`
- **THEN** payload MUST 返回成功的只读 `unavailable` 结果、稳定 no-receipt diagnostic、`observedAt`、空 read model、SQLite locator与prepare next action
- **AND** MUST NOT 把缺少 current row 作为损坏 Task、创建 row、解析 `environment.json` 或伪造 blocked preparation effect

#### Scenario: JSON 暴露敏感或越权字段
- **WHEN** public result 包含凭证、进程 secret、任意 cleanup shell、内部 resource handle、完整 provider receipt、Agent session handle、SQLite database path 或 Task Record 环境字段
- **THEN** public schema verification MUST 失败
- **AND** public read model MUST 只保留 UI/Agent 判断所需的 sanitized identity、状态、摘要与 evidence reference

#### Scenario: JSON coverage 未登记 Environment action
- **WHEN** command registry 已启用任一 Task Environment JSON action，但 schema registry、关键字段检查或 checkout/npm parity 没有覆盖
- **THEN** 产品验证 MUST 失败并报告遗漏的 command/schema family
- **AND** 内部 `resource register/release` MUST NOT 被误列为 public JSON 命令
