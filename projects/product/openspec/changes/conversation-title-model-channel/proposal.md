## Why

对话智能标题当前依赖有状态、跨厂商的会话内摘要链路：Qoder 原生复用工作会话的 `generate_session_title`，长工具轮次或事件循环停顿会超时；Qoder-CN 原生在没有网关租约时直接返回 `agent_title_unavailable`。同一对话已经出现早期超时、完成后重试失败、最终被写成「生成标题错误，请手动修改」的连续失败。一个只应请求一次模型的能力不应有如此高的失败率，需要改为独立、可预期的模型通道，并接受确定性兜底标题。

## What Changes

- 用户输入被受理后，立即用首条用户消息生成确定性兜底标题；兜底标题明确标记来源，不冒充智能摘要。
- 智能标题改为独立、无工具、有界的模型请求，不依赖工作原生会话：Qoder 与 Qoder-CN 原生账号通过既有原生模型 `/chat` 通道生成；Qoder-CN 网关租约路径保留。
- 只在首个轮次成功完成后自动尝试一次（约 10 秒、128 tokens）；失败保留兜底标题并记录可解释状态，不再把标题改成「生成标题错误，请手动修改」。
- 删除早期会话绑定尝试、按参与者尝试记账、服务重启后的标题扫描以及失败提醒标题。
- 保留用户显式「生成简短标题」入口与手动改名优先。
- **BREAKING**（行为契约）：移除规范强制要求的早期/完成两阶段尝试、按参与者预算、重启保持尝试状态和失败提醒标题；旧记录中的相关字段忽略且不迁移。

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-conversations`: 自动标题的触发时机、生成通道、失败表现与状态语义改变；中性标题的状态说明随之调整。

## Impact

- `services/buildr-agent`：对话标题流程、Qoder 与 Qoder-CN 执行器标题实现、Qoder 原生模型适配器复用、对话持久化字段与测试。
- `services/buildr-web`：标题状态标签与失败文案。
- `openspec/specs/agent-conversations`：两个标题 Requirement 的增量变更。
