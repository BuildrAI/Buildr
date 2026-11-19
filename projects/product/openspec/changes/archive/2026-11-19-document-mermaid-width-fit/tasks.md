## 1. 共享正文样式调整

- [x] 1.1 修改 `services/buildr-web/src/shared.css` 与 `services/buildr-harness-web/src/shared.css`，使已渲染 Mermaid 图表（`.markdown-diagram[data-mermaid-state="rendered"] > .markdown-diagram-view` 及内部 `> svg`）默认按容器宽度等比自适应、自然展开高度且无滚动条，并保持 `.ac-stream` 高度上限（`min(65vh, 520px)`）与双端 `shared.css` 逐字节一致（用 `diff -u` 与 `host-boundaries.test.mjs` 验证）

## 2. 文章正文全屏预览补齐

- [x] 2.1 修改 `services/buildr-web/src/features/publication/components/ArticleBody.tsx`，接入 `bindMarkdownDiagramPreviews` 与 `MarkdownDiagramPreview`，使文章内已渲染 Mermaid 图表支持点击、按键和放大按钮打开全屏矢量预览（用类型检查与浏览器端到端检查验证）

## 3. 回归测试与完整验证

- [x] 3.1 更新 `services/buildr-harness-web/test/browser/markdown-overflow.test.ts`，保留 `.ac-stream` 与合成局部滚动测试，并将文档阅读区场景更新为校验大时序图、超宽矮图、窄高图及紧凑小图的宽度等比自适应、自然高度展开、无滚动条与直接外层滚轮滚动
- [x] 3.2 更新 `services/buildr-web/test/browser/task-materials-journey.ts` 与 `services/buildr/test/e2e/publication-journey.ts`，校验窄屏任务说明与文章正文中的已渲染 Mermaid 图表无横纵滚动条、不撑开页面且点击可打开全屏预览
- [x] 3.3 在任务工作树运行 `verify-impact.mjs`、四服务全量 `npm run check` 及相关浏览器/E2E 回归检查，确认全部适用检查通过
