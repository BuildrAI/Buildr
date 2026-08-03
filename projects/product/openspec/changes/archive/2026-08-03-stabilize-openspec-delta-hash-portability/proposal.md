## Why

当前 `deltaHash` 把 delta spec 的 checkout 绝对路径纳入哈希输入。同一 Change 即使内容完全相同，在不同干净 clone 或 task worktree 中也会产生不同 identity，并被错误地当作 delta 已变化，造成 receipt 和收敛计划无谓失效。

## What Changes

- 以排序后的逻辑 delta 文件路径和规范化内容计算 `deltaHash`，不再包含 checkout 绝对路径或其他本机位置。
- 保留绝对源路径仅用于当前进程读取文件，不把它作为 portable delta identity 的一部分。
- 覆盖跨 checkout 相同 delta 产生相同哈希，以及逻辑路径或内容变化产生不同哈希的回归测试。
- 不改变 CLI 参数或输出结构；已有旧哈希的历史 receipt 按既有 delta 不匹配路径安全重新规划，不被误判为可复用。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `openspec-contract-guard`: OpenSpec delta identity 必须独立于本机 checkout 绝对路径。

## Impact

- 受影响实现：`services/buildr/src/application/domains/openspec.mjs` 的 delta parser。
- 受影响验证：OpenSpec contract/domain 集成测试。
- 不涉及测试性能、CLI 参数、canonical spec 同步算法或新的兼容迁移协议。
