## Why

同轮补充输入后，首项结论可能只出现在中途进展，最终答复只回应最后一项；处理过程折叠后，用户无法直接看到完整结果。需要明确最终汇总责任，补齐共享工作指引的缺口。

## What Changes

- 要求最终答复覆盖本轮全部已接收且仍有效的用户要求，简要保留各项结论和未完成事项，包括进展中已经回答的内容。
- 后续纠正、替代或取消按最新有效指示处理，普通补充不自动撤销原要求；如实保留已生效结果。
- 使用现有三家共用指引及接入机制，沿用消息记录与折叠行为。本次不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`：补充共享工作指引对同轮最终答复的覆盖与有效要求边界。

## Impact

实现位于 `services/buildr-agent/src/domain/interaction-policy.ts`，经既有 Codex、DSH、Qoder 接入投射。没有 API、数据结构、依赖或权限变化，也不增加总结调用或改写历史答复。
