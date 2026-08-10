# local-app-web-client Specification

## Purpose

Local App React 客户端源码位置、构建产物、本机 session adapter 与公共 API client 边界，以及与现网路由等价的行为完整性约束。

## Requirements

### Requirement: Local App 必须提供可扩展的 React Web 客户端并保持行为等价
Buildr Local App Web 客户端 MUST 以 React 实现，源码 MUST 位于 `product/buildr-web` Service 的前端工程根，并 MUST 通过构建产物由本机 Local App HTTP interface（归属 `product/buildr`）同源托管。用户可观察的**已挂载路由 path 与功能交互** MUST 保持等价，包括工作空间列表、开始/设置、任务列表与详情页签、Task-scoped Change、项目、服务、文章、Agent Action 抽屉、退出应用与 preview 身份条；视觉呈现、布局密度与动效 MAY 在经确认的 UI 重设计范围内变化，且 MUST NOT 被解释为对路由或功能交互等价的破坏。客户端 MUST NOT 直连 SQLite、manifest 或文件系统 path，MUST NOT create Task，也 MUST NOT 在页面内执行专业任务。

#### Scenario: 生产托管 React shell
- **WHEN** 用户通过 `buildr app`、已安装 npm CLI 启动的本机应用或官方/开发 launcher 打开 Local App
- **THEN** HTTP interface MUST 返回来自构建产物的应用 shell
- **AND** 页面 MUST 成功读取注入的本机 session meta 并加载同源静态资源

#### Scenario: 路由行为等价
- **WHEN** 用户访问既有 Workspace 深链或全局路由
- **THEN** React 客户端 MUST 渲染对应功能视图
- **AND** MUST NOT 要求用户学习新的 URL 方案作为 UI 重设计条件

#### Scenario: 产品边界保持
- **WHEN** 用户在 React Local App 中操作 Task、Project、Service 或 Agent Action
- **THEN** 页面 MUST 继续只维护允许的低风险 metadata 或生成 Agent prompt
- **AND** MUST NOT 创造第二套 Task writer 或绕过 Application

#### Scenario: 前端源码根位于 buildr-web
- **WHEN** 维护者检查 Local App React 源码位置
- **THEN** 权威源码根 MUST 为 `projects/product/services/buildr-web`
- **AND** MUST NOT 将 `projects/product/services/buildr/web` 继续作为权威前端源

#### Scenario: 视觉重设计不改变功能交互契约
- **WHEN** Local App 完成经确认范围的视觉/布局/动效重设计
- **THEN** 既有功能步骤（打开工作空间、浏览项目/服务/文章、查看任务与 Agent Action）MUST 仍可在相同路由 path 下完成
- **AND** MUST NOT 以外观或 class 名变化为由要求新的 API、session 或产品能力

### Requirement: Local App Web 客户端必须分离公共 API client 与本机 session adapter
Buildr Local App Web 客户端 MUST 将 HTTP JSON 调用封装为不依赖 DOM 的公共 API client，并 MUST 通过本机 session adapter 为写请求提供 `x-buildr-session`（及其他本机写保护所需信息）。公共 API client MUST 可在不绑定本机 meta session 的情况下描述请求形状，以便未来云端 auth adapter 替换；本能力 MUST NOT 实现云端认证、跨 Origin 写 API 或远程托管部署。

#### Scenario: 本机写请求使用 session adapter
- **WHEN** React 客户端发起写请求
- **THEN** 请求 MUST 经本机 session adapter 附带有效 session，并保持与当前应用 Origin 同源
- **AND** 缺少有效 session 或 Origin 不匹配时 MUST 在 Application mutation 前失败

#### Scenario: 云端扩展点不在本能力交付
- **WHEN** 维护者审查本能力的客户端分层
- **THEN** 设计与实现 MUST 保留可替换的 auth/session adapter 边界
- **AND** MUST NOT 交付云端登录、分域 CORS 写路径或远程静态托管作为本 Change 的完成条件

### Requirement: Local App Web 构建产物必须可在无开发前端工具链的环境中被服务
Buildr MUST 将 Local App Web 的发布所需文件定义为 `buildr` 内构建产物目录中的静态资产（由 `buildr-web` 构建输出消费而来）。运行 `buildr app`、launcher 或已安装 npm package 时，主机 MUST NOT 要求存在 Vite 开发服务器、可写的 `buildr-web` 前端源工程，即可托管并打开 Local App。

#### Scenario: 无 Vite 开发服务器仍可打开
- **WHEN** 环境仅有已构建的 web dist 与 Buildr CLI/runtime
- **THEN** Local App MUST 仍可通过 loopback HTTP 打开并完成 shell 级导航
- **AND** MUST NOT 依赖 `buildr-web` 源码目录中的开发依赖在运行时可用

### Requirement: Environment Tab必须展示Preparation来源与分层readiness
Local App Environment Tab MUST从Task Environment saved-current read model展示Plan来源、Project Declaration、scope、Recipe与Step状态、identity、最近观察、diagnostic和本次prepare执行事实。页面 MUST不把同一Step probe复制为多个scope事实。

#### Scenario: 多Service Receipt
- **WHEN** Receipt包含`buildr`与`buildr-web`两个Service Recipe
- **THEN** 页面 MUST分别展示两个Recipe及其Step状态
- **AND** 任一blocked MUST在Environment聚合结论中可见

#### Scenario: task-inline Receipt
- **WHEN** Plan来源为`task-inline`
- **THEN** 页面 MUST明确显示该来源没有长期Declaration
- **AND** MUST提供由Agent初始化Project声明的next action提示而不直接写文件

### Requirement: Task 详情必须展示协调计划与派生 Child 交付
Local App MUST在Task详情展示Parent Plan五类内容、Child identity/status、planned/delivered/extra/residual/superseded facts与final acceptance prerequisites；历史Task MUST显示不采用新模型的清晰空态。

#### Scenario: Child completed 但交付未证明
- **WHEN** read model返回completed Child和unproven Contribution
- **THEN** UI MUST分别显示Task已完成与Contribution未证明
- **AND** MUST NOT用完成图标暗示全部planned范围已交付

### Requirement: Local App 必须只提交显式协调动作
Local App MUST通过同一Application API提交reconciliation与final acceptance，不得自动创建/完成/abandon Child、自动改写Change或根据页面状态同步Parent Plan。

#### Scenario: 用户确认Parent reconciliation
- **WHEN** 用户基于current identity提交完整next Plan
- **THEN** UI MUST展示Application实际effects与新的identity
- **AND** 后续Child专业动作 MUST保持独立

### Requirement: Local App 必须展示统一与分专业 execution record 视图
Local App Task 详情 MUST 提供一个共享 execution record 浏览器，支持“全部”“Verification”“Finish”三种筛选并展示多次执行、失败、重试、outcome、lifecycle、resolution、target、producer、时间与正文状态。Verification Result 区块 MUST 提供进入 Verification 视图的入口，Finish current/terminal 区块 MUST 提供进入 Finish 视图的入口；所有入口 MUST 使用同一 API authority 与 record identity，MUST NOT 把 execution record outcome 表达为当前 Result 或交付事实。

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

### Requirement: Local App 必须按需展示受限正文
Local App Web MUST 在用户选择 record 后按需读取 detail，并只为 detail 声明的正文 filename 请求内容。Web MUST 展示 stored/response truncation、cleaned 或 unavailable 状态和 integrity failure diagnostic；MUST NOT 构造、显示或接受 locator、任意 path 或 cleanup action。

#### Scenario: 打开正文文件
- **WHEN** 用户选择 available record 的一个已声明 filename
- **THEN** Web MUST 请求 Task-scoped body-file API 并以文本预览显示返回内容
- **AND** MUST 标识任何 stored 或 response truncation

#### Scenario: 正文不可用
- **WHEN** record 已 cleaned、open、attention damaged 或 body read 失败
- **THEN** Web MUST 保留 metadata 可见并显示安全 diagnostic
- **AND** MUST NOT 尝试扫描或猜测正文路径

### Requirement: Local App UI 重设计必须遵守离线 CSP 与生产托管边界
Local App UI 重设计 MUST 仅修改 `product/buildr-web` 内的视觉、布局与动效实现，MUST 继续由 `product/buildr` 消费构建产物目录 `web-dist` 做同源托管，并 MUST 遵守既有离线 CSP：不得引入 CDN、远程字体或远程脚本。若使用自定义字体，字体文件 MUST 作为同源静态资产随构建产物提供。正式完成证据 MUST 来自 `buildr app`（或测试夹具中的等价 Local App HTTP server）托管的构建产物，MUST NOT 将 Vite 开发服务器或 HMR 会话当作交付完成条件。

#### Scenario: 无远程字体或脚本
- **WHEN** 维护者审查重设计后的前端构建产物与 HTML 入口
- **THEN** 产物 MUST NOT 引用 CDN、googleapis 或其他远程字体/脚本主机
- **AND** 自定义字体（若有）MUST 仅通过同源 URL 加载

#### Scenario: 生产托管验收
- **WHEN** Task 或 Candidate 宣称 UI 重设计完成
- **THEN** 验收 MUST 在生产托管的 `web-dist` 上执行适用的 browser smoke 或 affected selector
- **AND** MUST NOT 仅以 Vite HMR 预览截图或开发服务器会话作为完成证据
