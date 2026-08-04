## MODIFIED Requirements

### Requirement: Task Record CLI 必须提供稳定公开 JSON identity
`buildr task create|inspect|update|complete|abandon --json` MUST返回 `buildr.task-record-result/v2` 顶层 identity，并 MUST至少包含 operation、status、taskId、record、`recordDigest: string|null`、diagnostic、effects 与 nextActions；checkout 和 npm tarball CLI MUST保持 schema parity。v2 MUST删除 canonical path，且 MUST NOT暴露 database path、table、row id、SQL 或 storage internals。非空 `recordDigest` 是 current normalized logical record 的响应级 evidence，不属于持久 Task Record schema；记录不存在或无法形成有效 read model 时为 `null`。

#### Scenario: Task Record 操作成功
- **WHEN** 五个 action 中任一成功并请求 JSON
- **THEN** stdout MUST是单一有效 `buildr.task-record-result/v2` 对象且 stderr 为空
- **AND** payload MUST返回实际 operation、created/inspected/updated/completed/abandoned status、当前 record、匹配其规范化逻辑内容的 `recordDigest` 与精确 effects

#### Scenario: Task Record 业务冲突
- **WHEN** action 因重复 identity、state conflict、无效引用、database/schema failure 或 canonical root 证明失败而 blocked
- **THEN** stdout MUST仍返回 `buildr.task-record-result/v2` blocked 对象并以非零状态退出
- **AND** payload MUST包含稳定 error code、未发生 effects、可用 Task identity、可证明时的当前 `recordDigest` 与唯一 next action

#### Scenario: Task Record 命令语法错误
- **WHEN** 调用缺少 task-id、required title/intent/summary/reason，update 没有 mutation flag，或包含未知/冲突参数
- **THEN** CLI MUST使用登记的 `buildr.cli-error/v1` envelope 和对应 Task Manager help topic
- **AND** MUST NOT输出部分 Task Record result 或混入人类可读文本

#### Scenario: JSON 暴露暂缓字段
- **WHEN** Task Record result 包含 canonical path、database path、table、row id、SQL、revision、workspaceId、storage/publication classification、Environment identity 或专业 record reference
- **THEN** public schema verification MUST失败
- **AND** 顶层 `recordDigest` MUST NOT被解释或渲染为数据库字段，checkout/npm parity MUST NOT以两端同时漂移为通过

#### Scenario: JSON coverage 未登记新 action
- **WHEN** command registry 已启用任一 Task Record JSON action，但 v2 public schema registry、关键字段检查或 checkout/npm parity 没有覆盖
- **THEN** 产品验证 MUST失败并报告遗漏的 command/schema family
- **AND** MUST NOT保留 v1 alias 或按运行时存储选择不同 schema
