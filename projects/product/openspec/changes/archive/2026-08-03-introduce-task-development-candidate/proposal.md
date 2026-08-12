## Why

P0.4 已把 Review 与 Verification Result 收敛为各自 Application 的 current facts，但当前 Task Finish 仍同时收敛 Change、冻结 Candidate、执行 Verification 与决定交付，导致 Development authority 缺位，也让 Verification 错误绑定 Candidate 而不是稳定 Content Target。现在需要补齐 P0.5，使内容开发、正式验证、候选冻结、完成审查和交付 handoff 形成可证明且无循环的权威链路。

## What Changes

- 新增 Task Development Application、关闭的 Development Receipt、Content Target、Task Candidate/generation、风险决策与 Finish handoff；不新增公开 Development CLI 或 Local App 投影。
- **BREAKING** Task Verification Result 改为只绑定稳定 Content Target 与 declaration identities；Verification 不再接收或拥有 Candidate identity。
- **BREAKING** Task Finish 收窄为 Development handoff consumer：只允许准备内容等价的 delivery carrier、交付、retained runtime 更新与 Environment cleanup，不再收敛 Change、改变内容、执行正式 Verification、冻结 Candidate 或发起 Completion Review。
- 通过 Task Review Application 保持 Planning Review 绑定 planning target、Completion Review 绑定 Candidate；Development 只消费 Review/Verification Application read model，不读取其 stores。
- 同步 Buildr Skill/capability contract、产品文档、术语与旧 P0.5/P0.8 路由，删除旧 writer、旧 schema 与旧语义，不保留双轨兼容。
- 增加纯逻辑、Application/repository、跨 sibling records/registry/Application 集成和完整生命周期 System 覆盖，并用无 OpenSpec 的非 Product/Service fixture 证明通用 Workspace 能力。

## Capabilities

### New Capabilities

- `task-development`: 定义 Development Application、Receipt、Content Target、Candidate/generation、决策、失效、Completion Review 与 Finish handoff 的唯一 authority。

### Modified Capabilities

- `task-verification`: 将 formal Verification 的 target 从 Candidate 改为稳定 Content Target，并保持 Result 的最小事实边界。
- `task-finish-execution`: 将 Finish 从候选准备与验证执行器收窄为 handoff 与内容等价 carrier 的交付 adapter。
- `agent-task-workflows`: 调整内置 Skills、capability contracts 与生命周期路由，使 Development 成为 Candidate 与 handoff 的唯一所有者。

## Impact

- 影响 Task Development 新领域/Application/repository/Skill/contract、Task Verification 语义、Task Finish Application/executor、运行时注册、静态门禁与测试。
- 影响 Product current specs、Roadmap、术语表、验证 ownership 与公开文档；不增加数据库、事件总线、状态机、历史/revision/CAS/锁或新测试框架。
- 现有 Task Record、Task Environment、Task Review、Task Verification persistence authority 保持独立；本 Change 需要一次性迁移所有消费者并删除旧 Finish/Candidate 路由。
