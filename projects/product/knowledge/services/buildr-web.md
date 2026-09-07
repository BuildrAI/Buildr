# Buildr Web Frontend Service

## 职责

`buildr-web` 是 Product Project 下与 `buildr` 同仓同级的 workspace Service，正式名称为 Buildr Web Frontend Service，拥有 Buildr Web 的 React/Vite/TypeScript 前端源码、依赖锁定与正式构建。它不托管生产 HTTP、不拥有 session 写保护模型，也不替代 CLI/Buildr Web Runtime。

## 接口与入口

- 源码根：`projects/product/services/buildr-web/`（`package.json` name：`@buildr-ai/buildr-web`，private）。
- 开发：`npm run dev`；正式构建：`npm run build`（也可由 `buildr` 的 `npm run build:web` / `dev:web` 委托）。
- 构建输出：本地构建默认写入sibling `buildr`顶层ignored `web-dist/`（`emptyOutDir: true`）；Browser与Candidate通过Vite `--outDir`写入隔离staging并直接消费，不比较tracked副本。
- OpenSpec与Project测试地图仍在父级Product Project；本Service通过Service registry登记并由Buildr Web/doctor可见。
- 全局壳层为上下结构：顶栏承载品牌、任务/项目/服务/文章导航、工作空间切换、设置、退出与交给 Agent；内容在下方。进入 Workspace 直接打开任务列表；旧开始页路由重定向到 `/tasks`。任务页与项目页宽屏为左列表、右详情；项目编辑入口在详情右上角；服务/文章仍整页切换。壳层读取 sibling `buildr` 的只读Release Awareness API，在顶栏下展示GA/RC更新；用户可以复制精确`buildr update --track stable|candidate`命令，或把同一选择交给Agent。首版不从网页执行npm更新，也不替用户决定轨道。

## 数据与依赖

- 依赖 React 19、React Router、Vite、TypeScript，以及 Ant Design 5（`antd` + 必要 icons）；UI 方向为柔和产品感，依赖与字体均由 Vite 打入 `web-dist`，禁止 CDN/远程字体/远程脚本；前端工程自有 `package-lock.json`。
- Buildr Web源码工具链的准备入口由本Service自身的`package.json`、`package-lock.json`与项目测试地图声明；智能体在实际选择的checkout中调用受管wrapper。该准备不扩张Task scope、Change或源码写入authority，也不建立Task Environment记录。Browser build在启动Chrome前只接受本root的TypeScript/Vite，不从retained checkout、全局安装或系统PATH借用。
- 运行时依赖 `buildr` 消费 `web-dist` 并做同源 loopback 托管；已安装或仅含 dist 的环境不要求本 Service 源码或 Vite 开发服务器存在。
- Task固定组织为`src/features/task/{pages,hooks,components,api}`。`api/task-api.ts`消费Task-owned JSON Schema生成到`api/generated/`的ignored Task Record DTO并复用全局HTTP/session/Workspace transport；页面只组装Hook与组件，详情、动作、Evidence、关联产物和复盘分别由真实Hook管理，组件不直接调用后端Client。`src/api`不得反向依赖Task feature。Buildr Web不安装Ajv、不拥有Schema或Application authority；构建入口先生成两端DTO，再通过重复生成、typecheck、正式build与Task Browser Smoke验证。
- Task professional的Review、Verification与父任务协调读取通过`src/api/task-professional.ts`消费Buildr Service按需生成的ignored DTO；Task Detail页面不拥有Schema或Application authority，也不再包含Execution Records面板。Review与Verification的“交给Agent”动作只形成携带Task ID和必要上下文的短指令，Agent再读取对应Skill与真实现场；前端typed client与后端均不存在这两类专业prompt API。
- Release Awareness、Publication list/detail 与安全退出通过 `src/api/runtimeSystem.ts` 消费 Buildr Service 的 Runtime/System Schema 生成 DTO；`AppLayout` 与 Articles 页面不再保存同一响应的手写类型或调用点 `as` 断言。Publication asset 仍使用同源 binary URL，不进入 JSON client；低层 `client.ts` 继续返回 `unknown`，Buildr Web 不安装 Ajv或取得 Runtime/System Application authority。
- 不引入独立 Git 仓、CDN、分域 CORS 或云端静态托管。
- Task 列表默认 `open` (todo + active)，可单独筛选 todo，并以`missing|pending-decision|decided`筛选本机复盘文档状态。Task详情不再有独立复盘Tab；概览中的轻量卡片显示固定本机路径，按需只读打开Markdown，并只在用户明确决定后把当前文档标为`decided`。UI不创建或激活Task，也不维护复盘来源关系。
- Task 详情“原型”Tab 按需读取 sibling `buildr` 的 Task UI Prototype metadata，提供明确空态，并列出、选择和切换多个完整原型页面及其来源。具体 HTML 只从 Task 与不透明页面 ID 的专用响应装入不含 `allow-same-origin` 的 `sandbox="allow-scripts"` iframe；响应头同时强制 opaque-origin CSP sandbox 与离线资源策略。舞台提供「新窗口打开」，用新窗口打开当前页面同一内容 URL；内容不进入主 DOM、不继承 Buildr Web session，也不能联网、提交表单或导航顶层页面。
- Task、Project与Service文档入口共享Workspace相对Markdown路径规则。Task Intent中的`.md`链接只能解析到Task scope内已登记Project的`source.path`；Project/Service预览内的相对导航继续受同一Project边界约束。界面分别表达“引用已解析”与“正文当前可读取”，正文缺失或读取失败不反向判定引用非法；前端不建立Task附件、文档副本或新writer。
- 项目详情第三 Tab「每日演进」只读展示当天本机 v2 文件的四问摘要与提交（不展示变更文件列表；`files` 仍可由 CLI inspect 返回），可用日期选择器与前后一天切换日期，并按日/人/任务分组；按任务只聚合已关联的自己的提交。空态明确需要 Agent 收集 Git 后写入，页面无写入控件，打开时不扫描 Git。Task 详情概览不展示每日演进反向关联；生成入口走右上角交给 Agent。
- 父任务协调（Task Parent Coordination）从任务记录直接读取目标、关系及子任务结果，旧专用计划只读。父任务完成要求当前观察、总体验收、逐项处置与明确用户授权；界面和命令共享同一写入保护。见[父任务协调](../flows/task-parent-coordination.md)。
- Task详情直接从Task Record展示目标、状态与结果，从关系投影展示Parent/Child导航；不再请求或维护独立Task Overview。Review与Verification按需独立读取，任一缺失或失败不隐藏其他模块。
- Task“证据”页只展示Review Results与current任务验证报告；Task Execution Record浏览器和相关API已经删除。

## 运行与验证

- 前端路由、DOM交互或Agent Action变更后，Browser dispatcher先在临时staging生成正式Web dist，再由Buildr HTTP直接托管同一目录运行smoke；package、lockfile、Vite或TypeScript配置变化选择完整Browser selector。ignored本地`web-dist`不参与正式结果，零selector不得成功，也不以Vite HMR冒充正式验收。
- Service registry 中 `source.path` 为 `projects/product/services/buildr-web`，与 `buildr` 路径不重叠。

## 局部术语

本 Service 当前不重定义 Project glossary。Buildr Web、session 与三入口语义以 [Buildr Service](buildr.md) 及相关 specs 为准。
