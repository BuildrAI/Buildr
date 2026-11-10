## Why
本机外部工具需要直接调用已有 Agent Service，不应读取网页会话认证或等待 CLI 全覆盖。现有 Application、对话和版本边界可复用，本期增加正式程序接入，无破坏性变更。
## What Changes
- 独立 Bearer 凭据，网页管理创建/元信息/撤销，限制工作空间和操作权限。
- 固定程序入口提供发现、公共对话操作及 HTTP 帮助/OpenAPI/示例。
- 复用已有草稿提交幂等、观察、问题回复和停止，不开放账号/升级管理。
- 测试拒绝、去重及恢复；保留任务预览供 GrokBot 联调，不提交或推送。
## Capabilities
### New Capabilities
- `programmatic-agent-access`: 本机程序凭据、发现、公共对话契约与使用文档。
### Modified Capabilities
无。现有网页认证及原接口保持不变。
## Impact
buildr 的 agent-service 模块、HTTP contribution 与测试；buildr-web 的智能体设置局部入口。无新增依赖、不拆独立服务、不改开发执行业务规则。任务说明见 [任务说明](@task/programmatic-agent-api)。
