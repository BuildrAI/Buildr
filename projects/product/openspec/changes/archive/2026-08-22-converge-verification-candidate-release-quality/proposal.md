## Why

前序治理 Contribution 已经改变了 Task、Environment、Development、Finish、Workspace 和 UI 的公共结果，但部分低成本契约测试仍主要读取 Skill 原文并断言固定措辞或章节顺序。这类测试会在行为不变的文档重写中误报，同时不能证明自动路径、Agent 直接路径、CI/PR 与对账路径最终是否遵守同一结果不变量。

当前 Candidate 与 Release 已具备唯一 tarball、去重 DAG、并行 shard、aggregate gate 和正式发布 readback；现在需要把最后一轮质量收敛放在证据 owner、跨路径结果与失败隔离上，并明确开发反馈、冻结 Candidate 和正式发布各自只承担一次必要成本。本次不包含破坏性变更。

## What Changes

- 将治理契约测试从固定 Skill 措辞、篇幅和流程顺序断言，收敛为 machine-readable contract、Application 结果、公共 JSON、真实 effects 与 failure isolation 断言。
- 建立前序治理 Contribution 的跨模块不变量矩阵，覆盖直接工作不被 Formal Task/Environment 扩大阻断、Delivery/Activation/Cleanup/Diagnostics 正交、Development evidence current identity、局部 Doctor/Capability failure 隔离以及 Parent/UI 只读投影。
- 为 changed/focused、完整 Product Candidate 与 Release workflow 增加拓扑自检：开发阶段不隐式升级为完整 Candidate；同一冻结 Candidate 只生成并消费一个 tarball；publish 只验证并发布该制品，不重跑完整 Candidate。
- 删除已被行为测试或 machine-readable contract 覆盖的固定流程措辞断言，保留真正保护 authority、authorization、identity、不可逆副作用和公开发布 readback 的门禁。
- 不增加 legacy Parent correction 测试或兼容承诺，不削减 Candidate/Release required gates，也不复用 identity 不匹配的旧 evidence。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 增加结果不变量优先的治理测试契约、跨路径一致性/局部失败隔离矩阵，以及开发反馈、完整 Candidate 与正式 Release 不重复承担同一主证据的要求。

## Impact

- 影响 Product verification registry、changed/focus/Candidate plan tests、Candidate CI/release workflow contract tests和少量治理 contract/integration tests。
- 影响 `product-verification-quality` canonical spec、Buildr Service current knowledge 与本 Change Brief。
- 不改变公开 CLI/API schema、Task lifecycle schema、npm package内容、发布权限、tag/OIDC/npm integrity 或公开 readback 要求。
