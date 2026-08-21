# Buildr Web Frontend Service

## 职责

`buildr-web` 是 Product Project 下与 `buildr` 同仓同级的 workspace Service，正式名称为 Buildr Web Frontend Service，拥有 Buildr Web 的 React/Vite/TypeScript 前端源码、依赖锁定与正式构建。它不托管生产 HTTP、不拥有 session 写保护模型，也不替代 CLI/Buildr Web Runtime。

## 接口与入口

- 源码根：`projects/product/services/buildr-web/`（`package.json` name：`@buildr-ai/buildr-web`，private）。
- 开发：`npm run dev`；正式构建：`npm run build`（也可由 `buildr` 的 `npm run build:web` / `dev:web` 委托）。
- 构建输出：正式构建默认写入 sibling `buildr` 顶层 `web-dist/`（`emptyOutDir: true`）；验证可通过Vite `--outDir`覆盖到临时staging，只用于与tracked产物精确比较，不改变正式输出契约。
- OpenSpec 与 verification policy 仍在父级 Product Project；本 Service 通过 Service registry 登记并由 Buildr Web / doctor 可见。
- 全局壳层为上下结构：顶栏承载品牌、任务/项目/服务/文章导航、工作空间切换、设置、退出与交给 Agent；内容在下方。进入 Workspace 直接打开任务列表；旧开始页路由重定向到 `/tasks`。任务页与项目页宽屏为左列表、右详情；项目编辑入口在详情右上角；服务/文章仍整页切换。壳层读取 sibling `buildr` 的只读Release Awareness API，在顶栏下展示GA/RC更新；用户可以复制精确`buildr update --track stable|candidate`命令，或把同一选择交给Agent。首版不从网页执行npm更新，也不替用户决定轨道。

## 数据与依赖

- 依赖 React 19、React Router、Vite、TypeScript，以及 Ant Design 5（`antd` + 必要 icons）；UI 方向为柔和产品感，依赖与字体均由 Vite 打入 `web-dist`，禁止 CDN/远程字体/远程脚本；前端工程自有 `package-lock.json`。
- 当Formal Verification选择需要Buildr Web源码工具链的capability时，该capability通过`environment.preparation`引用本Service已登记Recipe；Verification admission把它作为辅助准备闭包交给Task Environment，而不把本Service加入Task scope、Change、Content Target或源码写入authority。npm Step使用本root的`package.json`/`package-lock.json`作为inputs、worktree-local`node_modules`作为output和受管wrapper authority；Browser build在启动Chrome前只接受本root的TypeScript/Vite，不从retained checkout、全局安装或系统PATH借用。
- 运行时依赖 `buildr` 消费 `web-dist` 并做同源 loopback 托管；已安装或仅含 dist 的环境不要求本 Service 源码或 Vite 开发服务器存在。
- 不引入独立 Git 仓、CDN、分域 CORS 或云端静态托管。
- Task 列表默认 `open` (todo + active)，可单独筛选 todo，并继续以 `retrospectiveState` 筛选复盘处置。Task 详情展示复盘来源，复盘 Tab 保持原始 Markdown 只读并展示后续 Task 实时状态。UI 不创建或激活 Task。
- Task 详情“原型”Tab 按需读取 sibling `buildr` 的 Task UI Prototype metadata，提供明确空态，并列出、选择和切换多个完整原型页面及其来源。具体 HTML 只从 Task 与不透明页面 ID 的专用响应装入不含 `allow-same-origin` 的 `sandbox="allow-scripts"` iframe；响应头同时强制 opaque-origin CSP sandbox 与离线资源策略。舞台提供「新窗口打开」，用新窗口打开当前页面同一内容 URL；内容不进入主 DOM、不继承 Buildr Web session，也不能联网、提交表单或导航顶层页面。
- Task Intent 使用受限 Markdown 展示。其 Workspace 相对 `.md` 链接只能解析到 Task scope 内已登记 Project 的 `source.path`，并在页内只读预览文档名称、Workspace 路径和正文。预览内的相对 Markdown 导航继续受同一 Project 边界约束；前端不建立 Task 附件、文档副本或新 writer。
- 项目详情第三 Tab「每日演进」只读展示当天本机 v2 文件的四问摘要与提交（不展示变更文件列表；`files` 仍可由 CLI inspect 返回），可用日期选择器与前后一天切换日期，并按日/人/任务分组；按任务只聚合已关联的自己的提交。空态明确需要 Agent 收集 Git 后写入，页面无写入控件，打开时不扫描 Git。Task 详情概览不展示每日演进反向关联；生成入口走右上角交给 Agent。
- Task概览按`parent-plan | child | ordinary | legacy`呈现角色化信息：父任务先展示目标、下一步，以及由真实Child与matching Contribution Handoff派生的“已交付、剩余工作、已取代、进行中”四项摘要，再把父任务计划贡献项、顶层`children`中的真实绑定和贡献交接摘要即时组合为“进行中 / 已交付”“可启动”“等待依赖”三组中文迁移进度。桌面端每个Contribution使用“贡献项、实际子任务、贡献交接或依赖、详情入口”四区域横向紧凑行；点击行或详情箭头打开只读右侧抽屉，点击子任务标题则阻止行级交互并复用同一工作空间既有任务详情路由。窄屏将前三个信息区域按原顺序堆叠，详情箭头固定右侧，四项摘要降级为两列且不隐藏Child、交接、下一步行动或阻塞原因。实际子任务显示中文状态和交付证明；只有matching Contribution Handoff可以产生“已交付”以及已交付、剩余工作、已取代、下一步行动摘要，Child `completed`没有交接时明确显示“交付未证明”。等待项直接展示read model给出的依赖与阻塞原因，不在浏览器重算readiness。Child只展示紧凑父任务来源，ordinary与legacy不渲染空协调卡；父任务技术摘要、Change与Task Record默认折叠。页面直接消费sibling `buildr`的`buildr.parent-coordination-result/v3`，从`plan`读取治理摘要、从唯一顶层`contributions`读取工作项、从紧凑方案审查字段读取outcome；不依赖已删除的raw Parent Plan、嵌套Contribution或完整Handoff/Review Result。前端不查询SQLite、不扫描文件系统、不缓存、重算、回写Parent progress，普通进度刷新也不触发Parent Plan reconcile或方案审查失效。
- Task“证据”页使用一个共享Execution Record浏览器展示全部、Verification与Finish三种只读视图，按需读取detail与manifest声明的限量正文；Verification Result与研发页的Finish区块只提供进入同一浏览器的专业筛选入口，不复制record、Result或Finish current/terminal authority，也不提供locator、cleanup、GC或资源Inventory。

## 运行与验证

- 前端路由、DOM 交互或 Agent Action 变更后，在 `buildr` 生产托管路径下运行 browser smoke（或 affected selector）做直接反馈；package、lockfile、Vite或TypeScript配置变化选择完整Browser selector。selected Browser先完成临时staging build与tracked `web-dist`精确比较，零selector不得成功；尽量保留稳定 DOM id / `data-*` 钩子，不以 Vite HMR 冒充正式验收。
- Service registry 中 `source.path` 为 `projects/product/services/buildr-web`，与 `buildr` 路径不重叠。

## 局部术语

本 Service 当前不重定义 Project glossary。Buildr Web、session 与三入口语义以 [Buildr Service](buildr.md) 及相关 specs 为准。
