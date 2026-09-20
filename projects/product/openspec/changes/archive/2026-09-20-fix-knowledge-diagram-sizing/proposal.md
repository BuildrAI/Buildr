## Why

知识文章内嵌技术图（Technical Diagram）当前统一使用 `1.6` 宽高比，图示实际比例不同时会留下明显底部空白。用户已在任务系统文章和此前的知识建设与维护文章中复现，需要按真实图形比例呈现并核对独立详情。

## What Changes

- 知识读取响应为成果增加可空只读字段 `diagramSize: { width, height } | null`；尺寸仅从已通过安全读取的原生 HTML 主 SVG `viewBox` 提取，图示正文在 JSON 响应中仍为 `null`。
- 文内预览（Preview）按容器宽度、图示比例及既有嵌入模式的垂直留白计算高度；无法识别尺寸时沿用既有回退。
- 在文章内嵌、图示独立详情和放大阅读中验证完整内容与原生交互，保持隔离策略和图示 HTML 不变。
- 同步说明、代码地图（Code Map）及相关来源观察，解释尺寸由真实展示文件提供。此次为增量字段；旧图无需迁移，新旧响应的兼容范围在设计中说明。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `project-knowledge-browsing`：增加图示尺寸的只读响应约定和文内预览按实际比例适配的行为。

## Impact

- 后端：知识读取、HTTP 响应结构与生成的类型，以及相关尺寸和隔离回归。
- 前端：`KnowledgeArtifactReader`、`KnowledgeDiagram` 及知识页面样式；独立图示继续使用完整原生呈现。
- 当前知识：`knowledge/docs/architecture/knowledge-maintenance.md`、`knowledge/code-map/knowledge-maintenance.md` 与 `knowledge/index.yml` 的相关说明和观察。
- 本次变更不包含工作台反馈布局、任务系统图的职责重写或技能说明增强；这些属于同一任务的其他已授权维护。无需新增依赖、知识存储或尺寸写回。
