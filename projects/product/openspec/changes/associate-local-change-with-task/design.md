## Context

当前全局 Change 详情已经从 retained Project 读取 Change，并提供继续推进与普通审查 Agent action。Task 详情已经通过 Task Record Application 维护 `addChanges`，并在点击关联 Change 后通过 Task-scoped Resolver 读取工作副本。缺口只在入口：用户从全局 Change 详情发现 Change 后，必须离开当前页面再手工编辑 Task。

Local App 最近已将 Task 列表/详情首屏收敛为 SQLite stored-state projection。新的入口必须保持这个边界：Change 详情初始请求不读取 Task；用户明确点击关联操作后，才发起一次 `status=active` 的轻量 Task 查询。该查询只返回 Task Record、直接关系和已保存引用，不解析 Environment、Git、OpenSpec artifacts 或 currentness。

## Goals / Non-Goals

**Goals:**

- 在全局 Change 详情按需展示 active Task，并允许用户选择一个已有 Task。
- 使用现有 Task Record Application 的 optimistic-concurrency mutation 关联 `project/change`。
- 关联成功后导航到 Task 详情，保留 Change authority 与 Task-scoped Resolver 的现有行为。
- 没有 active Task 时，复用受限 Agent start-work prompt，让 Agent 创建正式 Task。
- 通过固定请求数量和 stored-state query 保持 Change 详情首屏与关联面板读取可控。

**Non-Goals:**

- 不在 Local App 创建正式 Task。
- 不创建新的 Change、Task、Environment 或 Change artifact storage。
- 不从全局 Change 页面扫描 Task Environment、Git worktree 或 Change currentness。
- 不修改、apply、sync、archive OpenSpec Change。
- 不增加分页、后台索引、缓存或通用关联框架。

## Decisions

### 1. 复用 Task Record Application，而不是增加关联 API

全局 Change 详情在用户点击“关联到已有 Task”后调用现有 `GET /api/v1/tasks?status=active`，展示 `task-record-list` 的 stored-state projection；提交时调用现有 `PATCH /api/v1/tasks/:taskId`，携带当前 `recordDigest` 和单个 `addChanges`。这样保持“一种事实一个 writer”，并复用既有冲突、引用校验和权限边界。

备选方案是新增 `/changes/:change/tasks` 聚合 API，或让 Change Application 写 Task Record；两者都会增加重复的查询/写入 authority，本 Change 不采用。

### 2. 关联面板按需加载，首屏零 Task 读取

Change 详情初始渲染只保留 Workspace 与 Change detail 两个既有请求。关联按钮点击后才显示面板并加载 active Task。按钮只存在于 retained 全局 Change 详情，Task-scoped Change 详情不重复提供关联入口。

备选方案是在页面打开时预加载 active Task，交互更快但会把全局 Change 浏览变成 Task 读取消费者；这与最近的 Local App 读取收敛相冲突，因此不采用。

### 3. 无 active Task 时交给 Agent

空结果显示受限的“交给 Agent 创建 Task”动作，打开现有 start-work drawer，预填当前 Project 和包含 Change identity 的目标。Local App 只生成 prompt，不创建 Task 或回写 Change；Agent 后续按正式 Task 流程创建记录并引用 Change。

### 4. 冲突失败后停留在面板并要求刷新

PATCH 使用 `expectedRecordDigest`。若 Task 被其他客户端修改，页面显示冲突并重新读取 active Task，而不自动合并或覆盖用户的 Task metadata。Change 详情本身保持可读。

## Risks / Trade-offs

- [关联面板加载大量 active Task] → 使用已有 SQLite query projection 和单次按需请求；不做逐 Task 专业解析，不改变首屏路径。
- [Task 在读取后被其他客户端更新] → 使用 `recordDigest` CAS；409 时停止写入并要求重新读取。
- [Change 已被目标 Task 引用] → 选择项标记为已关联并禁用，服务端继续依赖既有去重校验。
- [用户误以为关联等于开始研发] → 文案明确这是 Task metadata 关联；后续研发仍由 Agent/Task Development 执行。

## Migration Plan

无需数据迁移。发布后，已有 Task 的 Change 引用、全局 Change 索引和 Task-scoped Resolver 保持不变；旧客户端不识别新入口时仍可通过 Task 详情编辑引用。

## Open Questions

无。
