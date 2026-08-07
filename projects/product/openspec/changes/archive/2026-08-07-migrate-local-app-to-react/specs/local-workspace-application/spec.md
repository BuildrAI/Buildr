## MODIFIED Requirements

### Requirement: 本地应用写 API 必须使用最小安全边界
Buildr MUST 保护本地页面的写操作，避免其他网页或任意路径输入利用本地应用修改 Workspace。

#### Scenario: 合法同源写请求
- **WHEN** 写请求来自当前应用 Origin，携带有效 session token、JSON content type、允许大小的请求体和当前 revision
- **THEN** Buildr MUST 将请求交给对应 Application 用例

#### Scenario: 非法写请求
- **WHEN** 写请求缺少有效 session token、Origin 不匹配、content type 不合法、请求体超限或包含任意目标 path
- **THEN** Buildr MUST 在 Application mutation 前拒绝请求
- **AND** Workspace 文件 MUST 保持不变

#### Scenario: 离线静态资源
- **WHEN** 用户加载本地应用页面
- **THEN** 页面 MUST 使用 Buildr npm package（或等价 launcher bundle）内已包含的 Local App 构建产物静态资源
- **AND** MUST NOT 依赖 CDN、远程字体、远程脚本或远程图片
- **AND** MUST NOT 要求运行时从远程仓库拉取前端源码

## ADDED Requirements

### Requirement: Local App HTTP interface 必须托管构建产物并支持 SPA 深链
Buildr Local App HTTP interface MUST 从 Local App Web 构建产物目录提供 `index.html` 与静态资产，并 MUST 在注入本机 session token 与可选 preview identity 后返回 shell。对已登记 Workspace 的应用深链（非 `/api/`），当请求不是已声明的静态资产时，HTTP interface MUST 返回同一注入后的 `index.html`，以便 React Router 恢复路由。静态托管 MUST 限制为构建产物内可证明的资产，MUST NOT 递归托管任意未纳入产物清单的远程或用户路径。

#### Scenario: 深链恢复
- **WHEN** 用户直接打开 `/workspaces/<workspaceId>/tasks/<taskId>` 之类的 Local App 深链
- **THEN** HTTP interface MUST 返回注入 session 的构建产物 `index.html`
- **AND** 客户端 MUST 能够恢复对应 Task 详情路由

#### Scenario: API 与静态资源分离
- **WHEN** 请求路径以 `/api/` 开头
- **THEN** HTTP interface MUST 走既有 API 处理
- **AND** MUST NOT 将 API 请求回退为 `index.html`

#### Scenario: preview meta 保持
- **WHEN** Local App 以 preview 实例启动
- **THEN** 返回的 shell MUST 继续注入 preview identity 信息
- **AND** 页面 MUST 能显示 preview 身份条且不得改写 `Buildr Dev.app` identity
