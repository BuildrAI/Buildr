## 1. 回推内容与接口

- [x] 1.1 终态事件携带完整 finalReply 与 finalReplyUrl，新增 read 权限的最终回复轻量接口。
- [x] 1.2 decision.requested 携带完整问题/选项及回答身份与对话 revision。
- [x] 1.3 所有业务事件携带当前凭据 scopes 与 allowFullAccess。

## 2. 新事件与设置

- [x] 2.1 新增 run.progress，按 run 至少五分钟一次合并最新中间消息。
- [x] 2.2 新增 run.stalled，运行中连续二十分钟无记录推送一次并在恢复后重置。
- [x] 2.3 两个新事件计入现有速率限制，默认开启并可在凭据回推设置中分别关闭。

## 3. 文档与验证

- [x] 3.1 更新 /help、/operations、OpenAPI 与运行时技能说明，包含字段、事件、接口和示例 payload。
- [x] 3.2 补齐单元与集成测试，覆盖完整字段、节流、停滞恢复、权限和轻量接口。
