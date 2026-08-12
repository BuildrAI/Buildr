## Why

Local App 的研发、审查和验证页签当前通过终态交付聚合器重新读取 Development、Review 和 Verification，再根据 Development handoff 动态推导“本次交付采用了哪些证据”。这让普通 GET 重复读取多个专业节点，也把 Finish 已确认的交付事实重新变成读取时的计算。

现在需要让 Finish 在完成交付时持久化实际采用的关联，令 Local App 只展示最近一次正式交付已确认的事实，为后续三个页签直接读取移除依赖。

## What Changes

- 新增终态交付关联（Terminal Delivery Associations）read model：仅保存 Finish 已采用的 Development handoff、Planning/Completion Review 与 Verification 的最小关联事实和诊断。
- Task Finish 在 durable completion 形成后原子写入该关联；未完成、无变更完成和放弃任务保持明确但不伪造交付关联的状态。
- Local App 的终态交付投影优先读取已保存关联，不再在 GET 中以当前专业 Result 重新证明 handoff gate 是否匹配。
- 保持 Development、Review、Verification、Finish 各自的专业 authority；关联 read model 不复制 Result 正文、不重新决定 gate，也不改变 Candidate 或交付顺序。

## Capabilities

### New Capabilities

无。终态交付关联是既有 Task lifecycle current read model 的一个受限 section，不建立独立 capability 或第二 authority。

### Modified Capabilities

- `task-finish-execution`: Finish durable completion 必须持久化实际采用的 gate/handoff 关联。
- `task-lifecycle-read-model`: 生命周期投影必须保存、校验并读取终态交付关联，而不在读取时补算。
- `local-workspace-application`: Local App 终态读取必须展示已保存交付事实，不能以 GET 重新推导。

## Impact

影响 Workspace SQLite current read model、Task Finish completion writer、终态交付 Application、Local App HTTP task detail projection，以及相应 Unit、Integration/System 性能与无重复读取测试。
