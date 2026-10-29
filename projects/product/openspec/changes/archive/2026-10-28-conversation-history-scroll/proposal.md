## Why

当前按 100 条记录返回历史，工具密集时首批可能只有半轮；顶部按钮和下拉提示也打断连续阅读。用户希望打开后看到最近几轮，并在向上阅读时自然接入更早内容，因此现在调整历史读取和触发方式。

## What Changes

- 默认读取最近 5 轮，向前分页同样最多 5 轮；容量过大时保留现有 4 MiB 保护和续读位置，不截断原始记录。
- 在用户向上阅读且接近顶部时提前分批加载，覆盖鼠标、触摸、键盘和滚动条，移除加载按钮及下拉提示。
- 保持当前阅读位置、展开状态、防重入和跨对话结果隔离；失败保留现有内容并允许继续向上重试，打开对话不自动耗尽历史。
- 无持久数据迁移或外部调用方破坏性变更：`nextEntryCursor` 继续使用记录顺序，显式 `limit` 保持原有条数语义；用户界面有意替换旧手动入口。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`：更早记录改为按轮渐进读取及向上阅读自动预取，替换手动按钮和下拉提示约定。

## Impact

- `services/buildr-agent/src/application/conversation-application.ts` 的历史视图选择与相关服务测试。
- `services/buildr-web/src/features/agent-conversations/` 的分页请求、滚动交互、阅读定位与样式，以及已有浏览器旅程。
- 公开字段与本机原始历史保持兼容；无需新增依赖、修改厂商执行器（Executor）或改变发送、恢复、权限行为。
- 当前知识评估覆盖 `knowledge/docs/architecture/agent-integration.md` 与 `knowledge/code-map/technical-layers.md`：现有职责和陈述仍适用，无需新增地图、图示或术语；实施后复核。任务范围见[任务说明](@task/conversation-history-scroll)。
