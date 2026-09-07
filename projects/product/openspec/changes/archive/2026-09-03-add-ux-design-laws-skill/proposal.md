## Why

Buildr 当前能生成界面原型，但缺少在设计或审查界面与交互时系统运用用户体验心理学法则的内置专业能力。已经审查的候选稿覆盖 Laws of UX 当前 30 个主题，现在需要把它产品化为可随 Buildr 安装、更新和投射的正式内置技能，同时保持来源许可、真实证据和非操纵性设计边界。

## What Changes

- 新增可选内置技能 `ux-design-laws`，支持界面与交互的设计、审查和方案权衡。
- 以渐进披露方式提供法则索引和五组参考卡片；每条卡片包含适用信号、设计动作、误用风险、验证方法和原始来源。
- 明确心理学法则只作为启发式判断，不能替代用户研究、无障碍、安全、隐私、业务事实或实际验证。
- 明确 `ux-design-laws` 只形成设计建议；用户未要求原型或实现时，不调用 `ui-prototype`、不生成页面、不修改代码。
- 将完整技能目录登记到 Buildr package manifest 和默认 Workspace baseline，并增加静态契约测试。
- 不新增 capability contract，不修改现有 provider/binding，不包含破坏性变更。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `product-agent-skills`: 增加用户体验设计法则内置技能的触发、设计/审查/权衡方法、法则选择、建议格式、误用边界和来源完整性。
- `buildr-package-assets`: 将 `ux-design-laws` 作为无 capability contract 的可选内置技能完整打包、登记并投射到受支持的 Agent runtime。

## Impact

- 产品资产：`services/buildr/resources/workspace/skills/buildr/ux-design-laws/`。
- 包声明：`services/buildr/resources/manifest.yml` 的 builtin Skill 与 Workspace 文件映射。
- 验证：新增内置技能契约测试，并由现有 package check、runtime projection 和 OpenSpec strict 验证覆盖。
- 当前认知：更新 Change Brief；评估产品能力概览和 Buildr Service 说明是否需要补充该专业技能。
- 外部来源：仅保留 Laws of UX 与墨问学习笔记链接，技能正文使用独立编写的操作性判断，不复制网站正文或图片。
