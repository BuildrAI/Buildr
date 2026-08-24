## Context

当前系统已经有三类事实，但公开表达没有对齐：registry step 的 `executionBoundary` 表达证据边界，ownership/planner 表达 affected/full 选择，profile 和 workflow 表达日常源码、候选制品或发布结果。`verification.yml` 同时出现 affected、core Full 和 Candidate，package scripts 只提供 `test:core`，文档又把 Quick、Core、Candidate 与 Release并列，导致用户把内部执行集合误认为第四个验证维度。

现有安全边界必须保留：`verification.yml` 是公共 capability 声明，ownership 是 changed path 到 primary owner 的 authority，registry 是 step/依赖/profile/resource/budget authority，planner 只消费这些事实；Candidate generation、唯一 tarball 与 Release workflow 继续拥有发布链路。

## Goals / Non-Goals

**Goals:**

- 用户只需回答“用什么证据、选择多少、验证哪个对象/支持哪个决定”。
- 普通 Task Delivery 默认 affected，Full 升级的 authority 与 reason code 可解释且 fail closed。
- daily-full、Product Artifact Candidate 与 Published Release 的对象和新增证据明确分离。
- 保留现有公共入口兼容，并以契约反例证明不是只改文案。

**Non-Goals:**

- 不在本 Change 中调整 changed path → owner、依赖闭包或 owner membership。
- 不删除、迁移或降级 primary evidence，不以性能数字决定证据边界。
- 不重写 registry/planner，不创建第二套 profile registry 或 Test Context Runtime。
- 不改变 Task Candidate、Candidate generation、唯一 tarball 或 Release mutation authority。

## Decisions

1. **三个正交轴，不建立新的层级。** Static/Unit/Component/Integration/System 只描述执行边界；affected/full 只描述本次选择范围；Task Delivery、Product Artifact Candidate、Published Release 描述对象与决策节点。Quick 只是一种开发期成本约束。替代方案是继续扩充 profile/capability taxonomy，但会延续混合语义。
2. **公开使用 daily-full，内部保留 `core` identity。** 新的 `test:daily-full` 是公开完整日常证据入口，`product.full-regression` 调用它；`test:core`、`core` profile、既有 plan schema 和 timing identity 暂作兼容投射。替代方案是一次性重命名 profile、runner、schema 和历史 evidence，迁移面过大且会破坏 Execution Record 可比性。
3. **声明决策语义，registry 持有执行事实。** `verification.yml` 的标题、适用条件和 `proves` 说明对象、默认范围、决策、环境与副作用；step membership、依赖、资源、预算和 primary owner 仍只在 registry。契约测试从两者派生闭合关系，不复制 step 列表。
4. **Task Delivery 对象是 frozen Task Content。** 正式 Task lifecycle 可以继续维护内部 Task Candidate identity，但 Product 验证的用户模型称其内容对象为 Task Content Target；`Product Artifact Candidate` 专指 exact source 与唯一候选制品。两者通过文档和声明显式隔离，而不是重写 Task Development 模型。
5. **Candidate 与 Release 只增加节点专属证据。** Product Artifact Candidate 运行 complete daily evidence 加 artifact/package/install compatibility evidence；Published Release 复用 matching Candidate，只运行 publish、install/launcher smoke 与 registry/readback 等 Release-only evidence。普通 daily-full 不吸收这些 owner。
6. **反例以现有真实 planner/entrypoint 为准。** 契约必须证明局部输入仍为 affected、execution authority 输入仍以稳定 reason code 升级 full、daily-full 不含 Release-only owner、Candidate 仍含唯一 artifact 依赖、Release focus 不等于正式发布。不得 mock 被测选择算法。

## Risks / Trade-offs

- [兼容 `core` 名称仍被误认为公开维度] → 用户入口、声明、文档统一使用 daily-full，并明确 `core` 仅为兼容 identity；诊断保留映射说明。
- [声明复制 registry 事实] → 声明只写对象、选择和决策，不列 step membership、dependency、resource 或 budget 数字。
- [术语调整误改 Task lifecycle authority] → 保留 Task Candidate schema/identity，限定此次迁移为 Product verification 用户模型。
- [文案变化被误报为性能收益] → 本 Change 不声明墙钟改善；下一 Contribution 用 Execution Record 独立审计选择宽度与 owner 成本。

## Migration Plan

1. 先加入 `test:daily-full` 并让 `test:core` 兼容转发到同一 runner/profile。
2. 更新公开 capability 与契约，证明默认 affected、合法 full、daily-full、Candidate 和 Release-only 边界。
3. 同步规范、当前认知、术语与验证文档；保留旧命令并提供迁移说明。
4. 若兼容契约或覆盖闭合失败，回退公开入口与文档调整；registry membership 和发布 authority 不需要数据迁移。

## Open Questions

- `core` profile/schema identity 的最终移除时点由后续兼容数据决定，本 Change 不设截止日期。
- affected 是否仍频繁或过宽升级 full，由后续 `narrow-affected-and-full-selection` 使用近期 Task Execution Record 回答。
