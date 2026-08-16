## Why

Buildr Web 已完成柔和产品感换肤，但壳层仍是左侧栏 + 内容区：主导航、工作空间上下文和次级入口挤在窄栏里，下方内容被横向压缩，窄屏还会把侧栏滑出且没有入口。用户已确认静态稿，需要把可观察壳层改成上下结构，让顶栏承载导航与相关信息，下方整页作为列表或详情。

## What Changes

- 去掉常驻左侧栏；主导航改为顶栏水平项：任务、项目、服务、文章。
- 工作空间切换器、设置、交给 Agent 放入顶栏；preview 身份仅作测试钩子，不占用顶栏可见空间；Release Awareness 横幅仍不阻断导航。
- 「开始」不再进入主导航，也不再作为进入 Workspace 的落地页；进入某个 Workspace 直接打开该空间的任务列表。旧的 `/workspaces/:id/` 与 `/overview` 重定向到 `/tasks`。
- 内容通栏：服务、文章仍是整页列表或详情。任务页与项目页在宽屏为左列表、右详情，窄屏详情可独占以免横向溢出。项目编辑入口在详情右上角。
- 列表筛选改为一行紧凑控件（搜索 + chips/下拉），不再用竖排表单卡。
- 窄屏必须仍能使用主导航、交给 Agent 与退出，不得再把导航藏进不可达侧栏。
- 路由 path、API、session、CSP 与既有 `data-nav` / 稳定 DOM 钩子保持等价；不引入 CDN 或新组件库。

无 **BREAKING** API 或 URL 变更。合入仍靠 Task「收尾」。

## Capabilities

### New Capabilities

<!-- 无新增 capability；本 Change 修订既有 Workspace 外壳、Web 客户端与 browser 验证契约。 -->

### Modified Capabilities

- `local-workspace-application`：App Shell 核心导航从左侧栏改为顶栏；进入 Workspace 直接落到任务列表；当前资源高亮改由顶栏导航项表达；工作空间切换进入顶栏。
- `local-app-web-client`：明确上下结构壳层、通栏内容与窄屏顶栏可用性；进入 Workspace 的默认落地为 `/tasks`；其余路由/交互/产品边界等价不变。
- `local-app-browser-verification`：重申保留 `data-nav` 与既有 smoke 钩子；选择器不得依赖已移除的侧栏 DOM 结构。

## Impact

- `product/buildr-web`：`AppLayout`、全局壳层样式、任务/项目/服务/文章列表页头与筛选密度、详情页疏密。
- `product/buildr`：仅当测试写死侧栏结构时同步 browser-smoke / 集成断言；不改 HTTP session、CSP 或 API。
- 静态稿：`projects/product/docs/mocks/buildr-web-task-cockpit.html`（用户已确认）。
- current knowledge：实现收敛后更新 `buildr-web` 壳层描述。
- 正式验收：生产托管 `web-dist` + browser smoke（或 affected selector）。
