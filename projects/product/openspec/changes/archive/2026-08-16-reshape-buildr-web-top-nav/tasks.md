## 1. 壳层上下结构

- [x] 1.1 将 `AppLayout` 从左侧栏改为顶栏：品牌、任务/项目/服务/文章、工作空间切换、设置、交给 Agent 与退出；进入 Workspace 直接打开任务列表。
- [x] 1.2 重写 `.app-shell` 样式为纵向布局，删除常驻 `.app-sider`；窄屏用明确菜单暴露同一批主导航，每个 `data-nav` 值在页面中只对应一个可点击节点。
- [x] 1.3 顶栏工作空间切换器读取已登记 Workspace 列表，切换到目标任务列表，并提供返回全部工作空间目录的入口；保留 `#shell-workspace-name`。
- [x] 1.4 移除 Workspace 开始/详情页；`/workspaces/:id/` 与 `/overview` 重定向到 `/tasks`。

## 2. 列表与详情疏密

- [x] 2.1 将任务列表筛选从竖排表单卡改为一行搜索 + 紧凑筛选，保留 `#task-filter-*` 等既有 id。
- [x] 2.2 收敛项目、服务、文章列表页头与筛选密度，使通栏表成为主表面。
- [x] 2.3 服务、文章详情保持返回链 + 标题 + 页签的通栏结构，不并排列表与详情。
- [x] 2.4 宽屏任务页改为左列表右详情，保留 `/tasks` 深链与 `#task-table-*` / `#task-filter-*` 钩子；窄屏详情可独占以免横向溢出。
- [x] 2.5 宽屏项目页改为左列表右详情，编辑入口放在详情右上角；保留 `/projects` 深链与 `#project-table-*` / `#project-edit-button` 钩子；窄屏详情可独占以免横向溢出。

## 3. 测试钩子与当前认知

- [x] 3.1 检查并更新 `buildr` 中写死侧栏结构的集成/smoke 断言，使导航断言以 `data-nav` 与稳定 id 为准。
- [x] 3.2 运行受影响的前端集成测试或 browser smoke 作为直接反馈，修复因壳层 DOM 变化导致的失败。
- [x] 3.3 按 knowledge-impact 更新 `openspec/knowledge/services/buildr-web.md` 的壳层描述，并完成 Brief 与 sidecar 对齐。
