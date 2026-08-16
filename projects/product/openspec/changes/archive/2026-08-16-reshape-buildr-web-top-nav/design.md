## Context

Buildr Web 权威前端在 `product/buildr-web`，由 `product/buildr` 构建进 `web-dist` 同源托管。气质已由 `redesign-local-app-ui` 锁定：Ant Design 5、雾青绿、柔和产品感；杂志衬线方向不作废恢复。当前壳层是 248px 左侧栏 + 顶栏面包屑；窄屏把侧栏 `translateX(-100%)` 且无汉堡，主导航实际不可达。

用户已确认静态稿 `projects/product/docs/mocks/buildr-web-task-cockpit.html`：顶栏放品牌、主导航、工作空间、设置、交给 Agent；下方整页是内容。

## Goals / Non-Goals

**Goals:**

- 把可观察壳层改成上下结构：顶栏导航 + 通栏内容。
- 「开始」不占主导航，也不再作为 Workspace 落地页；进入 Workspace 直接打开任务列表。
- 列表筛选与详情页头变紧凑；任务页与项目页宽屏为左列表右详情，服务与文章仍整页切换。
- 窄屏仍能使用主导航、交给 Agent 与退出。
- 保留 `data-nav`、`#open-agent-action`、`#quit-buildr`、`#preview-identity`、`#shell-workspace-name` 等既有钩子；`#preview-identity` 仅作测试钩子，不在顶栏展示。

**Non-Goals:**

- 不改路由 path、API、session、CSP，不换组件库，不引入 CDN。
- 不恢复杂志/Fraunces 方向。
- 不把服务、文章改成左列表右详情。
- 不以 Vite HMR 作为完成证据。

## Decisions

### 1. 顶栏取代左侧栏，而不是再加一层

替代方案是保留侧栏、只把工作空间上移。否决：用户明确要上下结构，内容要通栏。

实现：`AppLayout` 单行顶栏（约 56px）+ `main#app-view`。删除 `.app-sider` 网格列。全局工作空间目录仍用同一壳层，主导航项在未进入 Workspace 时指向 `/` 或禁用进入资源路由。

### 2. 主导航项与「开始」分流

顶栏主导航：任务、项目、服务、文章（保留 `data-nav`）。品牌标识链到当前 Workspace 任务列表（`/workspaces/:id/tasks`），未进入 Workspace 时链到 `/`。工作空间名称下拉列出已登记 Workspace，选中即切到该空间任务列表；并提供「全部工作空间」回到 `/`。设置是顶栏文字链，退出放在工作空间菜单或设置旁的溢出菜单，必须保留 `#quit-buildr`。

「开始」页不再作为独立落地页；`/workspaces/:id/` 与 `/overview` 重定向到任务列表。任务列表与 `#task-table-*` 等钩子不变。

### 3. 窄屏用顶栏换行或抽屉，不再藏侧栏

≤700px：主导航允许换行或收入「菜单」按钮打开的临时 Drawer，Drawer 内仍挂同一批 `data-nav` 链接（可同时存在于顶栏与抽屉，active 语义不变）。交给 Agent 与退出必须可见。preview 身份不占用顶栏可见空间，仅保留 `#preview-identity` 钩子。

### 4. 筛选一行；任务与项目并排，服务与文章详情通栏

任务/项目/服务列表：去掉「筛选」竖排卡片标题区；搜索与状态/范围用同一行 chips 或紧凑 Select，保留既有 `#task-filter-*` 等 id。服务、文章详情仍整页替换。任务页与项目页：宽屏左侧保持列表、右侧展示详情或空态；既有 `/tasks`、`/tasks/:taskId`、`/projects` 与 `/projects/:projectCode` 不变。项目编辑入口放在详情右上角，列表不再提供编辑。窄屏（约 390px）打开详情时列表可让出主表面，避免页面横向溢出。

### 5. 钩子策略沿用保留

不重写 smoke 选择器语义。集成测试若写死 `aside.app-sider` 才改为匹配顶栏结构；`data-nav="articles"` 等字符串匹配保持。

## Risks / Trade-offs

- [窄屏项过多] → 溢出进菜单 Drawer，而不是再次隐藏且无入口。
- [用户找不到工作入口] → 进入 Workspace、品牌与工作空间切换都落到任务列表；交给 Agent 仍从顶栏打开。
- [双份 data-nav 节点] → 宽屏只渲染顶栏链接；窄屏菜单打开时才挂抽屉内链接，或抽屉链接不重复 `data-nav` 而用 `aria`，保证 `page.locator('[data-nav=tasks]')` 唯一。

## Migration Plan

仅前端壳层与样式。无数据迁移。回滚即恢复左侧栏布局。合入走 Task Finish。

## Open Questions

无。壳层审美闸门已由用户确认静态稿关闭。任务页左列表右详情由用户于 2026-08-16 明确要求。同日用户要求移除 Workspace 详情/开始页，进入 Workspace 直接打开任务列表。同日用户要求项目页同样左列表右详情，编辑按钮放在项目详情右上角。
