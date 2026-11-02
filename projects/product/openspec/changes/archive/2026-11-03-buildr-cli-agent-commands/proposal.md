## Why
本机智能体需要可组合的命令行入口列出、发送、读取、正式回复、继续和停止已有 Agent service 对话，而无需另建执行引擎。

## What Changes
- 新增 `agent send/read/stop/list/reply/continue` 六个命令，封装现有 HTTP 对话接口。
- 复用本机实例发现、会话认证和执行版本保护，不写任务数据。

## Capabilities
### New Capabilities
- `agent-cli`: 本机对话命令行客户端。
### Modified Capabilities
无。

## Impact
涉及 Buildr CLI 注册、Agent service 客户端、CLI 使用文档与测试；不改变服务端 API、不引入依赖。
