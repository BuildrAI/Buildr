## Context

参见 [proposal.md](proposal.md) 的背景说明。`buildr-web` 与 `buildr-harness-web` 共用同源逐字节一致的 Markdown 渲染模块（由静态测试守卫），此前为避免注入风险未启用任何原始 HTML 节点创建。

## Goals / Non-Goals

**Goals:**
- 让表格单元格、段落、列表、引用、标题、行内强调/链接以及独立成行位置的无属性 `<br>` 写法产生真实换行。
- 维持纯 DOM 节点创建方式（`createElement('br')`），不引入 `innerHTML` 或 HTML 解析器依赖。
- 确保 `markdownHeadingCounts` 与实际渲染标题生成的锚点 `id` 完全一致，并保证双端实现字节一致。

**Non-Goals:**
- 不支持任意内联/块级 HTML 标签（如 `<span>`、`<div>`、`<a>`、`<img>`）或带属性的 `<br ...>`、闭合标签 `</br>`。
- 不改变 CommonMark 软换行（段落内单回车）行为，也不修改其他非 Markdown 文本阅读视图。

## Decisions

1. **白名单精确匹配与 DOM 原生创建（替代启用原始 HTML 解析）**
   - 仅当 `marked` 产生 `html` 令牌且文本精确匹配无属性 `<br>` 写法时，创建原生 `br` 节点；其余 `html` 令牌继续以 `createTextNode` 原样输出。
   - 相比引入 HTML 清洗器（Sanitizer）或开启 `innerHTML`，该策略零新依赖、零脚本注入面，且与已有代码风格和安全性约束完全匹配。
2. **窄幅拦截块级 HTML 分词以处理独立成行的 `<br>`**
   - 在 `marked` 中，独立成行的 `<br>` 会触发 CommonMark HTML Block Type 7，导致整段被打包成块级 `html` 令牌并吞掉紧随的普通文本行。
   - 在自定义 `tokenizer.html` 中仅对「行首最多 3 空格 + 无属性 `<br>` + 空白至行尾」返回 `undefined` 退回普通段落/内联解析，其他所有块级 HTML（如 `<script>`、`<div>`、`<!--`）保持返回 `false` 沿用默认块级分词器处理。
   - 该设计避免破坏紧随其后的 Markdown 语法（例如 `<br>\n**加粗**` 或 `<br>\n<script>...</script>`），同时确保后续其他 HTML 块继续受文本节点保护。
3. **统一文本提取与双端同步**
   - 同步在纯文本提取辅助函数将 `br` 令牌和无属性 `<br>` 视为空串，避免带 `<br>` 的标题在计算锚点计数和渲染 DOM `textContent` 时产生不同 `id`。
   - 同步更新 `buildr-web` 与 `buildr-harness-web` 的 `markdown.ts`，满足静态一致性测试。

## Risks / Trade-offs

- [部分历史文档原本把独立成行的 `<br>` 期望为空行] → 退回普通段落后仍会渲染为 `<br>` 元素并占一行高度，符合常见 Markdown 阅读习惯；后续如需要可配合排版调整间距。
- [带有额外属性或斜杠空格的非法 `<br>` 变体（如 `<br / >`、`<br onclick="...">`）] → 继续按纯文本字面量显示，保证不会意外放行无效属性或潜在攻击载荷。
