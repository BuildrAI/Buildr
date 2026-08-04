# 引入 Workspace SQLite Task Store

## 一句话摘要

Buildr Local 建立每个 Workspace 独立、仅限单机使用的 SQLite structured store，并将 Task Record 作为第一个 consumer 从文件 authority 干净切换到数据库。

## 背景与问题

文件型 Task Store 已经难以自然支持索引、关系、聚合和事务等数据库特征明显的需求，继续基于目录扫描和多文件协调扩展 Parent Task 会放大复杂度。产品尚未正式发布，旧 Task 文件数据无需迁移，可以直接建立清晰的新 authority。

## 目标与非目标

目标是交付可复用的 Workspace SQLite lifecycle、完整版本化 SQL migrations、健康诊断和 SQLite-backed Task repository，同时保持 Application 与专业模块边界。非目标包括 Parent Task、旧 YAML 数据迁移、远程同步、多人协作、Buildr Server/Cloud 和其他 lifecycle records 的顺带迁移。

## 受影响用户或角色

- Buildr Local 用户：Task 数据改为当前机器、当前 Workspace 的本地数据库。
- Agent 与 Local App：继续通过同一 Task Application 工作，不直接操作文件或 SQL。
- Buildr 产品开发者：通过连续 migration scripts 演进 schema，并通过 Doctor 与测试证明安全性。

## 核心流程

首次 Task mutation 在 canonical Workspace 惰性创建数据库，migration runner 按版本校验并原子执行 SQL scripts，随后 Task repository 在 transaction 内维护 record 和 relations。只读动作不会创建数据库；Task Metadata Publication 跳过 local-only Task Record。未来组织协作使用独立 Server/Cloud authority，不同步 SQLite 文件。

## 关键变化

- 新增 `.buildr/local/workspace.sqlite` 和 migration ledger。
- 使用 Node 24 LTS 内置 `node:sqlite`。
- Task Record authority 从 `task.yml` 切换到规范化关系表。
- Public JSON 升级到 `buildr.task-record-result/v2` 并移除 canonical path。
- 旧 Task YAML 不读取、不导入、不双写、不删除。

## 影响、风险与兼容性

这是预发布阶段的 breaking cutover；旧 Task 列表在新 runtime 下不可见。主要风险是 Node 最低版本提高、migration script 漂移、SQLite busy/corruption 和当前自举 Task 丢失，分别通过 LTS runtime 对齐、checksum ledger、事务/Doctor 诊断和显式同 ID 重建处理。

## 验收摘要

fresh Workspace 能以随包 SQL scripts 原子初始化数据库并完成 Task 全动作；重复打开零 migration；script 缺口、漂移、版本超前、失败回滚和损坏均 fail closed；旧 YAML 不进入新 authority；CLI、Local App、publication、lifecycle consumers、checkout 与 npm package 保持一致。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/workspace-structured-data-store/spec.md`
- `specs/task-record/spec.md`
- `tasks.md`
