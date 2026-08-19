## Context

Buildr Web Runtime 已在启动阶段根据 product installation channel 与 runtime role 解析 closed `webProfile`，并将该事实用于 Data Root、实例锁、Workspace registry 和健康检查。React 前端目前只从入口页读取 session 与 Preview identity，没有获得 Web profile，因此即使 `Buildr Web Dev` 已正确隔离，页面也无法向用户展示其开发环境身份。

该变更跨越 `buildr` Runtime 与 `buildr-web` 前端，但不引入新的环境判断来源，也不改变 profile 的 Domain 定义。

## Goals / Non-Goals

**Goals:**

- 复用 Runtime 已解析并校验的 `webProfile.profile` 作为唯一展示依据。
- 在所有页面共用的应用壳中持续、清晰且紧凑地显示“开发版”，并让浏览器标签页用 `Buildr Web Dev` 直接区分开发环境。
- 保证 released profile 不显示开发版标识，未知或缺失值也不产生误报。
- 通过 Runtime、前端契约和浏览器级验证覆盖 profile 注入与最终可见性。

**Non-Goals:**

- 不改变 development/released profile 解析、Data Root、端口或实例生命周期。
- 不修改 Launcher 名称、binding、安装方式、图标、签名或公证。
- 不把环境标识扩展为环境切换器，也不改变 Preview identity 的既有行为。
- 不根据端口、URL、Workspace、页面域名或 Launcher 文件名推断环境。

## Decisions

### 1. 通过入口页 meta 注入 closed profile

Runtime 在读取生产 `index.html` 时，把已解析的 `webProfile.profile` 注入 `meta[name="buildr-web-profile"]`。这沿用 session 与 Preview identity 的同源启动上下文，页面首次渲染即可获得环境身份，无需新增 API 请求或异步闪烁。

备选方案是新增 `/api/v1/app-profile`。它会增加一次启动请求、加载状态和失败分支，却不会提供比 Runtime 当前闭合事实更多的信息，因此不采用。

### 2. 前端只把精确 `development` 值映射为标识

前端解析器只接受 closed profile 值；仅 `development` 渲染 `#development-environment-badge`，`released`、缺失、占位符或未知值均不显示。标识只用于展示，不参与请求、权限、路由或数据选择。

这种 fail-closed 展示策略避免 Vite 源入口、旧 dist 或异常注入把正式版误标为开发版。代价是注入缺失时可能暂时不显示，但不会产生更危险的误报。

### 3. 页面品牌区域与标签页标题共同显示开发环境

标识紧邻 `Buildr Web` 品牌并位于所有路由共享的 topbar 中，使用短文案“开发版”和稳定 DOM id。它不占用页面内容区，也不会随 Workspace 或 Task 切换消失；窄屏下保持可见，而品牌长文本可继续按现有规则收起。

浏览器标签页沿用既有 `Buildr Web` 或 `<Workspace> · Buildr Web` 结构，仅在 closed profile 为 `development` 时把产品名映射为 `Buildr Web Dev`。released、缺失或未知 profile 保持既有 `Buildr Web` 标题。

备选方案是在每个页面内容标题、设置页或一次性 Banner 中展示。它们无法持续可见或会重复实现，因此不采用。

### 4. 构建产物与两侧测试一起更新

前端源码修改后通过现有 `build:web` 生成 `buildr` Service 的正式 `web-dist`。Runtime 测试验证 released/development 注入差异，前端契约和浏览器 smoke 验证条件渲染、标签页标题与可见文案，避免只测试源码或只测试静态产物。

## Risks / Trade-offs

- [入口页占位符或 dist 未同步] → 构建正式 `web-dist`，并运行 web-dist、Runtime 和浏览器验证。
- [客户端 DOM 可被本机用户修改] → 标识只做展示，任何安全或数据边界仍由 Runtime profile authority 决定。
- [窄屏 topbar 空间变小] → 使用短文案和紧凑样式，保留既有 flex/wrap 响应式行为。
- [旧 Runtime 托管新前端或新 Runtime 托管旧前端] → 缺失/未知 profile 不显示，保持向后兼容且不误标正式版。

## Migration Plan

无需数据迁移。随正常前端构建和 Buildr 交付更新 Runtime 与 `web-dist`；回滚时同时回退入口注入、壳层标识和构建产物即可。

## Open Questions

无。
