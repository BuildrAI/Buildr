# 精炼 Buildr Core 基础契约

## 一句话摘要

把 Buildr Core 重写为职责清晰、可直接执行的基础行为契约，并为所有用户 Workspace 增加按需使用 Mermaid 的共性表达。

## 背景与问题

当前 Core 将责任、沟通、资产职责和硬边界分散在“产品哲学、规则边界、工作空间模型、工作空间硬边界”等章节中；部分句子重复、不可判定或接近 Agent 默认行为。权威规范已经要求 Core 提供简明表达和明确下一步，但随包模板与契约测试没有完整落实。

## 目标与非目标

目标是保留真正改变 Agent 行为的责任和安全边界，删除模糊内容，以四个用途明确的章节重组 Core，并补齐简明表达、专业术语强制中英文对照、下一步和 Mermaid 原则。非目标是增加任务流程、命令序列、生命周期说明、图表类型手册或 runtime adapter 行为。

## 受影响用户或角色

- 使用 Buildr 生成或同步 Workspace 的用户：获得一致、简洁且必要时可视化的 Agent 表达。
- 在 Workspace 中工作的 Agent：更容易区分责任、沟通方式、资产职责和不可绕过边界。
- Buildr 维护者：契约测试直接保护语义，不再依赖旧章节名称。

## 核心流程

Buildr 将新的 required Core 投射到用户 Workspace。Agent 先按直接、简练的方式说明事实；当输出环境支持且关系、时序、分支或状态转换用文字不易准确理解时使用 Mermaid，并在图后用一句话说明关键结论；简单线性内容继续使用文字或表格。

## 关键变化

- Core 改为“责任与治理、用户沟通、工作资产职责、不可绕过边界”。
- 删除“反复犯错”等不可判定句和重复的模型说明。
- 删除只在设计新硬门禁时触发的分支专用条目。
- 恢复简明表达与下一步引导，并要求专业术语每次都使用“中文（English Term）”或“中文释义（English Term）”。
- 新增按需 Mermaid 规则，不枚举图表类型。
- 契约测试同时保护应保留和应排除的语义。

## 影响、风险与兼容性

变更只影响 Agent 共性工作方式和 Core 文案，不改变 API、数据模型、依赖或 runtime adapter。主要风险是过度绘图，因此规则明确要求只有文字不易准确理解时才使用 Mermaid，并规定简单内容使用文字或表格。当前 Workspace 的受管 Core 不在任务中手工修改，交付后由正式自举同步更新。

## 验收摘要

- Core 不再使用“产品哲学”等旧章节结构。
- 责任、Rule/Skill authority、源资产、能力绑定和 Git 边界仍被保留。
- 简明表达、强制中英文术语对照、下一步和 Mermaid 规则具有可验证的契约测试。
- OpenSpec 严格校验、收敛预检和 Core 专项测试通过。

## 技术 Artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta Spec](specs/workspace-first-runtime-projection/spec.md)
- [Tasks](tasks.md)
