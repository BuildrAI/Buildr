## 1. 关联模型与契约

- [x] 1.1 定义 `release-task-evidence-correlation` portable schema、evidence role、carrier/context identity 和 current/stale/blocked/unknown 状态。
- [x] 1.2 实现只读 owner projection 校验：Task/Contribution、Environment、Development handoff、Finish Delivery/Execution Record 与 matching self-bootstrap Activation 只保留引用、identity、digest 和诊断定位。
- [x] 1.3 实现三条合法路径（自动 Finish、Finish reconcile、matching self-bootstrap）的统一关联与跨 run/tree/digest fail-closed 诊断。

## 2. Release consumer 接入

- [x] 2.1 将关联结果接入现有 release transaction context，保持旧 context/evidence schema 的兼容字段和唯一 owner 边界。
- [x] 2.2 提供受限 inspect/validate 入口，禁止 caller completion claim、旁路 SQLite、历史 stdout 或专业 Result 正文进入 context。

## 3. 验证与交接

- [x] 3.1 增加 contract/unit/integration tests，覆盖成功关联、三条路径等价、缺证据、跨运行、identity 漂移、Delivery 已成立但 Activation/cleanup 未完成。
- [x] 3.2 运行 strict OpenSpec validation、release affected verification，并复核 portable JSON 不泄露本地路径/SQLite/完整执行输出。
- [x] 3.3 更新受影响的 release knowledge/brief，形成 current knowledge 与实现 identity 对账。
