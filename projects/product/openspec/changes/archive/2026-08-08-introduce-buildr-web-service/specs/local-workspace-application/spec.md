## ADDED Requirements

### Requirement: Local App 静态资源托管必须继续归属 buildr 且不因前端 Service 拆分改变安全模型
在 `buildr-web` 拥有前端源码后，Buildr MUST 继续由 `product/buildr` 的 Local App HTTP interface 在 loopback 上同源托管已纳入的构建产物。写保护 MUST 继续要求当前应用 Origin、有效 session token 与 JSON content type。拆分 MUST NOT 引入分域 CORS 写路径、远程 CDN 静态依赖，或要求运行时读取 `buildr-web` 源码树。

#### Scenario: 拆分后仍同源托管 dist
- **WHEN** 用户通过 `buildr app`、已安装 npm package 或 launcher 打开 Local App
- **THEN** 页面 MUST 使用 `buildr` 内已包含的 Local App 构建产物静态资源
- **AND** MUST NOT 依赖 CDN、远程字体、远程脚本或远程图片
- **AND** MUST NOT 要求运行时从 `buildr-web` 或其他远程位置拉取前端源码

#### Scenario: 拆分后写保护不变
- **WHEN** 写请求来自当前应用 Origin，携带有效 session token、JSON content type、允许大小的请求体和当前 revision
- **THEN** Buildr MUST 将请求交给对应 Application 用例
- **AND** Origin 不匹配或缺少有效 session 时 MUST 在 Application mutation 前拒绝
