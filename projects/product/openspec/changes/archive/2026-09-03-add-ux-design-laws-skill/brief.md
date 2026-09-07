# 新增用户体验设计法则内置技能

## 一句话摘要

Buildr 新增一个可选内置技能，帮助 Agent 基于真实用户任务和界面证据运用 30 个用户体验心理学主题完成设计、审查和方案权衡。

## 背景与问题

当前 Buildr 的 `ui-prototype` 能在用户明确确认后生成和验证完整页面原型，但产品没有提供形成用户体验设计判断的专门方法。通用 Agent 容易把心理学法则当作清单机械套用，也可能忽略法则冲突、真实证据、无障碍和非操纵性边界。

## 目标与非目标

目标是发布 `ux-design-laws` 可选内置技能，以渐进披露方式覆盖 Laws of UX 当前 30 个主题，并产出有证据、影响、设计动作、权衡和验证方法的建议。非目标包括自动生成原型、修改前端代码、建立 capability contract、替代用户研究或镜像第三方网站内容。

## 受影响用户或角色

- 使用 Buildr 设计或审查界面与交互的产品人员、设计师和研发人员。
- 需要把具体页面问题转成可验证设计建议的 Agent。

## 核心流程

Agent 先读取真实界面和任务上下文，再从法则索引选择一至两个相关分组，读取少量会改变判断的法则卡，最后按优先级给出证据、影响、建议、权衡和验证方法。用户只要求分析时流程在建议结束；原型或实现需要另行明确要求。

## 关键变化

- 增加 `ux-design-laws` 的 `SKILL.md`、Agent 元数据、法则索引和五个主题分组。
- 在 package manifest 中登记为无 capability contract 的 optional builtin，并映射完整目录到 Workspace source。
- 增加专项契约测试，验证 30 个主题、渐进披露、来源边界和与 `ui-prototype` 的职责分离。

## 影响、风险与兼容性

变化只增加可选内置资产，不改变现有 binding、CLI、数据和 `ui-prototype` 行为。主要风险是机械套用心理学法则、与原型能力触发重叠及第三方许可误用；通过真实证据、明确优先级、非操纵性约束、独立原创法则卡和来源链接控制。

## 验收摘要

- package manifest、Workspace mapping 与 Skill frontmatter description 一致。
- 30 个主题各有中文/英文名称、操作性卡片和官方来源。
- Agent 按问题读取少量相关分组，并在缺少证据时标记待验证。
- 分析请求不生成原型、不修改代码；安全、隐私和无障碍优先于心理学启发。
- Skill 静态校验、专项契约测试、受影响产品验证和 OpenSpec strict/preflight 通过。

## 技术 Artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [产品 Agent Skills 增量规格](specs/product-agent-skills/spec.md)
- [Package 资产增量规格](specs/buildr-package-assets/spec.md)
- [Tasks](tasks.md)
