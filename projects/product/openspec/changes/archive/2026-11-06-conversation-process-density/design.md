## Context

处理过程由 `ConversationProcessBlock` 渲染：`processTimeline` 把工具、说明与思考排成时间线，思考渲染为 `ac-process-thinking` 折叠块。工具组 `ac-step-group-items` 没有任何高度约束，展开后随条目数量增长。

## Decision

- 思考条目保留在数据与分块层（`thinking` 条目仍参与执行状态与最终答复判定），但在渲染时间线中直接跳过；`ThinkingBlock`、规模提示与相关样式一并删除。
- 过程块没有任何可见时间线项时返回 `null`，避免出现空的“查看处理过程”行。
- 展开的工具组容器增加 `max-height: min(60vh, 480px)` 与 `overflow-y: auto`，`overscroll-behavior: contain` 避免滚动穿透；收起按钮位于滚动容器之外，始终可见。

## Risks

- 思考内容不再可通过界面查看；原始记录仍在，需要时可由执行器会话读取。
- 限高后的组内滚动在长条目（如大段输出）下仍可正常工作，单条详情自身已有高度上限。
