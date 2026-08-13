## Context

Task Finish 的 canonical `buildr.task-finish-result/v2` 同时承担完整 run 诊断和公开 CLI 输出。CLI registry 已接受 `--detail compact|full`，但 Application 输出边界没有解析 detail，导致两种调用逐字相同。SQLite current、run Result 与 Execution Record 的 authority 已稳定，本变更只应修复输出投影，不能改变这些 owner facts。

## Goals / Non-Goals

**Goals:**

- 让 compact/full 形成真实、可验证的不同 JSON 契约。
- compact 保留 Agent 判断终态、定位当前失败和恢复同一 run 所需的全部最小事实。
- full 保持现有 v2 bytes shape，避免破坏 self-bootstrap 与诊断消费者。
- 通过 closed allowlist、schema registry 和 parity tests 防止 compact 再次膨胀。

**Non-Goals:**

- 不改变 Task Finish run、五阶段、SQLite schema、resume token、Execution Record、Delivery Carrier 或 cleanup。
- 不压缩或删除 full Result，也不把完整诊断复制到新 store。
- 不为其他 CLI 家族顺带增加 compact 投影。

## Decisions

### 1. 在 Application 输出边界投影，不修改 canonical Result

`run()` 与 `inspect()` 继续生成现有 `buildr.task-finish-result/v2`。`print()` 前由纯函数按 detail 选择输出：`full` 原样返回 canonical Result；`compact` 从该 Result 生成 closed projection。这样 persistence、resume、self-bootstrap 和内部调用继续消费同一 authority。

备选方案是在 Domain/SQLite 中再保存 compact Result，否决原因是会形成第二份可漂移的 Finish facts。

### 2. compact 使用独立 schema identity

compact 登记为 `buildr.task-finish-compact-result/v1`；full 继续使用 `buildr.task-finish-result/v2`。不能让 compact 在 v2 下删除大量字段，否则违反公开 JSON 同 major 只允许 additive 演进的规则。

缺省 JSON detail 为 `compact`，显式 `--detail full` 才输出 v2。非 JSON文本输出沿用现有摘要。self-bootstrap runner 已显式传入 `--detail full`，无需改变其输入。

### 3. compact 采用字段白名单

compact 顶层只允许：detail、run/task/status/current phase、resolved identity、phase status/timing、primary failure、next workflow/action、resume、关键 refs、delivery/completion disposition、metrics、Execution Record summary 和时间戳。失败路径只从已知 path/unrelatedPaths/conflict findings 中提取有界字符串列表，不复制完整 operations、checks、observations、diagnostics正文或本机 locator。

投影函数不得以对象展开复制 canonical Result；新增 full 字段不会自动进入 compact。

### 4. 参数在执行前闭合校验

`--detail` 缺省为 `compact`，只接受 `compact|full`。其他值在读取或执行 Finish 之前返回 `buildr.cli-error/v1`，不创建 Execution Record、run 或其他副作用。

## Risks / Trade-offs

- **默认 JSON schema 从 v2 变为 compact v1** → 这是显式的公开行为变更；依赖完整 v2 的消费者必须传 `--detail full`，CLI help、JSON 文档和测试同时更新。
- **compact 漏掉恢复事实** → blocked、Doctor blocked、target race、Delivery Adaptation 与 cleanup pending fixtures分别断言 run id、failure、next action、resume 和关键 refs。
- **compact 随实现增长再次膨胀** → 使用 closed allowlist和 schema/forbidden-field contract，不根据 full Result 自动透传。
- **文本与 JSON 默认值混淆** → detail 只影响 JSON payload；文本输出保持现有三行摘要。
