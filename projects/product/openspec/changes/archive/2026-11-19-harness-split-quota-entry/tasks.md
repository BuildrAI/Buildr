## 1. 前端与集成入口实现

- [x] 1.1 在 `services/buildr-harness-web` 中让 `ConversationDock`、`ConversationDockSurface`、`AccountQuotaButton` 与 `HarnessConversationSurface` 统一在普通分屏展开态拆出独立供应商额度入口、按停靠方向调整浮层位置、剥离齿轮的额度浮层及专注聚焦属性，并支持 `quota` 公开指令透传；验证方式：`npm run test:static`、`npm test` 与 `host-boundaries` 边界检查通过。
- [x] 1.2 在 `services/buildr-web` 的 `AgentConversationsContext`、`ConversationWorkspace`、`harness-ui.css` 与 `development-harness-shell.css` 中为分屏收起态导轨在设置按钮上方增加独立供应商额度入口，通过公开指令展开分屏并直达“账号与额度”页签；验证方式：`npm run test:static` 与 `npm test` 通过。

## 2. 知识文档同步

- [x] 2.1 更新 `knowledge/docs/architecture/agent-integration.md` 关于独立供应商额度入口与设置齿轮职责分离的说明；验证方式：对照规范检查文档描述与实际实现一致。

## 3. 端到端与回归验证

- [x] 3.1 在 `services/buildr/test/e2e/harness-frame.ts` 补齐 Development 普通分屏展开态与收起态的独立额度入口、悬停预览、点击直达“账号与额度”、齿轮不触发浮层及草稿保留断言，并运行四服务全量静态/单元检查及 `harness-frame-browser` 与独立 Harness 浏览器测试确认全部通过。
