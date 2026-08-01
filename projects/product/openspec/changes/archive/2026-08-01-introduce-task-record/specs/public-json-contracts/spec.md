## ADDED Requirements

### Requirement: Task Record CLI 必须提供稳定公开 JSON identity
`buildr task create|inspect|update|complete|abandon --json` MUST 返回 `buildr.task-record-result/v1` 顶层 identity，并 MUST 至少包含 operation、status、taskId、canonical path、record、`recordDigest: string|null`、diagnostic、effects 与 nextActions；checkout 和 npm tarball CLI MUST 保持 schema parity。非空 `recordDigest` 是当前有效 canonical bytes 的响应级 evidence，不属于持久 Task Record schema；记录不存在或无法形成有效 read model 时为 `null`。

#### Scenario: Task Record 操作成功
- **WHEN** 五个 action 中任一成功并请求 JSON
- **THEN** stdout MUST 是单一有效 `buildr.task-record-result/v1` 对象且 stderr 为空
- **AND** payload MUST 返回实际 operation、created/inspected/updated/completed/abandoned status、当前 record、匹配该 record bytes 的 `recordDigest` 与精确 effects

#### Scenario: Task Record 业务冲突
- **WHEN** action 因重复 identity、state conflict、无效引用、损坏 record 或 canonical root 证明失败而 blocked
- **THEN** stdout MUST 仍返回 `buildr.task-record-result/v1` blocked 对象并以非零状态退出
- **AND** payload MUST 包含稳定 error code、未发生 effects、可用 Task identity、可证明时的当前 `recordDigest` 与唯一 next action

#### Scenario: Task Record 命令语法错误
- **WHEN** 调用缺少 task-id、required title/intent/summary/reason，update 没有 mutation flag，或包含未知/冲突参数
- **THEN** CLI MUST 使用登记的 `buildr.cli-error/v1` envelope 和对应 Task Manager help topic
- **AND** MUST NOT 输出部分 Task Record result 或混入人类可读文本

#### Scenario: JSON 暴露暂缓字段
- **WHEN** Task Record result 的 `record` 或 canonical fixture 包含 revision、`recordDigest`、workspaceId、storage/publication classification、Environment identity 或专业 record reference
- **THEN** public schema verification MUST 失败
- **AND** 顶层 `recordDigest` MUST NOT 被解释或渲染为 `task.yml` 字段，checkout/npm parity MUST NOT 以两端同时漂移为通过

#### Scenario: JSON coverage 未登记新 action
- **WHEN** command registry 已启用任一 Task Record JSON action，但 public schema registry、关键字段检查或 checkout/npm parity 没有覆盖
- **THEN** 产品验证 MUST 失败并报告遗漏的 command/schema family
