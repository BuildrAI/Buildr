## Context

- `buildr-web` 与 `buildr-harness-web` 共用同源 Markdown 渲染与样式契约（`src/markdown.ts` 与 `src/shared.css` 必须保持逐字节一致，由 `host-boundaries.test.mjs` 守护）。
- 对话信息流（`.ac-stream`）已于此前变更实现按容器宽度与 `min(65vh, 520px)` 双限等比缩放无滚动条显示，并在 `setDiagramSvg` 中根据正值 `viewBox` 为 `<svg>` 写入固有宽高属性。
- 文件阅读、知识正文、任务资料等正文阅读入口统一使用 `MarkdownHost`，而文章正文使用 `ArticleBody` 直接调用 `renderMarkdown` 与 `renderMarkdownDiagrams`。其中 `MarkdownHost` 已绑定 `bindMarkdownDiagramPreviews` 与 `MarkdownDiagramPreview`，`ArticleBody` 尚未绑定点击放大全屏预览。

## Goals / Non-Goals

**Goals:**
1. 在所有非信息流正文阅读容器（文件阅读、知识正文、任务资料、文章等）中，使已渲染 Mermaid 图表默认按可用容器宽度等比缩放并自然展开完整高度，不出现横向或纵向滚动条；小于容器宽度的图表保持固有尺寸居中显示。
2. 保留对话信息流（`.ac-stream`）原有的宽高双限（`max-height: min(65vh, 520px)`）等比缩放与无滚动条行为。
3. 为文章正文（`ArticleBody`）补齐点击放大全屏预览交互，保证所有共享文档阅读入口体验一致。
4. 保留未渲染/回退源码状态及合成无状态容器（无 `[data-mermaid-state="rendered"]`）的局部滚动与 `forwardDiagramBoundaryWheel` 滚轮衔接能力。

**Non-Goals:**
- 不限制文档阅读区已渲染图表的高度（采用用户选定的方式 1，而非方案 2 的一屏压高）。
- 不修改 `setDiagramSvg`、安全过滤规则、缓存策略或内嵌 HTML/SVG 安全限制。

## Decisions

### Decision 1: 通用已渲染样式按宽度自适应、信息流保留高度上限
- **方案选择（方式 1 vs 方式 2）**：文档阅读区相较信息流更宽且面向连续精读，采用方式 1——在基础 `.markdown-diagram[data-mermaid-state="rendered"] > .markdown-diagram-view` 上解除 `max-height` 与内部滚动（`max-height: none; overflow: hidden;`），对内部 `> svg` 设置 `display: block; width: auto !important; height: auto !important; max-width: 100% !important; max-height: none !important; margin-inline: auto;`。再由排在后面的 `.ac-stream .markdown-diagram[data-mermaid-state="rendered"] > .markdown-diagram-view > svg` 单独覆写 `max-height: min(65vh, 520px) !important;`。
- **兼容策略**：保留 `.markdown-diagram-view` 基础样式中的 `max-height: min(70vh, 640px); overflow: auto;` 及 `forwardDiagramBoundaryWheel`，确保未渲染完成、渲染回退或测试/外部合成的无 `[data-mermaid-state="rendered"]` 容器继续拥有受控局部滚动而不撑开页面。
- **替代方案**：若采用方式 2（文档区同样加 `max-height`），偏高的时序图会被连带缩窄宽度、两侧留白，难以直接阅读文字，与用户确认的方式 1 不符。

### Decision 2: 为 `ArticleBody` 补齐点击放大预览并复用现有组件
- `ArticleBody` 复用 `bindMarkdownDiagramPreviews` 与 `MarkdownDiagramPreview`，与 `MarkdownHost` 共享完全一致的放大图标按钮、点击图示/键盘触发和全屏矢量预览逻辑，不重复实现预览弹层。

### Decision 3: 当前知识影响评估
- 经核查 `knowledge/docs/architecture/knowledge-maintenance.md` 第 70 行与 `knowledge/reviews/v0.1.0-readiness.md`：前者描述历史“普通正文不直接渲染 Mermaid”且主要针对知识专题/GitHub 差异，后者为历史阶段评审记录；本变更不改动架构分层或目录映射，无因本次变更失效的现行知识文档必须同步修改。

## Risks / Trade-offs

- **极长竖图占用多屏文档高度** → 属于方式 1 预期行为，图表自身不设内部滚动条，随外层文档自然滚动浏览，同时支持点击放大全屏缩放平移。
- **双端共享样式漂移风险** → 同时修改 `buildr-web/src/shared.css` 与 `buildr-harness-web/src/shared.css`，并通过 `diff` 与 `host-boundaries.test.mjs` 强制校验逐字节一致。
