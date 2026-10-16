## Why

Codex 独立生成的专用进程目前完全空闲 30 分钟就回收，用户希望间隔较长的连续工作仍可复用已启动实例。本次将 Codex 的默认空闲时限延长至 1 小时，减少重复启动；不包含破坏性变更。

## What Changes

- Codex 专用进程完全空闲 1 小时后回收。
- DSH 连接继续完全空闲 30 分钟后释放；排队、执行和查询的现有计时语义保持。
- 更新接入详情与相关说明，并用可控时钟验证两个提供者（Provider）的生产默认回收边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-operations`：专用实例复用与回收按 Codex 1 小时、DSH 30 分钟分别约束。

## Impact

影响 `services/buildr/src/modules/agent-operations/application/agent-operations-application.ts`、相应集成测试（Integration Test）、`services/buildr-web/src/features/agents/components/AgentConnectionDetails.tsx`、浏览器检查与 `knowledge/docs/architecture/agent-integration.md` 的时限说明。无需改变公开接口（API）、登记数据或依赖，也不执行真实模型调用或业务仓库写入。
