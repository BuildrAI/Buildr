## Context

Product 当前将已实现的项目当前态模型放在 `openspec/knowledge/`，而 `openspec/` 同时承载规范和变更过程。`docs/` 又承载产品理解、架构解释、维护说明和未来路线，导致项目文档的物理入口与内容责任不够直观。

本 Change 的目标是把当前态模型提升到 Product 根下的 `knowledge/`，让 `openspec/` 保留 OpenSpec 自己的 `specs/` 与 `changes/` 结构；`docs/` 继续作为面向人的解释和未来思考层。当前任务工作树已经包含首张 Buildr 系统全景 Archify JSON/HTML，需随当前态知识一起迁移。

当前 `openspec/knowledge/task-boards/` 与 `task-cockpits/` 是既有历史页面，现有规范要求原地保留。本 Change 只迁移当前态模型，不回写或移动这些历史页面。

## Goals / Non-Goals

**Goals:**

- 建立 `projects/product/knowledge/` 作为当前态模型的唯一主干。
- 将 `overview.md`、`glossary.md`、`architecture/`、`flows/` 和 `services/` 迁移到新主干。
- 将 Archify 源码和 HTML 迁移到 `knowledge/archify/`，首图位于 `knowledge/archify/system/`。
- 保持 `docs/`、`openspec/specs/`、`openspec/changes/` 的职责清晰并互相导航。
- 更新所有当前读取器、Skill、契约测试和文档链接，使新路径成为唯一 current knowledge path。
- 为未来 Archify 维度保留清晰的目录参考；Git 中使用明确的说明文件或受用户授权的 `.gitkeep`，不建立新的事实内容。

**Non-Goals:**

- 不建设 Archify 图表治理、自动影响识别或自动对齐体系。
- 不修改 OpenSpec Requirement、CLI、HTTP、数据库 schema、runtime adapter 或用户 Workspace 业务行为。
- 不合并 `docs/` 与 `knowledge/` 的物理目录。
- 不迁移、重写、删除或重新接管历史 task boards、task cockpits 和 archived Change。
- 不为所有未来知识类型预先生成空文档。

## Decisions

### 1. 当前态模型提升到 Product 根目录

目标结构为：

```text
projects/product/
├── docs/                    # 面向人的解释、维护、设计理由和未来思考
├── knowledge/               # 当前态模型，供人和 Agent 判断现状
│   ├── overview.md
│   ├── glossary.md
│   ├── architecture/
│   ├── flows/
│   ├── services/
│   └── archify/
└── openspec/
    ├── specs/               # 规范性行为契约
    └── changes/             # 单次变更过程
```

`knowledge` 与 `docs` 描述的是同一个 Product，但前者承担当前态对账和影响判断，后者承担阅读、维护和设计解释。它们保持物理分离，统一由入口文档互相链接。

### 2. OpenSpec 保留规范与变更，不退化为单一 spec 目录

`openspec/specs/` 继续保存 MUST/SHOULD 级行为契约，`openspec/changes/` 继续保存 proposal、design、delta specs 和 tasks。规范和变更不能移动到 `knowledge/` 或 `docs/`，否则会破坏 OpenSpec 工具的 planning root 与 Change 生命周期。

### 3. Archify 作为 current knowledge 的视觉产物区

`knowledge/archify/` 只保存当前态技术图的 Archify JSON 源码和由其生成的 HTML。第一阶段只创建 `index.md` 和 `system/` 目录；产品、应用、数据、技术和流程等目录作为未来布局说明，不提前制造无内容文档。技术图不是事实源，OpenSpec 和当前代码/结构声明仍是来源。

JSON 与 HTML 使用稳定语义文件名，不把 commit、日期或 Task ID 写入路径。视觉检查截图、contact sheet 和 receipt 是验证证据，不加入 current knowledge 主干。

### 4. 一次性迁移，不保留双主干

使用精确 `git mv` 迁移当前态文件，逐项修复内部相对链接和当前读取器。实现完成后，`projects/product/knowledge/` 是唯一当前态路径；不保留长期双读、双写或兼容副本。

历史材料单独处理：既有 `openspec/knowledge/task-boards/` 与 `task-cockpits/` 保持原路径与内容，当前入口只把它们说明为历史旁证；archived Change 不为适配新路径而回改。

### 5. 先改源资产，再改运行时投射

当前 Product 源中的 Skill、contract、Doctor/路径诊断和测试引用必须一起更新。`services/buildr/resources/` 中的受管投射内容按照现有 Product source/manifest 边界同步更新；不直接修改用户 Workspace 或 retained runtime 投射。

### 6. 失败与回滚

迁移过程保持单一 Git Change。若文件迁移、链接更新、路径诊断或契约测试失败，保留工作树现场并修复；若需要回滚，在同一 Change 中反向恢复路径和引用，不删除历史资料。任何无法确认的历史页面所有权或链接语义都不自动覆盖。

## Risks / Trade-offs

- **路径引用遗漏** → 先用限定范围的 `rg` 盘点当前非归档引用，再运行 current knowledge、术语、Doctor 和 Product contract 测试；历史 archive 只作回读旁证。
- **OpenSpec Change 与 current knowledge 混淆** → Change 仍固定在 `projects/product/openspec/changes/`，当前态内容只进入 `projects/product/knowledge/`。
- **历史 task 页面被误迁移** → 对 `task-boards/`、`task-cockpits/` 设置明确的保留清单，迁移脚本/任务不触碰这些路径。
- **Archify 生成物污染文档主干** → 只把 JSON/HTML 作为图表产物纳入，视觉检查 sidecar 留在任务证据或本地清理范围。
- **新路径造成额外 Agent 读取成本** → 更新入口索引和直接链接，保持 `knowledge/overview.md`、`knowledge/architecture/index.md` 为渐进读取入口，不要求每次加载全部知识。

## Open Questions

- 当前 Change 不决定后续图表治理是否接入 `current-knowledge-maintenance`；该问题留给下一次独立设计。
- Git 是否长期保留各 Archify 维度的 `.gitkeep`，在实际产生第二张图后再决定；本 Change 可以先用 `knowledge/archify/index.md` 表达布局参考。
