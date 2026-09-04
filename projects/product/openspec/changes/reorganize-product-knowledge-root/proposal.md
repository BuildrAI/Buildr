## Why

当前 Product 将项目当前态知识放在 `openspec/knowledge/`，使人容易把“当前态模型”和 OpenSpec 规范/变更过程混为同一层；同时产品文档、当前架构说明和可视化技术图的主干不够清晰。现在已经确认 `knowledge` 应作为 Product 级当前态模型，适合在首张 Buildr 系统全景图落地时一起完成目录和引用收敛。

## What Changes

- **BREAKING** 将当前态知识主干从 `projects/product/openspec/knowledge/` 迁移到 `projects/product/knowledge/`。
- 保留 `projects/product/openspec/specs/` 作为规范性行为契约，保留 `projects/product/openspec/changes/` 作为单次变更过程。
- 将当前架构、流程、Service 和术语等 current knowledge 迁移到 Product 根下的 `knowledge/`。
- 将 Archify 源码与生成的 HTML 技术图放入 `knowledge/archify/`，首张系统全景图归入 `knowledge/archify/system/`。
- 更新相关 Skill、规范、Doctor/路径诊断、文档索引和测试中的当前知识路径。
- 保留历史任务页面及历史 Change 的原始路径和内容，不为适配新主干回改历史材料。
- 不改变产品业务行为、OpenSpec Requirement 语义或图表治理/自动对齐能力；后者另行设计。

## Capabilities

### New Capabilities

- `product-knowledge-organization`: 定义 Product 当前态知识、项目文档、OpenSpec 规范/变更和 Archify 可视化产物的物理组织与权威边界。

### Modified Capabilities

- `current-knowledge-maintenance`: 将 current knowledge 的 canonical root、targets 和维护结果路径改为 Product 根下的 `knowledge/`。
- `terminology-governance`: 将 Project canonical glossary 迁移到 `projects/product/knowledge/glossary.md`。
- `buildr-development-openspec`: 将当前态知识与历史任务页面的路径边界改为新的 Product 级 `knowledge/` 主干。

## Impact

- 受影响范围：`projects/product/knowledge/`、`projects/product/openspec/`、`projects/product/docs/`、Product 随包 Skill/contract、Buildr Doctor/路径读取和相关契约测试。
- 需要迁移当前知识文件及其内部相对链接，并保留历史任务页面和 archived Change 的历史引用。
- 首张 Archify JSON/HTML 技术图从当前任务工作树中的旧知识路径迁移到 `knowledge/archify/system/`。
- 不涉及 npm API、CLI 业务语义、数据库 schema、用户 Workspace 资产或 Agent runtime 行为变化。
