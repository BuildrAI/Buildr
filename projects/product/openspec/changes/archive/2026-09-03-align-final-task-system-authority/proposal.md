## Why

任务系统运行时已经以 `src/task/module.ts` 作为唯一模块入口，并已删除 Task internal workflow、统一 Task Environment 和独立 Task Overview，但 `product-source-layout` 与技术架构当前认知仍保留相反描述。这会让 Agent 按错误权威继续工作，也使父任务无法基于一致的当前事实完成验收。

## What Changes

- 将 Task Record 纵向切片和 Bootstrap 组装入口改为真实的 `src/task/module.ts`。
- 允许已迁移模块依据自身唯一人工源码使用 `module.ts` 或 `module.mjs`，不强制虚假的统一扩展名。
- 将仍存在 Task internal workflow route 的正向场景改为明确退役反例，旧入口不得保留兼容转发。
- 更新技术架构当前认知，改为 Buildr Web 直接展示 Task Record，并按需独立读取 Review、Verification 与父任务协调。
- 不改变运行代码、接口、SQLite、任务状态或已归档历史。
- 本次不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-source-layout`：让模块入口、Task 组装与已退役 internal workflow 的要求对齐当前 TypeScript 实现。

## Impact

- Canonical spec：`openspec/specs/product-source-layout/spec.md`
- Current knowledge：`openspec/knowledge/architecture/technical.md`
- 验证：OpenSpec strict、contract candidate audit、文档质量与受影响范围验证
- 不影响 CLI、HTTP、Buildr Web、数据库、依赖和运行时行为
