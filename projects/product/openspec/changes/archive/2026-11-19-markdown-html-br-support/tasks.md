## 1. 共享渲染器实现

- [x] 1.1 更新 `services/buildr-web/src/markdown.ts` 与 `services/buildr-harness-web/src/markdown.ts`，支持内联及独立成行的无属性 `<br>` 渲染为 `<br>` 元素并同步标题锚点纯文本提取，验证 `diff -u` 双端完全一致。

## 2. 单元测试与验证

- [x] 2.1 在 `services/buildr/test/unit/buildr-web-markdown.test.ts` 补齐表格单元格、混合正文、独立成行、标题锚点/图片 alt 一致性及代码/转义/实体/带属性负例测试，确认单测与双端静态检查全部通过。
- [x] 2.2 在任务工作树运行改动选组验证与四服务全量静态检查及单元测试（`npm run check`），确认全部本机适用检查通过。
