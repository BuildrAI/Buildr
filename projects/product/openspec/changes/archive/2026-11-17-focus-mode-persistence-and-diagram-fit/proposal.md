# 变更提案：修复专注与分屏模式跨刷新稳定记忆及信息流流程图自适应无滚动条显示

## Why

1. 用户在专注模式或分屏模式下刷新页面时，偶现页面退回分屏或收起状态。根因在于：
   - 源码控件缓存（`buildr:source-control-cache:v1:*`）最高可写入多个 2 MiB 条目并接近甚至占满浏览器 `localStorage` 配额；`writeOptionalPreference` 新增 `buildr.harness-panel-full` 等键时触发 `QuotaExceededError` 被静默吞掉，刷新读取为空。
   - 外层 `ConversationWorkspace` 与内嵌 `HarnessApp` 在 iframe 加载与重新握手期间存在异步竞态：`ready` 使用布尔值无法识别 iframe 重载，内层初次挂载会提前回传 `view: 'conversation'` 覆盖已恢复的 `history` 视图，且布局切换事件未携带显式布尔目标。
2. 对话信息流（`.ac-stream`）内的 Mermaid 流程图虽然已支持点击放大全屏预览，但默认内联预览强制按原始 `viewBox` 宽度渲染并触发内部横纵滚动条，导致长宽比较大的流程图被裁切，消息区内同时存在内部与外部滚动条干扰阅读。

## What Changes

- **存储配额降级与标签页兜底**：在 `buildr-web` 与 `buildr-harness-web` 的 `optional-preferences.ts` 中，当 `localStorage.setItem` 抛错时清理可驱逐的源码控件缓存（`buildr:source-control-cache:` 前缀）并重试写入；在 `AgentConversationsContext.tsx` 中为展开、专注/分屏与视图状态增加同标签页 `sessionStorage` 镜像读写，并与 `localStorage` 双向同步。
- **嵌入通信握手与显式状态一致**：`ConversationWorkspace.tsx` 将 `ready` 改为递增计数、用 `configured` 标记拦截首次配置完成前的 `view` 上报，并在 `configure` 消息中显式下发 `view`；`HarnessApp.tsx` 与 `ConversationPanel.tsx` 分别在首次配置完成后才同步 `view`，并在切换全屏时附带明确目标 `full` 布尔值。
- **信息流流程图按比例自适应无滚动条**：在 `markdownDiagramSvg.ts` 的 `setDiagramSvg` 中根据正值 `viewBox` 为 `<svg>` 补全固有 `width`/`height` 属性；在两服务保持逐字节一致的 `shared.css` 中，为 `.ac-stream .markdown-diagram[data-mermaid-state="rendered"] > .markdown-diagram-view` 禁用滚动条（`max-height: none; overflow: hidden;`）并让内部 `<svg>` 按比例缩放在可用宽度和 `min(65vh, 520px)` 高度以内；非信息流文档阅读容器保持局部滚动及滚轮衔接。
- **补充测试覆盖**：更新单元测试、信息流溢出浏览器测试以及宿主端到端浏览器测试。

## Capabilities

### Modified Capabilities
- `harness-web-composition`: 强化专注/分屏与展开偏好在存储配额耗尽、iframe 重载和初次握手下的跨刷新持久化，以及布局状态双向一致性。
- `project-knowledge-browsing`: 在保留文档阅读区局部滚动及滚轮边界衔接的同时，规定对话信息流内已渲染 Mermaid 图示必须按比例自适应容器尺寸并无滚动条显示。

## Impact

- 涉及服务：`product/buildr-web`、`product/buildr-harness-web`、`product/buildr`（端到端测试）。
- 兼容性：不改变服务端接口与外部事件协议版本（仍在 `buildr.harness-frame/v1` 内向下兼容扩展字段）。
