## Why

真实浏览器采样显示首页传输约 4 MB 未压缩资源，活动/提醒每 5 秒重复传输约 20 KB，代码状态存在初始化重复读取及秒级耗时。现在需要减少重复 I/O 与传输并保留及时、可信的状态观察。

## What Changes

- 哈希静态资源支持压缩协商及长期缓存；含会话的 HTML 和业务 JSON 保持禁止共享缓存。
- 新增带内容版本的轻量活动与提醒联合摘要，旧接口保持兼容，5 秒观察窗口不放宽。
- 合并目录在途请求，减少代码观察初始化重复扫描。
- 增加请求处理时长证据并针对已定位同步 I/O 降低尾延迟。
- 不包含破坏性变更，不发布或更新共享运行实例。

## Capabilities

### New Capabilities

- `web-read-efficiency`: 静态传输协商、轻量联合状态观察及有界重复读取。

### Modified Capabilities

无；既有接口与状态语义保留。

## Impact

涉及 buildr HTTP 托管、agent-service HTTP 契约、buildr-agent 公开 schema 与 buildr-web 读取装配；不引入依赖，不修改持久对话或权限语义。使用隔离实例及真实协议回归验证。
