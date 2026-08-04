## 1. Schema 与领域模型

- [x] 1.1 新增 `0002_create_parent_task_relations.sql`，建立单 Parent 关系表、双外键与 children 查询索引
- [x] 1.2 扩展 Task Record closed schema、normalizer 与 digest，加入 `parentTaskId`、`childTaskIds`
- [x] 1.3 为无 Parent、self reference、祖先循环、未知/终态 Parent 和终态 Child mutation 增加领域错误

## 2. Repository 与 Application

- [x] 2.1 扩展 SQLite Task repository 的 relation read/write 与 indexed ancestor/children 查询
- [x] 2.2 让 create/update 在单 transaction 中验证并维护 Parent relation
- [x] 2.3 保持 complete/abandon 与 Parent/Child 独立，并让反向 read model/digest 及时更新

## 3. CLI 与公开契约

- [x] 3.1 为 `task create` 增加 `--parent`，为 `task update` 增加互斥 `--parent`/`--clear-parent`
- [x] 3.2 更新 CLI help、reference 与 examples，明确层级不执行自动调度或状态聚合
- [x] 3.3 在 prerelease 扩展 Task Record v1，并提升 operation/list JSON major identity、更新 registry、contract tests 与文档
- [x] 3.4 更新 Task Manager Skill、capability contract、package target 与产品能力说明

## 4. Local App

- [x] 4.1 扩展 Workspace Task HTTP create/update payload 与 read model，保持 `recordDigest` 冲突保护
- [x] 4.2 在 Task 创建和编辑界面支持选择、修改与清除合法 Parent
- [x] 4.3 在 Task 列表/详情展示可导航 Parent 与直接 Children、真实状态和 terminal 只读边界
- [x] 4.4 增加 Local App integration/browser tests，覆盖 Parent 创建、导航、编辑、冲突与独立终态

## 5. 文档与当前认知

- [x] 5.1 更新任务生命周期架构讨论稿，以协调 Task + Parent/Child 动态投影替代当前独立 Board 预设
- [x] 5.2 更新产品、CLI、JSON、架构和限制文档，说明 local-only、独立生命周期与非目标
- [x] 5.3 更新 Brief、知识影响 evidence 与适用 glossary/架构/Service 当前认知

## 6. 验证与 Change 收敛

- [x] 6.1 增加 migration、repository、domain、CLI、HTTP 与 Local App focused tests
- [x] 6.2 验证 version 1 数据库升级、fresh database、checksum/integrity 和既有 Task 无 Parent兼容
- [x] 6.3 运行 focused 与 changed-product 验证并修复发现
- [x] 6.4 严格验证、收敛 canonical specs 并归档 Change
