# 产品化并采用 Node Test Context Runtime

## 一句话摘要

把已验证的 Node Test Context Runtime 收敛为具有 TypeScript 权威、标准 ESM、可发布类型和完整 owner 接入模型的公共组件，并用真实重型 owner 迁移继续降低 Buildr 核心 Full 成本。

## 背景与问题

Buildr 已实现 runner-independent Context、持久 Worker Host、immutable seed Pool 和首个 Task Application 接入，但公共实现仍是未纳入 strict TypeScript 的 `.mjs`，正式 Candidate tarball没有闭合的runtime/types facade，大多数 eligible owner仍重复创建Application、SQLite、Git或Workspace环境。此前多轮局部优化没有阻止整体测试随产品增长持续变慢，说明需要稳定组件和强制接入决策，而不是继续添加一次性fixture技巧。

## 目标与非目标

目标是发布标准JavaScript与类型声明、让全部owner具有可审计Context disposition、迁移所有当前eligible重型owner、保留黄金生命周期，并以同tree多轮证据判断180秒目标。非目标是引入Vitest、替换`node:test`、共享可变Workspace/数据库/Git状态，或创建第二套registry/Candidate/Release流程。

## 受影响用户或角色

- Buildr维护者：新增测试时按统一决策树注册Context、资源和primary owner。
- Node.js库消费者：通过`@buildr-ai/buildr/test-context`获得标准ESM和strict TypeScript类型。
- Agent：从registry disposition、计划成本和Execution Record理解为何某owner复用或保留完整生命周期。

## 核心流程

TypeScript authority生成并检查ESM/`.d.ts`；registry为每个owner绑定`context-runtime|hybrid|full-lifecycle`；Context-aware Host按outer grant执行文件，Runtime缓存Application state，Buildr provider从immutable seed物化逐case sandbox并在release检测污染；focused/Core/Candidate验证同时核对成本、覆盖和黄金证据。

## 关键变化

- 新增独立Test Context编译、声明和drift-check pipeline。
- 正式npm Candidate发布公共facade、ESM与`.d.ts`，不发布raw Runtime TS或Buildr test-only适配层。
- 建立全部owner disposition authority并迁移eligible Task/Workspace重型owner。
- 扩充逐owner Context/Pool timing与完整验证框架文档。

## 影响、风险与兼容性

公共JS API保持兼容，类型声明是新增能力。主要风险是共享Application污染、Context exclusive等待抵消并行收益、生成物漂移以及seed跳过待证明初始化；分别以dirty eviction、outer多Host/逐owner timing、确定性drift check和黄金owner禁用缓存控制。

## 验收摘要

真实JavaScript与TypeScript consumer从package facade工作；全部registry owner分类闭合；eligible owner不再在matching case重复组装环境；Core/Candidate/Release覆盖不退化。最终三轮52-step Core均通过，中位数267.561秒、极差3.240秒，相对中途阶段中位数320.687秒下降约16.6%；Core/affected竞争也全部通过并把同资源等待显式记录为29.529秒。当前计划的数学容量下限为244秒，因此180秒目标在不调整范围或工作量前不可达。完整架构文档已记录公共API、owner接入、证据字段、限制与后续优化边界。

## 技术artifacts入口

- `proposal.md`
- `design.md`
- `specs/node-test-context-runtime/spec.md`
- `specs/product-verification-quality/spec.md`
- `specs/buildr-service-typescript-execution/spec.md`
- `specs/cli-modular-architecture/spec.md`
- `specs/npm-cli-package/spec.md`
- `tasks.md`
