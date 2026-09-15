# Buildr Web Frontend Service

## 职责

`buildr-web` 是 Product Project 下与 `buildr` 同仓同级的 workspace Service，正式名称为 Buildr Web Frontend Service，拥有 Buildr Web 的 React/Vite/TypeScript 前端源码、依赖锁定与正式构建。它不托管生产 HTTP、不拥有 session 写保护模型，也不替代 CLI/Buildr Web Runtime。

## 接口与入口

- 源码根：`projects/product/services/buildr-web/`（`package.json` name：`@buildr-ai/buildr-web`，private）。
- 开发：`npm run dev`；正式构建：`npm run build`（也可由 `buildr` 的 `npm run build:web` / `dev:web` 委托）。
- 构建输出：本地构建默认写入sibling `buildr`顶层ignored `web-dist/`（`emptyOutDir: true`）；Browser与Candidate通过Vite `--outDir`写入隔离staging并直接消费，不比较tracked副本。
- OpenSpec与Project测试地图仍在父级Product Project；本Service通过Service registry登记并由Buildr Web/doctor可见。
- 全局壳层采用顶部区域与左侧导航：顶部依次呈现共同工作空间范围、“工作台”“工作空间”，工作台在前。工作台左侧保留任务和文章，默认进入任务列表；工作空间左侧为项目、服务、技能、设置四个平级行式入口，不展开项目树。工作空间内容区采用双栏组页签模型：左组页面级页签条承载目录与领域全景（跨页持久、可关闭、限宽居中），右组对象级页签条就地展开服务/文档/每日演进（页内对照、全关退场），两组之间贯连分隔线可拖调宽；修改与交给 Agent 动作统一走右侧抽屉。手机通过“打开导航菜单”使用同一导航，窄视口右组降级为浮动层。任务列表与详情继续并排；项目编辑入口仍在详情右上角。原有 URL 与默认 `/tasks` 重定向保留。技能页支持搜索、来源筛选和详情抽屉，按需只读技能说明与附属文本；维护动作生成智能体指令，不直接安装、启停或同步。壳层读取 sibling `buildr` 的只读Release Awareness API，在顶栏下展示GA/RC更新；用户可以复制精确`buildr update --track stable|candidate`命令，或把同一选择交给Agent 。首版不从网页执行npm更新，也不替用户决定轨道。

## 数据与依赖

- 依赖 React 19、React Router、Vite、TypeScript，以及 Ant Design 5（`antd` + 必要 icons）；UI 方向为柔和产品感，依赖与字体均由 Vite 打入 `web-dist`，禁止 CDN/远程字体/远程脚本；前端工程自有 `package-lock.json`。
- 源码按用户能力组织在`src/features/`。Workspace、Project、Service、Task、Project Daily Progress、Publication与Installation分别拥有自己的pages/components/hooks/api；`src/app/`只负责应用壳，`src/api/`只负责共享transport、session与请求上下文，`src/components/`和`src/lib/`只放跨功能复用机制。路由级业务页面不再堆放在`src/pages/`。
- Buildr Web源码工具链的准备入口由本Service自身的`package.json`、`package-lock.json`与项目测试地图声明；智能体在实际选择的checkout中调用受管wrapper。该准备不扩张Task scope、Change或源码写入authority，也不建立Task Environment记录。Browser build在启动Chrome前只接受本root的TypeScript/Vite，不从retained checkout、全局安装或系统PATH借用。
- 运行时依赖 `buildr` 消费 `web-dist` 并做同源 loopback 托管；已安装或仅含 dist 的环境不要求本 Service 源码或 Vite 开发服务器存在。
- Task固定组织为`src/features/task/{pages,hooks,components,api}`。`api/task-api.ts`消费Task-owned JSON Schema生成到`build/generated/`的ignored Task Record DTO并复用全局HTTP/session/Workspace transport；页面只组装Hook与组件，详情、动作、Evidence、关联产物和复盘分别由真实Hook管理，组件不直接调用后端Client。`src/api`不得反向依赖Task feature。Buildr Web不安装Ajv、不拥有Schema或Application authority；构建入口先生成两端DTO，再通过重复生成、typecheck、正式build与Task Browser Smoke验证。
- Task professional的Review、Verification与父任务协调读取通过`src/api/task-professional.ts`消费Buildr Service按需生成的ignored DTO；Task Detail页面不拥有Schema或Application authority，也不再包含Execution Records面板。Review与Verification的“交给Agent”动作只形成携带Task ID和必要上下文的短指令，Agent再读取对应Skill与真实现场；前端typed client与后端均不存在这两类专业prompt API。
- Release Awareness由`src/features/installation/api/release-awareness-api.ts`与`components/ReleaseAwarenessBanner.tsx`拥有；Publication list/detail由`src/features/publication/api/publication-api.ts`拥有。两者复用`src/api/runtimeSystem.ts`的共享transport与生成DTO，但页面不直接依赖宽泛Runtime/System客户端。Publication asset仍使用同源binary URL，不进入JSON client；低层`client.ts`继续返回`unknown`，Buildr Web不安装Ajv或取得后端Application authority。
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

## 导航与阅读视觉

顶部区域与左侧导航保持稳定；壳层、侧栏与内容区统一白底，分区仅由线条与页签条表达，使用较深青绿色强调，统一字号、间距与弱分隔。项目说明使用轻量信息带，资料区域减少重复卡片并限制正文阅读宽度。箭头与悬停反馈为短时过渡，并遵循减少动态效果偏好。当前数据关系未改变；项目和服务多对多关联属于后续设计。

## 轻量信息编辑

项目和服务的常用编辑入口分别由 `ProjectEditDrawer`、`ServiceEditDrawer` 管理数据；它们与交给 Agent、技能动作等抽屉共享统一抽屉壳 `DrawerShell`（eyebrow 标识行 + 标题 + 副标题 + 关闭 + 底部状态与主按钮区），`MetadataEditDrawer` 在壳上追加放弃修改确认。无修改可直接关闭；有修改时在抽屉内选择继续编辑或放弃；保存中禁止关闭和重复提交。保存失败保留字段，成功后关闭并原位更新页面与页签。手机使用全宽，正文滚动与底部动作分离。旧独立编辑 URL 保留兼容；任务编辑和其他确认弹窗不在本次调整范围。

## 技能阅读与维护交接

`features/agent-assets/` 通过生成类型客户端请求技能列表、详情和文件。说明与原文可切换，技能内相对引用在抽屉继续阅读，关闭保留列表条件；切换工作空间卸载旧详情和表单并取消请求。列表标题优先取正文顶层标题，缺失时使用标识，不改写标准字段。

后端 `agent-assets/application/skill-content-query.ts` 组合清单事实，`persistence/skill-content-repository.ts` 限定读取登记在 `skills/` 下的普通目录与文本文件；拒绝符号链接及路径逃逸，单文件最多 512 KiB，目录枚举最多 500 项且报告截断。二进制文件列出但不预览或执行，远端来源不自动抓取。启用事实不等于同步或实际加载。

添加、创建、调整和启停使用 `SkillActionDrawer` 生成可复制指令，携带工作空间路径与技能身份，要求智能体重新核对源和维护归属；复制不更改登记或文件。输入实时更新指令，一键复制并反馈结果；二级抽屉覆盖而不卸载一级详情，关闭保留阅读位置和本页按技能隔离的草稿，离开或刷新清除。复制失败选中完整指令供手动复制。`manifest.yml` 继续保留，无数据库迁移。
