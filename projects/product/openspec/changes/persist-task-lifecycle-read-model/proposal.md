## Why

Local App 任务的“研发”和“证据”读取目前会在 GET 请求中重新检查 Task Environment、Git、Change、内容 identity 和专业 Result applicability，导致一次页面读取重复执行多个生命周期观察，实际耗时达到数秒。Task 生命周期动作已经拥有这些判断所需的事实和结果，因此应在生命周期动作完成时把可展示状态写入 Workspace SQLite，让 Local App 成为纯查询客户端。

## What Changes

- 将 Task Development、Review、Verification、Finish/cleanup 形成的可展示生命周期状态收敛为 Workspace SQLite current read model。
- 生命周期写入动作在完成状态转换或形成专业 Result 时，原子更新对应的 current 状态、identity、证据引用、观察时间和诊断摘要。
- Local App 任务研发、证据和终态交付接口只读取 Application read model，不在 GET 请求重新扫描 Git、文件、Environment 或重新计算 applicability。
- 明确页面展示的是最近一次正式生命周期动作确认的状态；外部内容变化由下一次正式生命周期动作发现并更新，不由普通读取隐式写入。
- 保留既有专业 writer 边界：Local App 不直接读写 SQLite，Development、Review、Verification 和 Finish 不互相复制对方的正文或替代对方 authority。

## Capabilities

### New Capabilities

- `task-lifecycle-read-model`: 定义正式 Task 生命周期动作写入、更新和查询可展示 current 状态的统一 read model 边界。

### Modified Capabilities

- `local-workspace-application`: 任务研发、证据和终态交付读取改为消费已保存的生命周期 read model，不在 GET 中进行 live applicability 检查。
- `task-development`: Development 生命周期动作持久化可供 Local App 查询的状态和 applicability 快照，Local App inspect 不再触发重新观察。

## Impact

- 影响 Product Buildr 的 Task Development、Task Review、Task Verification、Task Finish projection、Workspace SQLite repository、Local App HTTP API 和任务详情前端。
- 需要更新 SQLite current-record schema 或现有 current record payload、生命周期 writer、read model contract、Local App 集成测试和性能回归测试。
- 这是 Local App 状态语义变化：从“读取时实时复核”改为“最近一次生命周期动作确认状态”；现有 API 路径保持兼容，返回结构中的状态来源和观察时间需要明确。
