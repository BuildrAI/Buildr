## MODIFIED Requirements

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

## ADDED Requirements

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
