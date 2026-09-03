## Context

任务系统最终收敛已经删除独立 Task Overview、统一 Task Environment 和 Task internal workflow，并将保留的 Task 核心人工源码迁为 TypeScript。运行时、测试和已归档 Change 都证明当前唯一入口是 `src/task/module.ts`，但一份 canonical spec 和技术架构当前认知仍保存旧描述。

本 Change 只让权威文本追上已经交付的事实。它不改变产品行为，也不为已删除能力建立兼容层。

## Goals / Non-Goals

**Goals:**

- 让 `product-source-layout` 准确约束 Task 的 TypeScript 模块入口。
- 删除仍存在 Task internal workflow route 的正向规范要求。
- 让技术架构准确描述 Task Record 与独立专业读取关系。
- 通过标准 OpenSpec convergence 形成可审计的 canonical spec 变化来源。

**Non-Goals:**

- 不修改 Task Triage 或其他 Skill 行为。
- 不修改运行代码、CLI、HTTP、SQLite、Buildr Web 或发布流程。
- 不恢复 Task Overview、Task Environment 或 internal workflow。
- 不修改历史 migration、归档 Change 或 legacy fixture。

## Decisions

1. **使用一个 `product-source-layout` delta，而不是直接编辑 canonical spec。** 受影响范围验证要求 canonical spec 变化具有 matching Change delta；使用既有 convergence 事务可以保持规范来源可追溯。
2. **模块入口允许 `module.ts` 或 `module.mjs`，但每个模块只有一份人工源码。** Buildr 正在渐进迁移 TypeScript，强制所有模块使用同一扩展名与真实源码不符；Task 则明确绑定已存在的 `src/task/module.ts`。
3. **把 internal workflow 的同名场景改为退役反例。** 完整修改必须保全既有 Scenario identity；旧请求只能返回入口不存在且零副作用，不保留兼容转发或改名后的替代入口。
4. **技术架构只表达当前读取关系。** Buildr Web 直接展示 Task Record，并按需读取 Review、Verification 与父任务协调，不重新命名聚合 Overview。

## Risks / Trade-offs

- [风险] 直接修改 canonical spec 会再次触发 contract candidate audit。→ 通过 `buildr openspec converge` 条件式同步和归档。
- [风险] 泛化模块扩展名可能弱化单一源码约束。→ 明确每个模块只有一个根模块人工源码，Task 仍精确要求 `module.ts`。
- [风险] 误改历史材料会丢失迁移证据。→ 只修改当前 spec 与 current knowledge，归档和 migration 保持不变。
