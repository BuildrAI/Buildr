## Why

Buildr 已经具备 Fast、affected、focus 与 Candidate 分层，但日常开发的重型验证仍有几个聚合 owner：普通 Integration 混合声明、OpenSpec、验证编排、Runtime、发布、数据存储与 Task 生命周期；Verification System 混合 planner、公共 JSON 和 OpenSpec；Workspace System 混合 Project/Service、Task read model 与 Worktree；Task Finish 又把公共 CLI 与完整交付 Journey 绑定在一起。结果是小范围实现变化会启动无关文件和长生命周期，日常反馈成本仍明显高于实际风险。

任务二在同一冻结目标上只执行一次正式验证并全部通过，同时产生 13 条预算 warning。这些 warning 是本任务需要探查的性能信号：其中聚合 owner 超时可帮助定位拆分边界，单一完整生命周期超时用于校准预算；它们不是本变更的范围或成功标准。

本变更不包含破坏性变更；Fast、Changed、Focus、Candidate、Project capability ID 与正式 Verification Result 语义保持兼容。

## What Changes

- 将普通 Integration 按 Task、声明、OpenSpec、验证编排、Runtime、发布与数据存储等直接领域组织为互斥 primary owners；保留小型通用技术边界 owner，不再让领域源码变化启动全部 general 文件。
- 将 Verification System 分为 admission/planner、公共 JSON、OpenSpec audit 和剩余编排契约；将 Workspace System 分为 Project/Service/Workspace catalog、Task lifecycle 与真实 Worktree lifecycle；将 Task Finish System 分为公共 CLI 和完整产品交付 Journey。
- 为代表 changed paths 固化拆分前后的重型 owner 数量和调度成本，要求日常 affected plan 只选择直接领域 owner，并在重型 executor 启动前证明文件唯一归属与 Candidate/CI 完整覆盖。
- 对任务二 13 条 warning 逐项判断“拆分、保留并校准、由其他直接 owner 负责”三种处置；预算使用同一 tree focused 采样与 full-load observation 设置，不通过统一倍增掩盖长尾。
- Candidate 继续执行拆分前相同的 Integration/System 行为文件并集，每个文件恰好执行一次；Candidate CI 只扩充原 shard 的 owner identity，不改变 runner、phase、tarball、`Candidate gate` 或 branch protection。
- 更新验证所有权说明与 Buildr Service 当前认知，记录日常开发适用场景、性能基线和任务二 warning 的辅助结论。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: affected 重型验证必须按真实领域 ownership 选择最小可解释 DAG；聚合 owner 必须拆分，完整生命周期 owner 必须基于实测独立校准，同时保持 Candidate 覆盖、稳定 identity 和无重复执行。

## Impact

- 主要实现：`services/buildr/test/verification/registry.mjs`、`system-suites.mjs`、Integration/System runner registry 与对应 contract/planner tests。
- CI：Candidate shard 增加由统一 registry 声明的新 owner identity；现有平台、artifact dependency 与 gate 拓扑不变。
- 文档与知识：`docs/verification-ownership.md`、`openspec/knowledge/services/buildr.md`。
- 不修改 `verification.yml` capability、Browser/Release capability、生产 CLI/API、Workspace 数据或发布制品。
