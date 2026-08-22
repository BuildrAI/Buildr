## Why

发布集合已经有统一的模型，但发布就绪仍无法用一个可验证的证据载体说明“这次发布对应哪些 Task、怎样完成交付、是否完成 matching self-bootstrap”。如果继续让 release 流程分别读取 Task、Finish 和自举结果，容易把不同运行、不同 checkout 或过期 handoff 拼成一次发布。现在需要把这些专业事实关联起来，供后续 readiness 和受保护发布事务消费。

## What Changes

- 增加一个由 Task/Finish/self-bootstrap 权威事实组成的发布证据关联读模型。
- 为每次关联生成稳定的 release carrier 与 transaction context identity，并绑定 Task scope、Task Development handoff、Task Contribution、Finish Delivery、Execution Record 和 self-bootstrap Activation 的原始引用与 digest。
- 支持自动 Finish、Agent 直接 Git/PR 后 reconcile、matching self-bootstrap 三条合法路径；缺证据、跨运行或 identity 不一致时返回可诊断的 blocked/unknown，而不是猜测完成。
- 保持各专业 Application/Repository/Writer 不变；读模型只组合引用，不复制专业 Result 或旁路 SQLite。
- 不创建 release branch，不选择 Candidate，不 dispatch publish workflow，也不执行 Git 收敛。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `release-collection-model`: 补充发布身份链中 Task、Finish 与 self-bootstrap 证据关联的 portable read model、currentness 和失败语义。

## Impact

- 影响 Buildr Product 的 release/application 读模型、Task Finish 交接读取和 self-bootstrap activation 证据读取。
- 新增窄的 portable JSON/read-model contract 及对应单元、集成测试；不改变现有 Task、Finish、Verification 或 self-bootstrap writer 的持久化格式。
- 后续 P1-A/P1-B/P2/P3 可通过该读模型检查发布证据，但本 Change 不实现这些发布阶段。
