# 收敛任务系统最终权威残留

## 一句话摘要

让任务系统的源码布局规范和技术架构说明与已经交付的 TypeScript 模块及退役边界完全一致。

## 背景与问题

任务系统运行时已经删除统一 Task Environment、独立 Task Overview 与 Task internal workflow，并以 `src/task/module.ts` 作为唯一 Task 模块入口。当前 `product-source-layout` 和技术架构说明仍保存旧入口及旧组合关系，可能误导 Agent，且无法通过 canonical spec 变化审计。

## 目标与非目标

目标是通过标准 OpenSpec Change 修正 `product-source-layout`，并同步技术架构当前认知。非目标是修改运行行为、数据库、接口、Buildr Web、Task Triage、其他 Skill 或历史材料。

## 受影响角色

- Agent：读取到与当前实现一致的模块入口和任务能力边界。
- Buildr 维护者：canonical spec 变化具有可追溯的 Change delta。

## 核心流程

Agent 读取当前 Task 模块和退役规范，使用本 Change 通过 strict validation、语义 preflight 与 convergence 更新 canonical spec；技术架构同步描述 Task Record 和独立专业读取关系。

## 关键变化

- Task 模块入口由旧 `src/task/module.mjs` 更正为真实 `src/task/module.ts`。
- 模块 descriptor 允许按唯一人工源码使用 `.ts` 或 `.mjs`。
- 把仍存在 Task internal workflow 的正向场景改为入口不存在的退役反例。
- 技术架构不再描述 Environment Application 或聚合 Task Overview。

## 影响、风险与兼容性

没有运行时、接口、数据或兼容性变化。历史 migration、legacy fixture 和归档 Change 保持不变。

## 验收摘要

Change strict validation、语义 preflight、canonical convergence、84 项全量 OpenSpec strict、文档质量和受影响验证全部通过，且运行代码无变化。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [Delta Spec](specs/product-source-layout/spec.md)
