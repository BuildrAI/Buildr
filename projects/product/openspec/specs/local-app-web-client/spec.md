# local-app-web-client Specification

## Purpose

Local App React 客户端源码位置、构建产物、本机 session adapter 与公共 API client 边界，以及与现网路由等价的行为完整性约束。

## Requirements

### Requirement: Environment Tab必须展示Preparation来源与分层readiness
Buildr Web Environment Tab MUST从Task Environment saved-current read model展示Plan来源、Project Declaration、scope、Recipe与Step状态、identity、最近观察、diagnostic和本次prepare执行事实。页面 MUST不把同一Step probe复制为多个scope事实。

#### Scenario: 多Service Receipt
- **WHEN** Receipt包含`buildr`与`buildr-web`两个Service Recipe
- **THEN** 页面 MUST分别展示两个Recipe及其Step状态
- **AND** 任一blocked MUST在Environment聚合结论中可见

#### Scenario: task-inline Receipt
- **WHEN** Plan来源为`task-inline`
- **THEN** 页面 MUST明确显示该来源没有长期Declaration
- **AND** MUST提供由Agent初始化Project声明的next action提示而不直接写文件

### Requirement: Task 详情必须展示协调计划与派生 Child 交付
Buildr Web MUST 在 Task 详情展示 Parent Coordination Application 派生的当前推进状态、推荐下一步、可启动 Contribution、真实启动阻塞、最终验收进度、Parent Plan 治理事实、Child identity/status、planned/delivered/extra/residual/superseded facts 与 final acceptance prerequisites；历史 Task MUST 显示不采用新模型的清晰空态。可启动 Contribution MUST 以 Parent Plan 已保存的 `summary` 作为用户可读名称或计划结果，并同时展示稳定 `id`；Web MUST NOT 维护已知 Contribution 的平行名称字典。页面 MUST 将 `startup` readiness 与 `prerequisitesSatisfied` final acceptance readiness 分开表达，并 MUST 按公开 Planning Review read model 形状展示 outcome、applicability、摘要与时间，不得向用户显示 `undefined`。

#### Scenario: Parent 当前可推进
- **WHEN** read model 返回 `startup.status=ready`、推荐 next action 和一个或多个 eligible Contribution
- **THEN** UI MUST 优先展示“当前可推进”、推荐下一步及推荐 Contribution
- **AND** 每个可启动 Contribution MUST 同时显示其 `summary` 与 `id`
- **AND** 其他 eligible Contribution MUST 与推荐项明确区分

#### Scenario: Parent 当前被治理条件阻塞
- **WHEN** read model 返回 `startup.status=blocked` 和 startup blockers
- **THEN** UI MUST 把这些 blocker 展示为当前推进阻塞
- **AND** MUST NOT 把尚未交付的全部 Contribution 数量冒充为当前启动阻塞

#### Scenario: Contribution 等待依赖但仍有其他可启动项
- **WHEN** read model 同时返回 eligible Contribution 和 response-only dependency blockers
- **THEN** UI MUST 允许用户识别可立即启动项与等待依赖项
- **AND** MUST NOT 在浏览器重算 dependency readiness

#### Scenario: Child completed 但交付未证明
- **WHEN** read model 返回 completed Child 和 unproven Contribution
- **THEN** UI MUST 分别显示 Task 已完成与 Contribution 未证明
- **AND** MUST NOT 用完成图标暗示全部 planned 范围已交付

#### Scenario: 最终验收条件尚未满足
- **WHEN** `prerequisitesSatisfied=false` 但 `startup.status=ready`
- **THEN** UI MUST 显示 Parent 当前仍可启动 eligible Contribution
- **AND** MUST 将未完成项表达为最终验收进度而非“前置条件未满足”

#### Scenario: Planning Review 已存在
- **WHEN** read model 返回 Planning Review result 与 applicability
- **THEN** UI MUST 展示 conclusion outcome、applicability、摘要与 result completedAt
- **AND** 任一可选字段缺失时 MUST 使用明确空态而不是显示 `undefined`

#### Scenario: 历史 Task 没有 Parent Plan
- **WHEN** Parent Coordination read model 返回 legacy mode 或 `parent_plan_absent`
- **THEN** UI MUST 显示该 Task 尚未显式采用 Parent Plan 的清晰空态
- **AND** MUST NOT 自动 backfill、创建或改写任何 Task 或 Plan

### Requirement: Buildr Web 必须提供可扩展的 React Web 客户端并保持行为等价
Buildr Web 客户端 MUST 以 React 实现，源码 MUST 位于 `product/buildr-web` Service 的前端工程根，并 MUST 通过构建产物由本机 Buildr Web HTTP interface（归属 `product/buildr`）同源托管。用户可观察的**已挂载路由 path 与功能交互** MUST 保持等价，包括工作空间列表、开始/设置、任务列表与详情页签、Task-scoped Change、项目、服务、文章、Agent Action 抽屉、退出应用与 preview 身份条；视觉呈现、布局密度与动效 MAY 在经确认的 UI 重设计范围内变化，且 MUST NOT 被解释为对路由或功能交互等价的破坏。客户端 MUST NOT 直连 SQLite、manifest 或文件系统 path，MUST NOT create Task，也 MUST NOT 在页面内执行专业任务。

#### Scenario: 生产托管 React shell
- **WHEN** 用户通过 `buildr web`、已安装 npm CLI 启动的本机应用或官方/开发 launcher 打开 Buildr Web
- **THEN** HTTP interface MUST 返回来自构建产物的应用 shell
- **AND** 页面 MUST 成功读取注入的本机 session meta 并加载同源静态资源

#### Scenario: 路由行为等价
- **WHEN** 用户访问既有 Workspace 深链或全局路由
- **THEN** React 客户端 MUST 渲染对应功能视图
- **AND** MUST NOT 要求用户学习新的 URL 方案作为 UI 重设计条件

#### Scenario: 产品边界保持
- **WHEN** 用户在 React Buildr Web 中操作 Task、Project、Service 或 Agent Action
- **THEN** 页面 MUST 继续只维护允许的低风险 metadata 或生成 Agent prompt
- **AND** MUST NOT 创造第二套 Task writer 或绕过 Application

#### Scenario: 前端源码根位于 buildr-web
- **WHEN** 维护者检查 Buildr Web React 源码位置
- **THEN** 权威源码根 MUST 为 `projects/product/services/buildr-web`
- **AND** MUST NOT 将 `projects/product/services/buildr/web` 继续作为权威前端源

#### Scenario: 视觉重设计不改变功能交互契约
- **WHEN** Buildr Web 完成经确认范围的视觉/布局/动效重设计
- **THEN** 既有功能步骤（打开工作空间、浏览项目/服务/文章、查看任务与 Agent Action）MUST 仍可在相同路由 path 下完成
- **AND** MUST NOT 以外观或 class 名变化为由要求新的 API、session 或产品能力

### Requirement: Buildr Web 客户端必须分离公共 API client 与本机 session adapter
Buildr Web 客户端 MUST 将 HTTP JSON 调用封装为不依赖 DOM 的公共 API client，并 MUST 通过本机 session adapter 为写请求提供 `x-buildr-session`（及其他本机写保护所需信息）。公共 API client MUST 可在不绑定本机 meta session 的情况下描述请求形状，以便未来云端 auth adapter 替换；本能力 MUST NOT 实现云端认证、跨 Origin 写 API 或远程托管部署。

#### Scenario: 本机写请求使用 session adapter
- **WHEN** React 客户端发起写请求
- **THEN** 请求 MUST 经本机 session adapter 附带有效 session，并保持与当前应用 Origin 同源
- **AND** 缺少有效 session 或 Origin 不匹配时 MUST 在 Application mutation 前失败

#### Scenario: 云端扩展点不在本能力交付
- **WHEN** 维护者审查本能力的客户端分层
- **THEN** 设计与实现 MUST 保留可替换的 auth/session adapter 边界
- **AND** MUST NOT 交付云端登录、分域 CORS 写路径或远程静态托管作为本 Change 的完成条件

### Requirement: Buildr Web 构建产物必须可在无开发前端工具链的环境中被服务
Buildr MUST 将 Buildr Web 的发布所需文件定义为 `buildr` 内构建产物目录中的静态资产（由 `buildr-web` 构建输出消费而来）。运行 `buildr web`、launcher 或已安装 npm package 时，主机 MUST NOT 要求存在 Vite 开发服务器、可写的 `buildr-web` 前端源工程，即可托管并打开 Buildr Web。

#### Scenario: 无 Vite 开发服务器仍可打开
- **WHEN** 环境仅有已构建的 web dist 与 Buildr CLI/runtime
- **THEN** Buildr Web MUST 仍可通过 loopback HTTP 打开并完成 shell 级导航
- **AND** MUST NOT 依赖 `buildr-web` 源码目录中的开发依赖在运行时可用

### Requirement: Buildr Web 必须只提交显式协调动作
Buildr Web MUST通过同一Application API提交reconciliation与final acceptance，不得自动创建/完成/abandon Child、自动改写Change或根据页面状态同步Parent Plan。

#### Scenario: 用户确认Parent reconciliation
- **WHEN** 用户基于current identity提交完整next Plan
- **THEN** UI MUST展示Application实际effects与新的identity
- **AND** 后续Child专业动作 MUST保持独立

### Requirement: Buildr Web 必须展示统一与分专业 execution record 视图
Buildr Web Task 详情 MUST 提供一个共享 execution record 浏览器，支持“全部”“Verification”“Finish”三种筛选并展示多次执行、失败、重试、outcome、lifecycle、resolution、target、producer、时间与正文状态。Verification Result 区块 MUST 提供进入 Verification 视图的入口，Finish current/terminal 区块 MUST 提供进入 Finish 视图的入口；所有入口 MUST 使用同一 API authority 与 record identity，MUST NOT 把 execution record outcome 表达为当前 Result 或交付事实。

#### Scenario: 从统一入口查看
- **WHEN** 用户打开 Task 的 execution record 浏览器并切换筛选
- **THEN** Web MUST 分别请求 `all`、`verification` 或 `finish` view
- **AND** MUST 清晰显示当前筛选与空态

#### Scenario: 从 Verification 区块进入
- **WHEN** 用户在 Verification Result 区块选择查看执行记录
- **THEN** Web MUST 打开同一浏览器的 Verification view
- **AND** 当前 Result 展示 MUST 保持独立

#### Scenario: 从 Finish 区块进入
- **WHEN** 用户在 Finish current/terminal 区块选择查看执行记录
- **THEN** Web MUST 打开同一浏览器的 Finish view
- **AND** Finish current/terminal 展示 MUST 保持独立

### Requirement: Buildr Web 必须按需展示受限正文
Buildr Web MUST 在用户选择 record 后按需读取 detail，并只为 detail 声明的正文 filename 请求内容。Web MUST 展示 stored/response truncation、cleaned 或 unavailable 状态和 integrity failure diagnostic；MUST NOT 构造、显示或接受 locator、任意 path 或 cleanup action。

#### Scenario: 打开正文文件
- **WHEN** 用户选择 available record 的一个已声明 filename
- **THEN** Web MUST 请求 Task-scoped body-file API 并以文本预览显示返回内容
- **AND** MUST 标识任何 stored 或 response truncation

#### Scenario: 正文不可用
- **WHEN** record 已 cleaned、open、attention damaged 或 body read 失败
- **THEN** Web MUST 保留 metadata 可见并显示安全 diagnostic
- **AND** MUST NOT 尝试扫描或猜测正文路径

### Requirement: Buildr Web UI 重设计必须遵守离线 CSP 与生产托管边界
Buildr Web UI 重设计 MUST 仅修改 `product/buildr-web` 内的视觉、布局与动效实现，MUST 继续由 `product/buildr` 消费构建产物目录 `web-dist` 做同源托管，并 MUST 遵守既有离线 CSP：不得引入 CDN、远程字体或远程脚本。若使用自定义字体，字体文件 MUST 作为同源静态资产随构建产物提供。正式完成证据 MUST 来自 `buildr web`（或测试夹具中的等价 Buildr Web HTTP server）托管的构建产物，MUST NOT 将 Vite 开发服务器或 HMR 会话当作交付完成条件。

#### Scenario: 无远程字体或脚本
- **WHEN** 维护者审查重设计后的前端构建产物与 HTML 入口
- **THEN** 产物 MUST NOT 引用 CDN、googleapis 或其他远程字体/脚本主机
- **AND** 自定义字体（若有）MUST 仅通过同源 URL 加载

#### Scenario: 生产托管验收
- **WHEN** Task 或 Candidate 宣称 UI 重设计完成
- **THEN** 验收 MUST 在生产托管的 `web-dist` 上执行适用的 browser smoke 或 affected selector
- **AND** MUST NOT 仅以 Vite HMR 预览截图或开发服务器会话作为完成证据

### Requirement: Buildr Web 必须区分待办与正式执行 Task
Buildr Web Task 列表 MUST 默认使用 `open` 过滤，并 MUST 提供 `open`、`todo`、`active`、`completed`、`abandoned`、`all` 封闭选项及明确中文标签。页面 MUST 显示每条记录的真实 status，且 MUST NOT提供 todo 创建或激活入口。

#### Scenario: 默认进入 Task 列表
- **WHEN** 用户打开 Workspace Task 页面且未提供 status query
- **THEN** 页面 MUST 请求并显示 todo 与 active Task
- **AND** completed 与 abandoned MUST 仅在用户选择对应过滤时显示

#### Scenario: 查看 todo Task
- **WHEN** 用户打开 todo Task 详情
- **THEN** 页面 MUST 允许编辑顶层字段、无变更完成或放弃，并说明尚未进入正式执行
- **AND** Environment、Development 与 Finish 视图 MUST 不伪造任何占位事实

### Requirement: Buildr Web 必须展示复盘来源与承接关系
Task 概览 MUST 展示当前 Task 的复盘来源摘要；复盘 Tab MUST 展示以当前 Task 为来源的承接 Task 摘要及当前 status。展示 MUST 使用 Task Record/Retrospective Application read model，不得由 Web 客户端拼接全量 Task 列表。

#### Scenario: 查看复盘来源
- **WHEN** todo/active Task 具有一个或多个 retrospective source
- **THEN** 概览 MUST 显示可导航的 source Task ID、title 与 terminal status

#### Scenario: 查看复盘承接结果
- **WHEN** terminal Task 的复盘已关联一个或多个承接 Task
- **THEN** 复盘 Tab MUST 在原始报告和处置意见附近显示目标 Task ID、title 与当前 status
- **AND** 无承接关系时 MUST 显示明确空态而非隐藏原始复盘

### Requirement: Buildr Web 必须在全局壳层展示 GA 与 RC 更新
Buildr Web React 客户端 MUST 在全局顶部消费 Release Awareness API并展示 GA/RC 更新提示；提示 MUST 在全局与 Workspace 路由保持一致，不得由各页面重复实现。

#### Scenario: RC 可更新
- **WHEN** candidate 轨道高于当前安装
- **THEN** 全局提示 MUST显示当前版本与 RC 候选版本
- **AND** MUST提供复制 `buildr update --track candidate` 或交给 Agent 的动作

#### Scenario: GA 已发布且当前为 RC
- **WHEN** stable 轨道存在高于当前 prerelease 的 GA 版本
- **THEN** 全局提示 MUST说明 GA 已发布并提供 `buildr update --track stable`

#### Scenario: 用户处理提示
- **WHEN** 用户选择复制命令或交给 Agent
- **THEN** 客户端 MUST只生成或复制明确轨道的命令/prompt
- **AND** MUST NOT直接调用 npm 或创建 Workspace Task

#### Scenario: 无更新或查询失败
- **WHEN** 两个轨道都没有更高版本或 Release Awareness 暂不可用
- **THEN** 客户端 MUST不阻断主导航与页面内容

### Requirement: Buildr Web 壳层必须采用上下结构
Buildr Web App Shell MUST 使用顶栏承载品牌、主导航、工作空间切换、设置与（进入 Workspace 后的）交给 Agent，并将页面内容放在顶栏下方。壳层 MUST NOT 使用常驻左侧栏作为主导航。服务与文章的列表与详情 MUST 在同一顶栏下整页切换。任务页与项目页在宽屏 MUST 并排展示左侧列表与右侧详情（或空态），且 MUST 保持既有 `/tasks`、`/tasks/:taskId`、`/projects` 与 `/projects/:projectCode` 路由。项目详情右上角 MUST 提供编辑入口。视觉 token、Ant Design 5 与离线 CSP 边界 MUST 保持既有重设计约束。

#### Scenario: 顶栏承载主导航
- **WHEN** 用户在选定 Workspace 中打开 Buildr Web
- **THEN** 顶栏 MUST 展示任务、项目、服务、文章导航
- **AND** 工作空间切换器与设置 MUST 位于顶栏
- **AND** 页面主体 MUST 通栏展示当前路由内容

#### Scenario: 进入 Workspace 直接打开任务列表
- **WHEN** 用户查看顶栏主导航
- **THEN** MUST NOT 出现常驻“开始”导航项
- **AND** 进入可用 Workspace、点击品牌或切换当前工作空间 MUST 打开该 Workspace 的任务列表
- **AND** `/workspaces/:workspaceId/` 与 `/workspaces/:workspaceId/overview` MUST 重定向到任务列表

#### Scenario: 详情保持通栏
- **WHEN** 用户从服务或文章列表进入详情
- **THEN** 详情 MUST 替换通栏内容区
- **AND** MUST NOT 在壳层内同时并排显示该资源的列表与详情

#### Scenario: 任务页宽屏并排列表与详情
- **WHEN** 用户在宽屏打开任务列表或某条任务详情
- **THEN** 左侧 MUST 继续展示任务列表
- **AND** 右侧 MUST 展示对应详情，或在未选任务时展示空态
- **AND** `/tasks` 与 `/tasks/:taskId` 路由 MUST 保持不变

#### Scenario: 任务页窄屏避免横向溢出
- **WHEN** viewport 宽度为 390px 且用户打开任务详情
- **THEN** 详情 MUST 可见并可操作
- **AND** 页面主容器 MUST NOT 横向溢出
- **AND** 任务列表 MAY 暂时不与详情并排

#### Scenario: 项目页宽屏并排列表与详情
- **WHEN** 用户在宽屏打开项目列表或某个项目详情
- **THEN** 左侧 MUST 继续展示项目列表
- **AND** 右侧 MUST 展示对应详情，或在未选项目时展示空态
- **AND** 项目详情右上角 MUST 提供“编辑项目”操作
- **AND** `/projects` 与 `/projects/:projectCode` 路由 MUST 保持不变

#### Scenario: 项目页窄屏避免横向溢出
- **WHEN** viewport 宽度为 390px 且用户打开项目详情
- **THEN** 详情 MUST 可见并可操作
- **AND** 页面主容器 MUST NOT 横向溢出
- **AND** 项目列表 MAY 暂时不与详情并排

#### Scenario: 列表筛选保持一行
- **WHEN** 用户打开任务列表
- **THEN** 搜索与筛选控件 MUST 出现在标题下方的同一工具行
- **AND** MUST NOT 使用独立竖排筛选表单卡作为默认布局

### Requirement: Buildr Web Task 详情必须提供 UI Preview 视图
Buildr Web Task 详情 MUST 提供独立“预演”一级视图，按需读取当前 Task 关联 Change 中可发现的 UI Preview 页面，并 MUST 允许用户在多个页面之间选择和操作当前页面。页面 MUST 同时说明 UI Preview 是方案参考而非正式设计、生产原型或像素级验收标准。

#### Scenario: Task 存在多个预演页面
- **WHEN** 只读 API 返回两个或以上 UI Preview 页面
- **THEN** 预演视图 MUST 展示每个页面的标题、关联 Change 与 portable 相对路径
- **AND** 用户选择页面后 MUST 在同一 Task 详情中看到完整可交互页面

#### Scenario: Task 没有可发现预演稿
- **WHEN** Task 没有关联 Change、Change 暂不可用或关联 Change 中没有带标记 HTML
- **THEN** 预演视图 MUST 展示明确空态或诊断
- **AND** MUST NOT 改变 Task 状态或隐藏其他详情视图

### Requirement: UI Preview API 必须保持 Task-scoped 只读边界
本机 HTTP interface MUST 提供只读 Task-scoped UI Preview API，从 Task Record 的 Change 引用和 saved Environment current 解析 working Change。列表响应 MUST 只返回带 UI Preview 标记页面的不透明 ID、标题、lifecycle 与 portable 相对路径；具体 HTML MUST 只通过同一 Task 与已发现页面 ID 的专用响应读取。API MUST 忽略符号链接、未标记或超出安全读取边界的文件，MUST NOT 接受 filesystem path、写入 Task/Change 或提供任意文件 HTML 路由。

#### Scenario: 读取候选工作副本
- **WHEN** active Task 的 saved Environment current 指向可用候选 Change
- **THEN** API MUST 优先返回候选 working copy 中的带标记预演文件
- **AND** MUST NOT 用 retained baseline 覆盖候选内容

#### Scenario: Change 含有其他 HTML
- **WHEN** Task 关联 Change 同时含有未标记 HTML、符号链接或超限文件
- **THEN** API MUST 不返回这些文件内容
- **AND** 适用的跳过原因 MUST 以不泄露绝对路径的诊断表达

### Requirement: Buildr Web 必须隔离 UI Preview 可执行内容
Buildr Web MUST 在不含 `allow-same-origin` 的 sandbox iframe 中运行 UI Preview，仅允许页面自身 JavaScript 交互。页面内容响应 MUST 以 HTTP CSP 同时施加 `sandbox allow-scripts` 与离线资源策略，禁止网络连接、外部脚本/样式/字体、父页面访问与 Buildr session/API 权限；直接打开内容响应时 MUST 继续处于 opaque origin。客户端 MUST NOT 使用 `dangerouslySetInnerHTML` 或继承主页面脚本限制的 `srcdoc` 把预演内容注入 Buildr Web DOM。

#### Scenario: 预演稿包含交互脚本
- **WHEN** UI Preview HTML 使用内联 JavaScript 切换关键状态
- **THEN** iframe MUST 允许该页面内部交互正常运行
- **AND** 脚本 MUST 处于 opaque origin，不能读取父页面 DOM 或 Buildr session

#### Scenario: 预演稿引用远程资源
- **WHEN** HTML 尝试加载远程脚本、样式、字体、图像或发起网络请求
- **THEN** preview document CSP MUST 阻止该请求
- **AND** Buildr Web 主页面 MUST 保持可用

### Requirement: Task Intent 必须支持可点击的 Project 文档引用
Buildr Web MUST 以受限 Markdown 展示 Task Intent，并 MUST 允许用户点击指向当前 Task scope 内已登记 Project 的 Workspace 相对 `.md` 路径，在 Task 上下文中打开只读文档预览。客户端 MUST 根据 Project registry 的真实 source path 解析引用并复用 Project Document API；MUST NOT 从目录命名猜测 Project、读取绝对路径或获得任意 Workspace 文件访问能力。

#### Scenario: 查看任务引用的架构文档
- **WHEN** Task Intent 包含一个带用户可读名称、且路径位于 Task scope 内已登记 Project 的 Markdown 链接
- **THEN** 页面 MUST 将名称显示为可点击链接
- **AND** 点击后 MUST 展示文档正文、文档名称和 Project 相对路径

#### Scenario: 文档引用不可用
- **WHEN** Intent 链接不是 `.md`、不属于 Task scope 内已登记 Project、文件缺失或路径越界
- **THEN** 页面 MUST 显示明确的不可用提示
- **AND** MUST NOT 扫描 Workspace、改写 Intent 或尝试读取其他路径

#### Scenario: 继续浏览同一 Project 内的 Markdown 文档
- **WHEN** 用户在 Task 文档预览中点击当前文档的相对 `.md` 链接
- **THEN** 页面 MUST 使用同一 Project Document API 打开解析后的 Project 内文档
- **AND** 越出 Project 或非 Markdown 的链接 MUST 被拒绝

#### Scenario: Intent 仍由 Task Record 管理
- **WHEN** 用户编辑或读取含 Markdown 文档引用的 Intent
- **THEN** Task Record MUST 继续只保存原有 intent 字符串并保持既有 optimistic concurrency 与搜索语义
- **AND** 系统 MUST NOT 新增附件状态、Planning gate 或第二 Task writer
