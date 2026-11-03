## Why

对话预热（warm preparation）用一张固定 8 个槽位的内存表提前拉起运行时，其生命周期无法自洽：

- 占用由「打开已完成的对话」或「改模型」触发，200 毫秒后即占位，不需要真的发消息；
- 释放只靠「在该对话真的发出消息」或 30 分钟空闲过期；离开对话不释放，只有 Qoder 有取消补偿；
- 表满后任何新的预热直接失败，既不淘汰也不降级，对外表现为 HTTP 500 `agent_process_operation_failed`；
- 该失败被前端静默忽略，也不写入日志，只能在网络面板发现。

结果是半小时内翻看 8 个已完成对话就会写满，且要等最老的一条过期或整体重启才能恢复。用户决定整体移除这套机制，以后需要时重新设计。

## What Changes

- **BREAKING**：删除 `warmup` HTTP 端点（草稿与对话两条），以及对应的请求/响应契约、schema 与 operation 声明。
- 删除预热表本身：容量上限、槽位键、准备/接管/丢弃，以及 `prepared-resource` 运行状态与升级前排空预热的分支。
- 删除前端在选择变化后的预热调用与 Qoder 丢弃补偿。
- 删除 Qoder 空闲实例保留（`QODER_IDLE_REUSE_MS` 与 `setQoderIdleRetention`）：运行时只在执行期间持有，常规空闲释放机制保留。
- 发送路径回到「发出时准备运行时」：草稿发送与既有对话发送都直接拉起运行时。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-conversations`: 移除「Qoder预热必须跟随当前选择并有界回收」承诺，包括提前准备、按选择取消、1 分钟回收与 5 分钟追问复用；发送 MUST 直接准备运行时。

## Impact

- 实现：`buildr-agent` 的会话应用、服务装配、契约与 schema、进程服务；`buildr` 的智能体服务 HTTP 与契约；`buildr-web` 的对话面板与对话 API。
- 测试：删除预热单元与集成用例；调整 HTTP 集成测试与浏览器场景中依赖预热的断言。
- 兼容：唯一调用方是 Buildr 自身；移除端点后旧的 `warmup` 请求得到 404。已存在的未使用准备只存在于内存，随进程重启清除，无数据迁移。
