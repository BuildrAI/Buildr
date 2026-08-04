# 引入 Parent Task 模型

## 一句话摘要

在 Workspace SQLite Task Store 上增加最小 Parent/Child Task 层级，让协调 Task 可以管理直接子 Task，并由 Task Manager 与 Local App 使用同一 authority 维护和投影关系。

## 背景与问题

Task 已经是 Buildr 中宽而薄的顶层工作身份，但当前 Task 彼此孤立。跨 Task 协调若直接建设独立 Board Domain，会提前引入另一套 identity、status、writer 与持久模型。SQLite 已经提供关系查询和事务基础，现在适合先验证协调 Task 能否通过单 Parent、多 Child 的最小层级满足核心需求。

## 目标

- Task 可选择一个直接 Parent Task，Parent 可管理多个直接 Child Task。
- Task Manager、CLI 与 Local App 复用 Task Record Application。
- 关系无自引用和循环，mutation 原子且受 `recordDigest` 保护。
- Parent/Child 保持独立状态、Result 和专业生命周期。
- 使用连续 SQL migration 演进现有 Workspace SQLite。
- 更新任务框架讨论稿，把独立 Board 降为需要真实剩余缺口证明的后续方案。

## 非目标

- 通用依赖图、排序分组、调度和自动状态聚合。
- 多 Parent、未 Task 化规划项和跨 Workspace 关系。
- Buildr Server/Cloud 或团队同步。
- 本 Change 清退现有 task-board 资产和历史 HTML。

## 核心流程

1. 创建或编辑 active Child Task 时选择一个存在且 active 的 Parent。
2. Application 在同一 transaction 中验证 Parent、祖先链和 expected digest。
3. Child 投影直接 Parent，Parent 投影排序后的直接 Children；Local App 支持双向导航。
4. 任一 Task 独立完成或放弃，另一方只展示真实状态，不被自动修改。

## 关键变化

- SQLite 新增 purpose-built `0002_create_parent_task_relations.sql`，不重建既有 Task tables。
- Task Record 与公开 operation JSON 提升 major schema。
- CLI 五个既有 action 增加 Parent 参数/read model，不新增 Graph/Board action。
- Local App 创建、编辑、列表和详情增加 Parent/Children 体验。
- `task-manager` contract/Skill 和任务框架讨论稿同步更新。

## 影响、风险与兼容性

现有 SQLite Task 自动保持无 Parent，不迁移旧 YAML。直接 children 变化会改变 Parent read model digest，陈旧页面必须刷新。单 Parent 无法表达多协调归属、依赖条件和规划占位；只有这些需求真实出现时才评估独立 Board。

## 验收摘要

- fresh/version 1 数据库均正确进入 schema version 2，旧 scripts checksum 不变。
- create/update/inspect/list 与 Local App 完整支持 Parent/Children。
- self/cycle/unknown/terminal Parent 与 stale digest 全部 fail closed。
- Parent/Child 的 complete/abandon/专业 lifecycle 无自动联动。
- focused、changed-product、browser smoke 与 OpenSpec strict/convergence 通过。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-record/spec.md`
- `specs/workspace-structured-data-store/spec.md`
- `specs/cli-product-surface/spec.md`
- `specs/public-json-contracts/spec.md`
- `specs/local-workspace-application/spec.md`
- `specs/agent-task-workflows/spec.md`
- `tasks.md`
