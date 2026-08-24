# 将 UI Preview 重构为可重载的界面原型能力

## 一句话摘要

Buildr 将 UI Preview 非兼容地统一为 UI Prototype，并要求已有原型在用户未明确忽略时默认约束后续页面与交互开发。

## 背景与问题

现有“界面预演稿”名称和非强制参考边界容易让 Agent 在生成 HTML 后仍另行设计正式页面，已经造成原型与实现脱节及重复返工。用户需要的是轻量、可交互、可由自定义 Skill 重载的界面原型，而不是第二套设计或进度系统。

## 目标与非目标

目标是统一采用 UI Prototype／界面原型，保留默认 Skill 基于真实界面生成一个或多个自包含 HTML、模拟数据与交互并浏览器验证的能力；Task 详情“原型”Tab 可查看多个页面；已有原型默认约束后续实现。

不兼容旧 Skill、标记、API 与旧产物；不新增 producer contract、Task 字段、数据库状态、固定目录或独立存储；不把原型变成 canonical spec、Planning Identity、Verification Result、正式设计稿或默认像素级验收。

## 受影响用户或角色

- 在正式前端开发前查看、确认界面原型的用户与设计师。
- 生成原型以及依据原型实施页面和交互的 Agent。
- 维护 Buildr Skill package、Local App read model 与 Buildr Web 的开发者。

## 核心流程

1. UI 相关任务询问用户是否需要原型；只有明确确认才调用 selected `ui-prototype`。
2. 默认 Skill 调查真实界面，按核心流程生成一个或多个带新标记的自包含 HTML，并逐页完成浏览器验证。
3. Buildr 从 Task 关联 Change 只读发现原型；“原型”Tab 列出多个页面并支持切换、交互和新窗口打开。
4. 后续 Agent 在用户未明确忽略时读取全部相关原型，按其信息架构、布局和交互开发；正式行为同时进入 design、delta specs、Brief 与 tasks。

## 关键变化

- `ui-preview`、`buildr:ui-preview`、`/ui-previews` 和“预演”全部替换为 prototype 对应名称。
- 默认 `ui-prototype` 仍是普通 optional builtin Skill，可通过现有同名 Skill 选择机制重载。
- 原型从“可选参考”变为“生成后默认实施输入”，但不成为持久化 gate 或规范 authority。
- 多原型页面成为生成、发现和 Web 查看两端的明确行为。

## 影响、风险与兼容性

这是明确的破坏性变更：旧原型标记、route 与产物不再发现或兼容。原型与正式 artifacts 冲突时以正式 authority 为准，先收敛 design/specs 再实施。安全隔离、Task-scoped 发现和无第二存储边界保持不变。

## 验收摘要

- package 只投射 `ui-prototype`，并保持无 capability contract、可同名重载。
- 默认 Skill 支持一个或多个完整 HTML、模拟交互、浏览器逐页验证，并写明已有原型默认约束开发。
- API 只识别新标记与 `/ui-prototypes`，旧 route/marker 不兼容。
- Task 详情显示“原型”，能列出、切换和新窗口打开多个原型页面。
- current specs、术语与 Service knowledge 全部使用新名称和边界。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/ui-prototype/spec.md`
- `specs/product-agent-skills/spec.md`
- `specs/local-app-web-client/spec.md`
- `tasks.md`
