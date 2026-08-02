## ADDED Requirements

### Requirement: Task Review CLI 必须提供稳定 operation JSON identity
`buildr task review inspect|record --json` MUST 返回 `buildr.task-review-operation-result/v1` 顶层 identity，并 MUST 至少包含 operation、`status: inspected|recorded|blocked`、taskId、`slots.planning`、`slots.completion`、diagnostic、effects 与 nextActions。每个 slot MUST 包含 deterministic path、present、`result|null`、`resultDigest|null` 与 `applicability: current|stale|unknown|null`。

#### Scenario: JSON inspect 成功
- **WHEN** CLI 从 checkout 或 npm tarball 执行成功的 Task Review inspect
- **THEN** stdout MUST 是单一有效 operation result 且 stderr 为空
- **AND** 两种发行形态 MUST 保持 schema、字段与退出语义 parity

#### Scenario: JSON record blocked
- **WHEN** target identity 缺失、Task terminal、Result schema 无效或原子写入失败
- **THEN** stdout MUST 仍返回同一 schema 的 blocked object 并以非零状态退出
- **AND** effects MUST 不声称 canonical Result 已改变

#### Scenario: response-only digest
- **WHEN** 任一 slot 存在有效 Result
- **THEN** resultDigest MUST 是 canonical Result bytes 的响应级 identity
- **AND** Result object MUST 不包含 resultDigest、revision、current 或 applicability

### Requirement: Task Review JSON registry 必须与 command registry 同步
Public JSON registry、CLI command registry、help、schema validation 与 checkout/npm parity MUST 对 Task Review 两个 actions 保持一致；任一 action 可达但 operation schema/关键字段测试缺失时，package verification MUST fail closed。

#### Scenario: registry 漂移
- **WHEN** `task review inspect|record` 任一 command 已登记，但 public JSON family、关键字段 guard 或 parity fixture 缺失
- **THEN** static/package verification MUST 失败并指出缺失 identity
