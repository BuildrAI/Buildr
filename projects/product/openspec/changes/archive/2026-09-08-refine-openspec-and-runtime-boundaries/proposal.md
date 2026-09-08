## Why

当前 OpenSpec 注入 27 项资产内部方法，实际只用 5 项；`adapter-contract.ts` 又同时维护适配声明和文件执行。用户已确认在一个任务中收敛这两处边界，降低隐性依赖与执行安全逻辑的维护成本。本次不包含破坏性变更。

## What Changes

- OpenSpec 消费具名、带类型的五项资产支撑能力，不再注入完整内部方法集合；装配时校验方法可用性。
- 适配声明、选择和声明性计划保留在 `adapter-contract.ts`；文件校验、比较、写删与恢复移入独立执行文件，保持单向依赖。
- 同步生产、测试、验证器和代码地图中的真实消费者，不保留无用旧转发。
- 保持公开命令、HTTP、错误、只比较模式、写删顺序、文件内容与权限、冲突预检和既有恢复语义不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-assets-module-architecture`：明确 OpenSpec 窄依赖及适配声明、计划执行的独立职责与兼容保证。

## Impact

影响 `services/buildr/src/modules/{agent-assets,openspec}`、直接消费者、相关测试和现有代码地图。不改变依赖、构建入口、持久数据、前端页面或受支持的适配器（Adapter）集合。
