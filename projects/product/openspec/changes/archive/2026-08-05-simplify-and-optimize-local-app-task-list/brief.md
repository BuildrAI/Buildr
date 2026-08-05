# 收敛 Local App Task 列表读取

## 一句话摘要

让 Local App 的 Task 列表和详情首屏成为 SQLite 轻量观察视图，增加实用过滤并清退正式 Task 创建入口，同时把完整 currentness 保留给专业视图和 Agent 生命周期动作。

## 背景与问题

Task current records 已统一进入 canonical Workspace SQLite，但 Local App 普通读取仍逐 Task 校验 filesystem scope、解析 Task Environment、Git worktree 与 OpenSpec active/archive Change。少量 Task 的列表因此仍需约 2 秒，详情首屏还为了 Parent 下拉阻塞读取完整列表。Local App 同时保留正式 Task 创建表单，与“Agent 根据用户意图创建正式 Task”的产品边界不一致。

## 目标与非目标

本 Change 只建立 Application-owned SQLite query projection、封闭过滤、Parent 候选延迟加载和 Local App create 清退。`childTaskCount` 仅从 `parent_task_id` 派生；不新增 migration、持久化计数、ORM、FTS、缓存、后台索引、分页、query DSL、history、同步或第二 authority。

## 受影响用户或角色

- 人通过 Local App 快速查看、过滤和有限维护正式 Task。
- Agent 继续通过 Task Manager/Application 创建和恢复正式 Task。
- Finish、Verification、Development、Review、Environment 和 Change detail consumer 继续使用完整 currentness。

## 核心流程

Local App list/detail 通过 Task Record Application 的 stored-state query projection 从同一 SQLite authority 读取。列表页面显式默认 `active`，过滤条件以 closed schema 进入参数化 SQL；详情只读取当前 Task。用户操作 Parent 字段时才加载 active 候选，点击 stored Change reference 后才进入 Task-scoped Change resolver。

## 关键变化

- 固定批量 SQLite 查询替代 Task 列表的逐 Task关系查询和外部 currentness 解析。
- 增加关键词、Project、Service、status、hasChildren 过滤与数据库来源选项。
- `childTaskCount` 作为 read projection 派生字段，不进入 Task Record v1 或 SQLite column。
- 删除 Local App Task create UI 和 POST route，保留 Agent/CLI create。
- 保持专业 Tab lazy loading、Change detail 和正式生命周期 fail-closed 行为。

## 影响、风险与兼容性

Local App collection POST 是有意删除的界面/API breaking change；其他 Task mutation 和 Agent capability 不变。普通首屏不再显示 Change 当前 provenance，但 stored reference 链接始终可进入权威详情。SQLite 查询仍同步执行，但昂贵 filesystem/Git/currentness consumer 从普通路径消失。

## 验收摘要

- 列表和详情首屏不调用 Environment、Git、Change resolver 或专业 Result reader。
- 列表通过固定数量参数化 SQLite 查询支持封闭过滤和直接 Child 数量。
- Local App create 消失，CLI/Task Manager create 通过。
- Parent 候选延迟加载，专业 Tab 与 Change detail 无回归。
- 自动化验证调用边界；同一 Workspace 本机 warm run 从列表约 2.09 秒、详情约 0.61 秒降至列表约 0.08 秒、详情约 0.09 秒。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Record delta](specs/task-record/spec.md)
- [Implementation tasks](tasks.md)
