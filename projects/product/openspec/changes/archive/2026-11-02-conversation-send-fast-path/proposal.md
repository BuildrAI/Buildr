## Why
日常对话先预览再提交，交接资料超限还会等待辅助模型摘要，导致用户点击发送后卡顿。已有原始记录和分轮索引足以支持交接，摘要不应成为发送前置依赖。

## What Changes
- 普通消息允许一次提交，保留显式预览及旧预览令牌校验，不作破坏性接口删除。
- 可复用原生上下文且无待补历史时走轻量路径。
- 自动摘要退出发送与预览路径；超限直接使用完整来源索引，不新增后台摘要调度。
- 消除同次提交重复准备，普通发送不显示资料精简提示。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `agent-conversations`: 发送准入与超限交接采用非摘要阻塞路径。

## Impact
Agent Service 发送契约、宿主 HTTP 校验、Web 提交及回归场景。保留权限、身份、版本、附件容量、幂等与未知结果保护。相关知识为 `knowledge/docs/architecture/agent-integration.md`。
