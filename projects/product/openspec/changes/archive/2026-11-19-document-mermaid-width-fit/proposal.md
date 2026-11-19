## Why

当前仅对话信息流（`.ac-stream`）内的已渲染 Mermaid 图表支持等比缩放与无滚动条显示；文件阅读、知识正文、任务资料和文章等非信息流文档阅读容器仍保留固定高度（`max-height: min(70vh, 640px)`）和局部滚动条，导致中等及大型时序图默认只能看到被裁切的一截且横纵滚动条干扰正文翻页。此外，文章正文（`ArticleBody`）尚缺少点击放大全屏预览绑定。详细背景与目标见[任务说明](@task/document-mermaid-width-fit)。

## What Changes

- 将非信息流文档阅读容器内已渲染 Mermaid 图表（`[data-mermaid-state="rendered"]`）调整为按容器可用宽度等比自适应显示、自然展开高度、不产生横纵滚动条；小于容器宽度的图表保持固有尺寸居中显示。
- 保留对话信息流（`.ac-stream`）原有的宽高双限制（`max-height: min(65vh, 520px)`）等比缩放与无滚动条行为。
- 保留未渲染/回退源码状态及合成无状态容器的局部滚动保护与滚轮衔接逻辑。
- 为文章正文（`ArticleBody`）补齐 `bindMarkdownDiagramPreviews` 与 `MarkdownDiagramPreview` 全屏矢量预览。
- 本次调整**不**包含破坏性变更（no **BREAKING** changes）。

## Capabilities

### New Capabilities
- 无新增能力。

### Modified Capabilities
- `project-knowledge-browsing`: 更新 `共享正文必须安全渲染本地 Mermaid 图示` 需求，将非信息流阅读容器的默认渲染改为按容器宽度等比自适应、自然高度展开、无滚动条，并确保文章正文同样支持全屏预览。

## Impact

- 受影响服务与文件：
  - `services/buildr-web/src/shared.css` 与 `services/buildr-harness-web/src/shared.css`（保持逐字节一致）
  - `services/buildr-web/src/features/publication/components/ArticleBody.tsx`
  - `services/buildr-harness-web/test/browser/markdown-overflow.test.ts`
  - `services/buildr-web/test/browser/task-materials-journey.ts`
  - `services/buildr/test/e2e/publication-journey.ts`
