## Why

对话入口当前只显示活动总数，无法区分正在执行和需要用户关注的对话；用户必须逐条寻找待回应或尚未查看的内容。本次在既有入口内补齐分类提醒，减少遗漏，不改变对话执行与查看事实。

## What Changes

- 保留列表图标及活动总数，在同一入口内增加静态“需关注”角标；需关注包括待处理、待查看与状态待确认，不把执行中等同于需要用户操作。
- 悬停浮窗与完整对话列表增加共享的分类数量及筛选，直接定位准确工作空间（Workspace）的对话；不更改现有分组及最新消息排序。
- 全部数量从完整范围汇总，不由浏览器已加载的一页推算；失败保留旧观察并明确过期，不显示假零。
- 兼容既有模型与智能体（Agent）执行统计、双入口切换及准确查看确认，不新增持久待办状态或自动动作。
- 不含破坏性变更。新增列表汇总字段及分类筛选参数保持可选，旧调用方继续工作。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`：扩展对话入口提醒与共享总览，定义活动分类、需关注汇总及筛选行为。

## Impact

- `services/buildr-web/src/features/agent-conversations/`：复用 `ConversationActivityEntry`、状态展示、上下文（Context）与既有列表/执行统计。
- `services/buildr-agent/src/persistence/conversation-repository.ts`、应用层及 `operation-schemas.ts`：完整范围分类汇总、筛选和分页，保持公开契约（Contract）一致；宿主调用链按公开操作透传。
- 相关前端单元测试（Unit Test）、对话列表集成测试（Integration Test）和浏览器检查。
- 实施后需校准 `knowledge/docs/architecture/agent-integration.md` 中“列表图标静态数字代表全部活动”的说明；本阶段不将候选行为写成当前事实。
- 同一任务中的 Codex 快速模式（Fast Mode）先完成只读诊断，依据见 `design.md`；用户后续授权的接入修复沿用既有 `model-usage-controls` 规范，不扩大本提醒变更的规范范围，不调用付费模型或修改账号配置。
