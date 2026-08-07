# local-app-web-client Specification

## Purpose

Local App React 客户端源码位置、构建产物、本机 session adapter 与公共 API client 边界，以及与现网路由等价的行为完整性约束。

## Requirements

### Requirement: Local App 必须提供可扩展的 React Web 客户端并保持行为等价
Buildr Local App Web 客户端 MUST 以 React 实现，源码 MUST 位于 `product/buildr` Service 的 `web/` 工程根，并 MUST 通过构建产物由本机 Local App HTTP interface 同源托管。迁移完成后，用户可观察的已挂载路由与交互 MUST 与迁移前行为等价，包括工作空间列表、开始/设置、任务列表与详情五页签、Task-scoped Change、项目、服务、文章、Agent Action 抽屉、退出应用与 preview 身份条。客户端 MUST NOT 直连 SQLite、manifest 或文件系统 path，MUST NOT create Task，也 MUST NOT 在页面内执行专业任务。

#### Scenario: 生产托管 React shell
- **WHEN** 用户通过 `buildr app`、已安装 npm CLI 启动的本机应用或官方/开发 launcher 打开 Local App
- **THEN** HTTP interface MUST 返回来自构建产物的应用 shell
- **AND** 页面 MUST 成功读取注入的本机 session meta 并加载同源静态资源

#### Scenario: 路由行为等价
- **WHEN** 用户访问迁移前已支持的 Workspace 深链或全局路由
- **THEN** React 客户端 MUST 渲染对应功能视图
- **AND** MUST NOT 要求用户学习新的 URL 方案作为迁移条件

#### Scenario: 产品边界保持
- **WHEN** 用户在 React Local App 中操作 Task、Project、Service 或 Agent Action
- **THEN** 页面 MUST 继续只维护允许的低风险 metadata 或生成 Agent prompt
- **AND** MUST NOT 创造第二套 Task writer 或绕过 Application

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
Buildr MUST 将 Local App Web 的发布所需文件定义为构建产物目录中的静态资产。运行 `buildr app`、launcher 或已安装 npm package 时，主机 MUST NOT 要求存在 Vite 开发服务器或可写的前端源工程，即可托管并打开 Local App。

#### Scenario: 无 Vite 开发服务器仍可打开
- **WHEN** 环境仅有已构建的 web dist 与 Buildr CLI/runtime
- **THEN** Local App MUST 仍可通过 loopback HTTP 打开并完成 shell 级导航
- **AND** MUST NOT 依赖 `web/` 源码目录中的开发依赖在运行时可用
