## 1. 单表 schema 与迁移

- [x] 1.1 添加连续 Workspace SQLite migration，建立 `task_finish_current` 的 typed fields、受验证 JSON、内嵌 lease 与必要索引。
- [x] 1.2 迁移可证明的旧 run/completion/lease 状态，拒绝损坏 identity、phase、owner 或 live artifact metadata，并在校验后删除旧四表。
- [x] 1.3 补齐 fresh、逐版本升级、数据保留、异常回滚、旧 runtime 版本门禁与 schema integrity 测试。

## 2. Finish repository 与 Application

- [x] 2.1 将 current、prepared cleanup 与 terminal persistence 收敛为单行原子 checkpoint，并从 typed fields、`phases_json` 与有界 payload 重建兼容 run/result。
- [x] 2.2 将 target lease 改为同行 target/token/expiry fencing，覆盖 acquire、renew、expired owner 重观测、release 与旧 token 拒绝。
- [x] 2.3 删除旧四表 reader/writer、transient artifact metadata API 与双 authority 分支，保持五阶段、resume、Environment cleanup 和 Task terminal writer 边界。

## 3. 只读投影与诊断

- [x] 3.1 将 Task Overview 的单次 LEFT JOIN 与 Terminal Delivery association 切换到唯一 `task_finish_current`。
- [x] 3.2 将 Task Finish inspect、Local App read model 与 Doctor/schema diagnostics 切换到单表并保持公开 current/terminal 文案和结果兼容。

## 4. 当前认知与直接验证

- [x] 4.1 更新 Buildr Service、technical architecture 与产品说明中的 Finish SQLite authority、lease、transient 和 terminal association 表述，并完成 terminology/current knowledge reconcile。
- [x] 4.2 更新 repository、migration、Overview、Local App、CLI 与 Product journey fixtures，运行 Task Finish focused/changed feedback 和 OpenSpec strict validation。
- [x] 4.3 审计生产 SQL、schema/Doctor、tests 与文档不再把旧四表或 `task_finish_phase_current` 当 current authority，完成 Change checklist 以进入 convergence。
