# Buildr Web Frontend Service

## 职责

`buildr-web` 是 Product Project 下与 `buildr` 同仓同级的 workspace Service，正式名称为 Buildr Web Frontend Service，拥有 Buildr Web 的 React/Vite/TypeScript 前端源码、依赖锁定与正式构建。它不托管生产 HTTP、不拥有 session 写保护模型，也不替代 CLI/Buildr Web Runtime。

## 接口与入口

- 源码根：`projects/product/services/buildr-web/`（`package.json` name：`@buildr-ai/buildr-web`，private）。
- 开发：`npm run dev`；正式构建：`npm run build`（也可由 `buildr` 的 `npm run build:web` / `dev:web` 委托）。
- 构建输出：正式构建默认写入 sibling `buildr` 顶层 `web-dist/`（`emptyOutDir: true`）；验证可通过Vite `--outDir`覆盖到临时staging，只用于与tracked产物精确比较，不改变正式输出契约。
- OpenSpec与Project测试地图仍在父级Product Project；本Service通过Service registry登记并由Buildr Web/doctor可见。
- 全局壳层为上下结构：顶栏承载品牌、任务/项目/服务/文章导航、工作空间切换、设置、退出与交给 Agent；内容在下方。进入 Workspace 直接打开任务列表；旧开始页路由重定向到 `/tasks`。任务页与项目页宽屏为左列表、右详情；项目编辑入口在详情右上角；服务/文章仍整页切换。壳层读取 sibling `buildr` 的只读Release Awareness API，在顶栏下展示GA/RC更新；用户可以复制精确`buildr update --track stable|candidate`命令，或把同一选择交给Agent。首版不从网页执行npm更新，也不替用户决定轨道。

## 数据与依赖

- 依赖 React 19、React Router、Vite、TypeScript，以及 Ant Design 5（`antd` + 必要 icons）；UI 方向为柔和产品感，依赖与字体均由 Vite 打入 `web-dist`，禁止 CDN/远程字体/远程脚本；前端工程自有 `package-lock.json`。
- 当Formal Verification选择需要Buildr Web源码工具链的capability时，该capability通过`environment.preparation`引用本Service已登记Recipe；Verification admission把它作为辅助准备闭包交给Task Environment，而不把本Service加入Task scope、Change、Content Target或源码写入authority。npm Step使用本root的`package.json`/`package-lock.json`作为inputs、worktree-local`node_modules`作为output和受管wrapper authority；Browser build在启动Chrome前只接受本root的TypeScript/Vite，不从retained checkout、全局安装或系统PATH借用。
- 运行时依赖 `buildr` 消费 `web-dist` 并做同源 loopback 托管；已安装或仅含 dist 的环境不要求本 Service 源码或 Vite 开发服务器存在。
- Task list/detail/update/complete/abandon 通过 `src/api/tasks.ts` 的能力级 typed Client消费 sibling `buildr` 从 Task-owned JSON Schema生成的 tracked DTO；低层 `client.ts` 继续只负责 Workspace scope、session/fetch transport并返回`unknown`，业务页面不再手写这五个operation的响应类型或在调用点猜测payload。Buildr Web不安装Ajv、不拥有Schema或Application authority；Schema变化必须先由Buildr生成两端DTO并通过drift check、typecheck、正式build与Task Browser Smoke。
- Task professional detail/list/update operations通过`src/api/task-professional.ts`消费Buildr Service生成的tracked DTO；Task Detail页面不拥有Schema或Application authority，也不再包含Execution Records面板。Review与Verification的“交给Agent”动作只形成携带Task ID和必要上下文的短指令，Agent再读取对应Skill与真实现场；前端typed client与后端均不存在这两类专业prompt API。
- Release Awareness、Publication list/detail 与安全退出通过 `src/api/runtimeSystem.ts` 消费 Buildr Service 的 Runtime/System Schema 生成 DTO；`AppLayout` 与 Articles 页面不再保存同一响应的手写类型或调用点 `as` 断言。Publication asset 仍使用同源 binary URL，不进入 JSON client；低层 `client.ts` 继续返回 `unknown`，Buildr Web 不安装 Ajv或取得 Runtime/System Application authority。
- 不引入独立 Git 仓、CDN、分域 CORS 或云端静态托管。
- Task 列表默认 `open` (todo + active)，可单独筛选 todo，并继续以 `retrospectiveState` 筛选复盘处置。Task 详情展示复盘来源，复盘 Tab 保持原始 Markdown 只读并展示后续 Task 实时状态。UI 不创建或激活 Task。
- Task 详情“原型”Tab 按需读取 sibling `buildr` 的 Task UI Prototype metadata，提供明确空态，并列出、选择和切换多个完整原型页面及其来源。具体 HTML 只从 Task 与不透明页面 ID 的专用响应装入不含 `allow-same-origin` 的 `sandbox="allow-scripts"` iframe；响应头同时强制 opaque-origin CSP sandbox 与离线资源策略。舞台提供「新窗口打开」，用新窗口打开当前页面同一内容 URL；内容不进入主 DOM、不继承 Buildr Web session，也不能联网、提交表单或导航顶层页面。
- Task、Project与Service文档入口共享Workspace相对Markdown路径规则。Task Intent中的`.md`链接只能解析到Task scope内已登记Project的`source.path`；Project/Service预览内的相对导航继续受同一Project边界约束。界面分别表达“引用已解析”与“正文当前可读取”，正文缺失或读取失败不反向判定引用非法；前端不建立Task附件、文档副本或新writer。
- 项目详情第三 Tab「每日演进」只读展示当天本机 v2 文件的四问摘要与提交（不展示变更文件列表；`files` 仍可由 CLI inspect 返回），可用日期选择器与前后一天切换日期，并按日/人/任务分组；按任务只聚合已关联的自己的提交。空态明确需要 Agent 收集 Git 后写入，页面无写入控件，打开时不扫描 Git。Task 详情概览不展示每日演进反向关联；生成入口走右上角交给 Agent。
- 父子管理从任务记录直接读取目标、关系及子任务结果，旧专用计划只读。父任务完成要求当前观察、总体验收、逐项处置与明确用户授权；界面和命令共享同一写入保护。见[父子管理](../flows/parent-child-management.md)。
- 所有Task角色先展示同一Task Overview用户摘要：目标以及相互正交的Delivery、Activation、Cleanup，随后列出局部attention和具名authorization；前端直接消费read model，不从技术字段重算authority、拼装授权token、解释Development gate或把maintenance attention降级为Delivery失败。Review、Verification与Development按需独立读取，任一缺失或失败不隐藏其他模块；Parent/Child导航与详情侧栏保持独立任务语义。
- Task“证据”页只展示Review Results与current任务验证报告；Task Execution Record浏览器和相关API已经删除。

## 运行与验证

- 前端路由、DOM 交互或 Agent Action 变更后，在 `buildr` 生产托管路径下运行 browser smoke（或 affected selector）做直接反馈；package、lockfile、Vite或TypeScript配置变化选择完整Browser selector。selected Browser先完成临时staging build与tracked `web-dist`精确比较，零selector不得成功；尽量保留稳定 DOM id / `data-*` 钩子，不以 Vite HMR 冒充正式验收。
- Service registry 中 `source.path` 为 `projects/product/services/buildr-web`，与 `buildr` 路径不重叠。

## 局部术语

本 Service 当前不重定义 Project glossary。Buildr Web、session 与三入口语义以 [Buildr Service](buildr.md) 及相关 specs 为准。
