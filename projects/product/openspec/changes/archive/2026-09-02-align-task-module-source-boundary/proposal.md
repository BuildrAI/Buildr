# 对齐Task模块源码边界

## Why

Task Development退役规范误把整个共享Task composition描述为已迁移TypeScript，与当前源码不符。仅改扩展名会掩盖真实类型边界。

## What Changes

- 保留唯一Task module装配责任。
- 明确本次直接重写的Overview、Repository和HTTP契约使用严格TypeScript；既有共享composition保持当前源码形态，后续只有真实类型迁移时再改。

## Capabilities

### Modified Capabilities

- `task-lifecycle-core-module-architecture`

## Impact

只修正规范，不改变运行行为。
