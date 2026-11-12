## Why

用户需要在 Buildr 中使用 Claude Code 的原生工具、会话和执行能力，同时选择已接入的共享模型。当前只有 Claude 规则与技能文件适配，没有内部执行器；仅运行一次 CLI 无法满足审批、停止、恢复及长对话可靠性。

## What Changes

- 增加独立管理的 Claude Code 原生程序与官方 Agent SDK 执行器，复用统一对话与控制契约。
- 接入共享模型网关，覆盖主对话、子智能体及辅助请求，明确非 Claude 模型属于 Buildr 维护的兼容路径。
- 对齐原生支持的流式工具、提问审批、追加、中断、后台工作、恢复、分叉、附件与上下文观察。
- 复用既有任务关联、交接、标题、通知与存储维护；不复制用户默认凭据，不提供未经许可的订阅登录，不静默回退模型。
- 新增兼容测试和诊断，不改变四个已有执行器的选择与历史。不含破坏性接口变更。

## Capabilities

### New Capabilities

- `claude-code-execution`: Claude 原生执行器、共享模型兼容、独立环境与准确执行控制。

### Modified Capabilities

无。沿用 `agent-runtime-connections`、`agent-conversations` 与 `unified-model-subscriptions` 的现有公共契约，新增执行方的具体要求。

## Impact

- `projects/product/services/buildr-agent/`：执行器、程序策略、网关适配、原生详情与测试；增加固定版本官方 SDK。
- `projects/product/services/buildr-web/`：既有智能体列表、名称与准备说明，不新增页面。
- `projects/product/services/buildr/`：随包依赖与使用指引。
- 不自动激活候选、不发布、不使用真实付费模型作隐式测试。
