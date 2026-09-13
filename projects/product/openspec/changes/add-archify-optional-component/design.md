## Context

Archify 已有正式发行包，包含无需额外安装的程序和模板。Buildr 已支持单成员可选组件（Component）及完整技能（Skill）目录投射，直接复用这些能力。

## Goals / Non-Goals

目标是固定版本、可追溯来源、完整安装与安全卸载。第一版不改上游绘图行为、不新增绘图服务或全局命令安装，也不自动接管用户级同名目录。

## Decisions

- 采用 `v2.16.0/archify.zip` 正式发行包，SHA-256 为 `4c59fa6557a2385beaaef8c7219cc414573acc9f0c30a932d5053b0b20689a46`。完整内容进入 `resources/workspace/skills/buildr/archify/assets/archify/`，安装目标为 `skills/buildr/archify`。不用用户级目录作为发布源，也不打包其 `node_modules`。
- `resources/workspace/components/buildr/archify/component.yml` 声明一个技能（Skill）成员及目录摘要。随包资源清单使用 `defaultEnabled: false`、`required: false`；需要时显式安装。
- Buildr 薄入口只读取 `assets/archify/SKILL.md` 并定位上游执行目录，符合现有固定根目录约束。完整保留 MIT 许可证、上游版本元数据和正文。来源及升级说明放在 Buildr 自有文档中，不修改上游正文。
- 复用现有成员完整性、用户修改保护和投射机制。没有跨技能（Skill）稳定依赖，不新增能力契约（Contract）或 OpenSpec 补充指令。
- 图的 JSON 和 HTML 由调用者放入项目目录，组件（Component）卸载不触达项目内容。
- 包检查中 `generatedBy` 的版本要求仅适用于 OpenSpec。Archify 通过上游版本元数据和完整目录摘要核验；固定上游发行目录不属于 Buildr 自有 TypeScript 源码转换范围。

## Risks / Trade-offs

- 发行包增加约 5.9 MB 未压缩内容：接受固定版本的离线可用性收益，验证实际打包内容。
- 用户级同名 Archify 可能阻止投射：保留现有内容并报告现有所有权诊断，不绕过或自动删除。
- 上游有更新通知：保留通知行为；受管内容的版本变化通过 Buildr 后续交付，不让安装流程执行上游更新。
- 浏览器截图依赖本机浏览器：基础渲染与验证使用 Node；可视检查按实际环境报告，不把缺少浏览器说成绘图失败。

## Migration Plan

新工作空间（Workspace）仅发现可选组件（Component）；已有工作空间（Workspace）同步不自动安装。用户选择安装后获得完整内容，重复同步不改变文件，显式卸载保留项目图和用户级目录。当前自举激活由原唯一执行器处理。
