## Why

当前 `task-finish` 已将提交、集成和普通推送列为常规收尾，但授权文字仍可被理解为需要用户再逐项确认。用户明确说“收尾”时，这种重复询问阻断已请求的交付。

## What Changes

- 明确“收尾”及等价的本轮交付请求会触发 `task-finish`，并授权当前任务范围内的常规提交、集成和普通推送。
- 统一随包规则、技能说明和 Git 能力契约对该授权的解释；每次写入仍核验对象、范围、目标和实际效果。
- 冲突取舍、强推、共享历史改写、远端删除、丢弃内容及发布等额外副作用仍需独立授权。此变更不含破坏性兼容变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `direct-git-closeout`：明确收尾指令的常规 Git 授权与越界停止条件。

## Impact

影响随包 `AGENTS.md`、`task-finish`、`git-operations`、相关能力契约和契约测试；不改变 Git CLI 或任务记录数据结构。
