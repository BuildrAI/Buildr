## Why

Qoder支持会话复用，但外层在一轮完成后立即安排回收，连续追问重复启动。未使用预热反而保留30分钟并可累积。需要保留首次预热并纠正资源优先级，不将保留进程误报为已释放。无破坏性数据迁移。

## What Changes

- 仅Qoder已用实例在安全结束后保留5分钟，新输入续用并刷新窗口。
- 未使用Qoder预热保留1分钟、只保留最新选择，切走主动丢弃准确匹配条目。
- 升级、断开、关闭及明确交接不受保留窗口阻塞；活动或未知工具和问题仍保持原有安全边界。
- 不改Codex/DSH，不宣称未经实测的首字收益。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 增加Qoder有界空闲复用及未使用预热回收。

## Impact

影响Agent Service资源生命周期、Qoder预热、Web选择清理和相关契约/测试。普通发送用法不变，无需用户清缓存。
