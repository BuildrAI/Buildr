## ADDED Requirements

### Requirement: Web HTTP Host 必须按职责拆分
Buildr Web HTTP MUST保留 `server.mjs` 作为唯一 server lifecycle/组装入口，并 MUST将请求路由、session/request security、静态资源处理和 response mapping 拆为独立窄模块。拆分后的依赖 MUST从 server 单向指向这些模块，router MUST不拥有 listen、Secret 生成或 resource cleanup。

#### Scenario: 创建本机 Web Server
- **WHEN** Web module 调用 `createLocalWorkspaceServer`
- **THEN** server MUST生成或接收 session/instance secret、创建 loopback HTTP server、管理 listen/close 与 read executor 生命周期
- **AND** route 实现 MUST由独立 router 执行

#### Scenario: 架构验证职责边界
- **WHEN** architecture verifier 检查 `src/web/http`
- **THEN** router、session/request security、static files 与 responses MUST具有独立 owner 文件
- **AND** `server.mjs` MUST不重新内联这些职责

### Requirement: Web HTTP 拆分必须保持安全与响应行为
结构迁移 MUST保持现有 Session token、Origin、JSON content type、32 KiB body limit、instance Secret、loopback bind、静态路径穿越防护、CSP/安全 headers、shutdown、route order、HTTP status/body 与 error mapping 行为等价。

#### Scenario: 非法写请求
- **WHEN** 写请求缺少匹配 Origin/session、使用非 JSON content type、body 超限或提交禁止路径字段
- **THEN** Host MUST在 Application mutation 前返回与迁移前相同的 status、error code 和 response envelope

#### Scenario: 静态资源与 App Shell
- **WHEN** 客户端请求 App Shell、合法 dist asset、缺失资源或路径穿越输入
- **THEN** Host MUST保持 index 注入、content type、CSP、安全 header、404 与拒绝行为等价

#### Scenario: health 与 shutdown
- **WHEN** 客户端以正确或错误 instance Secret 访问 health/quit-instance，或以 session 写请求退出应用
- **THEN** Host MUST保持 Secret 校验、ready/stopping 状态、202/403/503 响应、server close 与 onShutdown 行为等价

#### Scenario: HTTP contribution 顺序
- **WHEN** top-level 或 workspace-scoped contribution 匹配请求
- **THEN** router MUST按迁移前顺序调用 contribution
- **AND** Task query guard、fallback 404 与 API error mapping MUST保持等价
