# 全项目代码架构重构与迁移

一句话摘要：在不改变 Buildr 对外行为和数据语义的前提下，把两个 Service 的生产、工程和知识资产收敛到可定位、可验证的职责结构。

## 背景与问题

Buildr 已完成多轮纵向模块迁移，但后端业务能力仍分散在多个一级命名体系，`system/` 与 `package/` 含义含混；共享 runtime 方法注入、文件系统聚合、Agent Assets 大型应用、Doctor 业务归一化以及 Project Verification 命名使真实 owner 难以追踪。现有代码地图只覆盖局部 Workspace，历史分析材料不是当前事实。

## 目标与非目标

目标是完成两个 Service 及其工程、资源、规范和知识消费者的结构迁移，明确模块、技术层、主要对象、调用、数据与副作用，并保持公开 CLI、HTTP、JSON、SQLite、安装、Web 托管和安全恢复行为兼容。

本次不建设用户项目完整测试生命周期，不建设代码地图/当前态模型自动维护或技术图自动同步机制，不发布正式版本，也不完成父任务。

## 受影响角色

- 使用 CLI、Buildr Web 或 Agent runtime 的用户：入口和行为保持兼容。
- 维护 Buildr 的 Agent 与开发者：通过统一模块树、代码地图和技术图定位能力与副作用。
- 发布与验证维护者：生成、构建、测试、候选制品和 npm 文件清单随新路径迁移。

## 核心流程

Bootstrap 显式装配 Infrastructure、业务 Modules、Web Host 与 Diagnostics；业务入口经模块 contribution 调用 Application，Application 组合 Domain、Persistence 与技术 capability。代码地图从功能定位到模块、对象、代表方法和副作用；技术图展示服务、模块和关键数据/调用关系。

## 关键变化

- 后端生产源码统一为 `bootstrap/`、`modules/`、`web/`、`infrastructure/`。
- Task 与 Workspace 保留内部架构；OpenSpec、Agent Assets、Project Testing、Installation、Diagnostics、Publication 拥有独立准确 owner。
- `package/` 人工源码退出，DTO 工具迁入 `tools/codegen`，runtime 文件型资产迁入 `resources/runtime`。
- 前端剩余页面按 Publication、Installation、Task 功能归位。
- 全项目代码地图、Archify 技术图、当前态架构与 Service 说明同步更新。

## 影响、风险与兼容

主要风险是大范围路径迁移遗漏消费者、静态类型通过但锁/事务/恢复行为退化，以及 npm 产物缺文件。通过精确消费者扫描、分切片测试、完整类型/行为/Browser/打包验证和远端交付回读控制。外部协议与数据不发生破坏性变化；内部旧路径在所有消费者迁移后直接删除。

## 验收摘要

最终 tree 中所有生产与主要工程职责可从地图定位；模块依赖无隐藏运行时目录、旧路径或重复 writer；适用类型、单元、组件、契约、集成、Browser、生成、构建与打包检查通过；知识和规范引用最终真实文件；Git 交付、任务登记、自举与清理分别有真实证据。

## 技术产物入口

- 设计与迁移清单：`design.md`
- 增量规格：`specs/`
- 实施清单：`tasks.md`
- 最终代码地图：`projects/product/knowledge/code-map/`
- 最终技术图：`projects/product/knowledge/archify/`
