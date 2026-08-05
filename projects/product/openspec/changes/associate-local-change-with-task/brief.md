# 从 Local App 关联 Change 到已有 Task

## 一句话摘要

让用户在 Local App 的全局 Change 详情中按需把当前 Change 关联到已有 active Task，同时保持 Change 详情首屏不读取 Task 专业状态。

## 背景与问题

全局 Change 详情已经能展示 OpenSpec 产物并生成继续/审查 Agent action，但用户发现 Change 后必须离开页面，在 Task 详情中手工编辑 Change 引用。Task Record Application 已经拥有安全的 Change reference mutation，缺少的是一个上下文一致的 Local App 入口。最近 Task 列表和详情读取已收敛为轻量 stored-state projection，因此新入口不能在页面初始加载时恢复 Environment、Git 或 Change currentness。

## 目标与非目标

目标是提供 retained 全局 Change 详情到已有 active Task 的按需关联动作，复用 Task Record Application 的 CAS mutation，并在没有 active Task 时交给 Agent 创建正式 Task。

非目标是让 Local App 创建 Task、复制或移动 Change artifacts、增加 Change/Task 存储、扫描 Task Environment，或让关联动作开始 Task Development。

## 受影响用户或角色

- 从 Local App 全局 Change 目录发现 OpenSpec Change 的人。
- 使用 Task Record Application 管理正式 Task 的 Agent/Local App consumer。
- 需要保持 retained-only Change collection 和 Task-scoped Resolver 边界的 Buildr maintainer。

## 核心流程

Change 详情初始只读取 Workspace 与 Change detail。用户点击关联入口后，页面调用 active Task stored-state projection，选择 Task 后以 `recordDigest` 和 `addChanges` 提交 Task Record mutation。成功后进入 Task 详情；409 冲突要求重新读取。没有 active Task 时，页面打开带有 Project/Change identity 目标的 Agent start-work prompt。

## 关键变化

- 新增全局 Change 详情的按需 Task 关联入口。
- 复用现有 Task list query projection 与 Task Record PATCH，不新增 writer。
- 保持 Task-scoped Change 详情不显示全局关联入口。
- 关联读取与首屏 Change 详情读取解耦，性能预算由用户动作触发。

## 影响、风险与兼容性

无需数据迁移。主要风险是 active Task 数量较大导致关联面板响应变重；通过一次 stored-state 查询、不解析专业模块和不改变首屏路径控制。CAS 冲突不会覆盖其他客户端修改。

## 验收摘要

- 全局 Change 详情首屏无 Task API 请求。
- 点击关联后只调用一次 active Task 轻量查询，并使用现有 Task Record Application mutation。
- 无 active Task 时只生成 Agent prompt；Task-scoped Change 页面不出现关联入口。
- 既有 retained-only Change collection、Task-scoped Resolver 和 Task Record 冲突边界保持通过。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Local App delta spec](specs/local-workspace-application/spec.md)
- [Implementation tasks](tasks.md)
