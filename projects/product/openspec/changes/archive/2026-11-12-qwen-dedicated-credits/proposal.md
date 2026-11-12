## Why

Qoder 与 Qoder CN 的 `/usage` 会在 `dedicatedResourcePackages` 中返回只在特定模型系列内抵扣的专属积分（当前账号为 Qwen 2000 credits）。现有额度观察忽略该字段，账号卡片和额度概览看不到这部分真实权益，用户需要到官网才能确认。补齐这一表达不改变账号级耗尽判断，属于可观察额度事实的补全。

## What Changes

- 额度观察读取 `dedicatedResourcePackages`，为每个可用资源包生成独立额度窗口，展示专属积分名称、剩余与总量 credits 及到期时间。
- 名称优先取 `displayLabels` 中 `dimension: title` 的 `valueI18n['zh-CN']`，其次 `value`，都缺失时回退“千问专属积分”；`description` 不进入窗口。
- 窗口标识包含资源包 `id`，多笔专属包互不覆盖；`resetsAt` 取资源包 `expiresAt`。
- 专属积分不纳入账号级通用额度聚合与耗尽判断，`remainingPercent` 语义保持不变；规范中写明该边界。
- 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `model-usage-controls`: Qoder 套餐与资源包表达的要求扩展为同时解析并独立展示 `dedicatedResourcePackages`。

## Impact

- `projects/product/services/buildr-agent/src/model-access/providers/qoder.ts`：额度观察与窗口构造。
- `projects/product/services/buildr-agent/test/unit/model-providers.test.ts`：专属资源包解析、过滤与回退用例。
- `projects/product/knowledge/docs/architecture/agent-integration.md`：补充专属积分表达事实。
- Buildr Web 无需改动，现有账号卡片与额度概览按 `windows` 通用渲染。
