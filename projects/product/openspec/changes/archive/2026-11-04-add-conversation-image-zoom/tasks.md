## 1. 渲染与交互

- [x] 1.1 `markdown.ts` 为已解析图片保留原始引用（`data-markdown-href`），并在渲染选项中增加图片触发回调类型；未提供回调时输出与现状一致。
- [x] 1.2 `MarkdownHost` 为图片附加 `role="button"`、`tabindex`、光标与提示，支持点击、Enter、空格触发；触发时阻止外层链接导航，并按最新回调派发。

## 2. 预览

- [x] 2.1 `ConversationPanel` 让对话正文与过程区的内联图片打开既有 `ConversationImagePreview`，携带当前对话选择与原始引用路径。
- [x] 2.2 `ConversationImagePreview` 放大到接近视口，提供“实际大小/适应窗口”切换与“新窗口打开”，失败与重试语义保持。
- [x] 2.3 图片、1:1 容器与提示的局部样式，窄屏不产生整页横向溢出。

## 3. 测试

- [x] 3.1 前端逻辑测试：内联图片获得可操作语义与原始引用、键盘触发、最新回调、缺少原始引用回退；完整 `frontend-logic` 通过。
- [x] 3.2 `agent-conversations` 浏览器旅程：点击内联图片打开预览、切换实际大小、新窗口入口、失败提示；该步骤在焦点模式真实浏览器中通过。
- [x] 3.3 类型检查通过。完整 `e2e-browser:agent-conversations` 在未改动的基线检出上同样失败于 `setup` 与 `history` 两个既有场景，本次新增步骤不受影响。

## 4. 当前知识

- [x] 4.1 更新 `knowledge/code-map/technical-layers.md` 与 `knowledge/index.yml`：对话正文图片放大、预览组件与 Markdown 触发模块。
