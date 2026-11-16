## 1. 模型网关与 Antigravity 隔离中文标题实现

- [x] 1.1 更新 `services/buildr-harness/src/executors/model-title.ts` 提示词要求简体中文精短标题，并补充 `test/unit/model-title.test.ts` 验证。
- [x] 1.2 在 `services/buildr-harness/src/executors/antigravity/coordinator.ts` 扩展辅助客户端生命周期管理（`openAuxiliaryTitleClient` 及退出清理），新建 `services/buildr-harness/src/executors/antigravity/title.ts` 并在 `index.ts` 实现 `AntigravityRuntime.generateTitle`。
- [x] 1.3 更新 `services/buildr-harness/src/application/conversation-application.ts` 的 `acceptTitle`，防止原生英文标题打断在途独立标题生成或覆盖 Antigravity 兜底标题。

## 2. 集成测试与知识同步确认

- [x] 2.1 更新 `test/integration/executors/fixtures/antigravity-acp.mjs` 并在 `test/integration/executors/antigravity.test.ts` 与 `test/integration/conversations.test.ts` 新增隔离中文标题、工具拒绝、纯英文输出拒绝与原生英文抑制测试并运行通过。
- [x] 2.2 核对并汇报静态检查、单元测试与集成测试结果，确认受影响知识说明范围。
