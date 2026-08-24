## Why

同一天归档的多个 Change 会按 archive entry 字典序回放。兼容修正 `adapt-*` 排在原始 `isolate-*` 之前，使正式 contract audit 最终回放到旧的失败式门禁语义。需要一个排序在后的窄 delta 重申已确认最终契约。

## What Changes

- 以最终 canonical Requirement 的完整内容重申候选 self-sync projection-only 兼容语义。
- 不改变实现、CLI、Task Environment 或任何运行时行为。
- 让 archived delta replay 的最终结果与 canonical spec 确定一致。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-first-runtime-projection`: 重申已交付的最终 Requirement，使同日 archive replay 保持确定顺序。

## Impact

- 仅影响 OpenSpec archive replay provenance。
- 不包含破坏性变化，不新增代码或测试行为。
