## 1. 移除执行方门禁

- [x] 1.1 `buildr-web/src/features/agent-conversations/conversation-options.ts`：删除 `conversationModelCompatibility`
- [x] 1.2 `buildr-web/src/features/agent-conversations/ConversationOptions.tsx`：移除分组限制提示、按兼容性的选项禁用与标题
- [x] 1.3 `buildr-web/src/features/agent-conversations/ConversationPanel.tsx`：移除兼容告警与发送可用性中的兼容条件
- [x] 1.4 `buildr-web/src/features/agent-conversations/conversation-preferences.ts`：偏好恢复不再按执行方拦截；删除不再使用的样式
- [x] 1.5 `buildr-agent/src/application/conversation-application.ts`：删除 `modelSourceIncompatibility` 与发送前拦截

## 2. 回归测试

- [x] 2.1 `buildr-web/test/conversation-model-controls.test.mjs` 与 `conversation-selection-preferences.test.mjs`：所有执行方均可选 Devin 模型，仅按可用性与启停拦截
- [x] 2.2 `buildr-web/test/browser/agent-conversations-journey.ts`：Codex、Qoder、DSH 均可选择并发送 Devin 模型，不可用项仍禁用
- [x] 2.3 `buildr-agent/test/integration/model-conversations.test.ts`：三种执行方均可发送，停用模型仍拒绝

## 3. 规范与当前认知

- [x] 3.1 同步主规范 `openspec/specs/unified-model-subscriptions/spec.md`
- [x] 3.2 更新 `knowledge/docs/architecture/agent-integration.md`
- [x] 3.3 更新 `services/buildr/resources/runtime/skills/buildr/references/agent-operations.md`

## 4. 直接验证

- [x] 4.1 `openspec validate devin-all-agents --strict` 与 `buildr openspec convergence preflight` 通过
- [x] 4.2 相关前端单元、后端集成、浏览器旅程与静态/规范检查通过
- [x] 4.3 本机真实 Devin 账号探测：Claude Opus 5.5、Claude Sonnet 5.5、GLM 5.2、Grok 4.7、DeepSeek V4.1 Flash 均按 Codex 说明返回工具调用；Fusion 组合返回上游 permission_denied（账号可用性）
