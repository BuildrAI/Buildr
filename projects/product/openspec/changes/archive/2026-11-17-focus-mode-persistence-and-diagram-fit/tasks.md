## 1. 专注/分屏跨刷新持久化与嵌入式握手加固

- [x] 1.1 在 `services/buildr-web/src/lib/optional-preferences.ts` 与 `services/buildr-harness-web/src/lib/optional-preferences.ts` 的 `writeOptionalPreference` 中实现 `buildr:source-control-cache:` 配额溢出驱逐重试逻辑并保持两端一致
- [x] 1.2 更新 `services/buildr-web/src/features/harness-ui/AgentConversationsContext.tsx`，增加 `sessionStorage` 会话偏好快照兜底及 `open`/`full`/`view` 引用同步保护
- [x] 1.3 更新 `services/buildr-web/src/features/harness-ui/ConversationWorkspace.tsx`、`services/buildr-harness-web/src/HarnessApp.tsx` 与 `ConversationPanel.tsx`，加固 `configure` 重发、首次配置 `view` 保护及显式 `full` 开关同步

## 2. 信息流 Mermaid 图示比例适配无滚动条

- [x] 2.1 在 `services/buildr-harness-web/src/lib/markdownDiagramSvg.ts` 与 `services/buildr-web/src/lib/markdownDiagramSvg.ts` 的 `setDiagramSvg` 中补全正值 `viewBox` 对应的固有 `width`/`height` 属性
- [x] 2.2 在 `services/buildr-harness-web/src/shared.css` 与 `services/buildr-web/src/shared.css` 中为 `.ac-stream .markdown-diagram[data-mermaid-state="rendered"] > .markdown-diagram-view` 及其 `> svg` 添加自适应无滚动条样式，并保持两文件逐字节一致

## 3. 测试补充与全量验证

- [x] 3.1 在 `services/buildr-harness-web/test/ui/markdown-diagrams.test.mjs` 补充 `writeOptionalPreference` 缓存驱逐测试与 `setDiagramSvg` 固有宽高测试
- [x] 3.2 更新 `services/buildr-harness-web/test/browser/markdown-overflow.test.ts`，覆盖 `.ac-stream` 宽图/高图自适应无滚动条及非 `.ac-stream` 文档容器局部滚动边界衔接
- [x] 3.3 更新 `services/buildr/test/e2e/harness-frame.ts`，覆盖满存储配额下专注/分屏模式跨刷新保持与信息流流程图自适应无滚动条及全屏放大预览
- [x] 3.4 运行静态边界检查、构建、单元测试、浏览器端到端检查与 OpenSpec 严格校验，并启动托管预览验证
