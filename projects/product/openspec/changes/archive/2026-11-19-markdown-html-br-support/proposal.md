## Why

Buildr Web 与 Buildr Harness Web 共用的 Markdown 渲染器目前把所有解析得到的原始 HTML 令牌（包括内联与独立成行的 `<br>`、`<br/>`、`<br />`）统一输出为纯文本。结果在文档阅读器、任务说明和表格单元格中，常见的 `<br>` 换行标签直接显示为字面量文字，导致多条编号说明或状态条目挤成一行，破坏阅读排版。

## What Changes

- 扩展共享 Markdown 渲染器，安全支持无属性 `<br>` 换行标签（`<br>`、`<br/>`、`<br />` 等合法空白变体，不区分大小写）在内联位置（段落、表格单元格、列表、引用、标题、强调与链接）及独立成行位置渲染为真实换行。
- 调整标题锚点文本提取与图片替代文本计算逻辑，使 `<br>` 在语义上视为空文本而非字面量标签字符串，保证章节计数与渲染锚点一致。
- 保持原有安全边界不变：带任意属性的 `<br ...>`、闭合标签 `</br>`、代码与转义及实体中的 `<br>`，以及其他任意原始 HTML 继续按纯文本显示，不引入 `innerHTML`。
- 不包含破坏性变更；对既有的合规 Markdown 语法、代码块及安全拒绝行为保持兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-client`: 更新“共享阅读器保留常见文档语法结构与安全边界”需求，明确无属性 `<br>` 换行标签渲染为真实换行，同时保留其余原始 HTML 作为纯文本的安全边界。

## Impact

- `projects/product/services/buildr-web/src/markdown.ts`：更新共享 Markdown 词法与节点构建。
- `projects/product/services/buildr-harness-web/src/markdown.ts`：同步保持双端共享 Markdown 渲染源码完全一致。
- `projects/product/services/buildr/test/unit/buildr-web-markdown.test.ts`：补充内联、表格、独立成行、标题锚点及安全负例回归测试。
- 不涉及外部 API、数据库格式或依赖升级。
