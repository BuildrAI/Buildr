# Buildr 数据领域总图的依据与边界

[打开总图](buildr-data-domains.html) · [图源](buildr-data-domains.json) · [数据设计正文](../../docs/architecture/buildr-data-design.md) · [数据库表图](workspace-sqlite-erd.html)

## 图表达什么

本图覆盖 Buildr 的工作范围、文件型工作资产、任务（Task）与独立协作记录、实际代码位置及规范知识。它是领域关系阅读图，不是实体关系图（Entity Relationship Diagram，ERD）；箭头表示已命名的登记、引用或生成关系，不表示数据流顺序、关系基数或数据库外键（Foreign Key）。

图中数据库形状表示持久数据集合，不意味着每个框都是 SQL 表；文件型资产和 SQLite 记录故意同时出现。安装、本机应用、预览和恢复现场未画成主节点，见[本机数据说明](../../docs/architecture/buildr-local-data.md)。规则（Rule）与声明的范围细节见正文，而非由这张简图重新定义。

## 节点和连线依据

以下路径相对产品根。

| 图中内容 | 事实依据 |
| --- | --- |
| 工作空间（Workspace）与项目（Project）登记 | `services/buildr/src/modules/workspace/persistence/workspace-manifest-repository.ts`、`project-manifest-repository.ts` |
| 项目（Project）共享引用服务（Service），后者引用一个代码库实例（Repository Instance） | `services/buildr/src/modules/workspace/domain/asset-relationships.ts` 中的 `RelationshipProject`、`BusinessService`、`RepositoryInstance` 和 `validateAssetCatalog` |
| 旧登记可映射为新关系视图，并非所有现存目录都已迁移 | `services/buildr/src/modules/workspace/persistence/asset-catalog-repository.ts` 的 `readAssetCatalog` |
| 工作资产、组合与受管投射 | `services/buildr/src/modules/agent-assets/persistence/skill-manifest.ts`；[技能体系](../../docs/architecture/buildr-skill-system.md)及其实现来源 |
| 项目（Project）与任务（Task）的范围关联 | `services/buildr/src/infrastructure/sqlite/migrations/0001_create_task_store.sql` 的 `task_projects`；它引用项目（Project）代号，不拥有另一份项目（Project）正文 |
| 任务（Task）与工作摘要、审查、验证独立关联 | `0023_refactor_task_verification_report.sql`、`0027_migrate_task_review_result_v2.sql`、`0033_add_daily_workbench.sql`、`0034_add_task_review_history.sql` |
| 任务（Task）引用规范和知识，而非复制原文 | `task_changes` 保存变更定位；任务（Task）的说明可以链接文件；`services/buildr/src/modules/knowledge/domain/knowledge-index.ts` 维护主题、成果与来源的关系 |

范围关联不要求每项任务（Task）都属于一个项目（Project）；图没有绘制全体可选关系。任务（Task）到知识的虚线表达引用性质，具体关系分别由变更引用或文中链接承载，没有通用的“任务—知识”数据库关联表。

## 生成与检查

Archify 使用 `architecture` 类型，根据同名 JSON 生成 HTML。交付时使用 `validate`、`deliver` 和 `visual-check` 检查；图源与展示必须一起更新，不直接修改生成 HTML。

本次生成通过 9 项检查，布局错误和警告均为零；四个桌面尺寸的边界检查通过。已查看 1440×900 浅色和 2048×1320 深色截图，节点与连线未发现遮挡。自动报告保留自身的 `visualReview: pending`，不以自动截图冒充人工阅读结论。
