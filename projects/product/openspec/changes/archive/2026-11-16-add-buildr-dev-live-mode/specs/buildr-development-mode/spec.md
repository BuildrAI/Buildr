## ADDED Requirements

### Requirement: buildr dev 必须同时运行四个服务的活版本

系统 MUST 提供一条 `buildr dev` 开发命令，同时运行 development profile 下的 `buildr` 宿主、`buildr-web`、`buildr-harness` 和 `buildr-harness-web`。前端 MUST 通过 Vite 开发服务器提供并在源码变化时热更新；`buildr` 后端 MUST 从源码运行并在变化时只重启宿主；`buildr-harness` 后端变化 MUST 只重建并切换其运行单元，不重启前端或宿主。开发模式 MUST 使用 development profile 的既有数据根，并 MUST NOT 生成交付证明或替代正式验证。

#### Scenario: 启动开发模式

- **WHEN** 用户在开发 checkout 执行 `buildr dev`
- **THEN** 系统 MUST 停止或拒绝无法认证的旧 development 实例，启动源码宿主、两个 Vite 开发服务器和 harness 监听
- **AND** MUST 打开同一个 Buildr Web 开发入口，页面会话与 `/api` 请求 MUST 正常工作

#### Scenario: 修改前端

- **WHEN** `buildr-web` 或 `buildr-harness-web` 的源码在开发模式运行中变化
- **THEN** 浏览器 MUST 通过热更新取得新页面，不需要重启宿主或 agent-service
- **AND** harness 页面 MUST 继续挂在 `/harness/`，其 API MUST 继续走同一开发宿主的 `/api`

#### Scenario: 修改 buildr 后端

- **WHEN** `buildr` 的源码在开发模式运行中变化
- **THEN** 只有开发宿主 MUST 重启，两个 Vite 开发服务器与 harness 运行单元 MUST 保持可用

#### Scenario: 修改 harness 后端

- **WHEN** `buildr-harness` 的源码在开发模式运行中变化
- **THEN** 系统 MUST 快速重建并切换 harness 运行单元，开发宿主和前端 MUST NOT 因此重启
- **AND** 若该变化需要新的宿主类型或契约，系统 MUST 明确提示重启开发模式或宿主，MUST NOT 静默使用不一致的接口

### Requirement: 开发模式必须与交付和预览隔离

开发模式 MUST NOT 改变全量交付激活、发布版页面、独立 Harness 页面或预览实例的行为。`buildr dev` MUST 只管理普通 development 实例，MUST NOT 扫描、停止、接管或删除任何预览实例及其数据。开发模式的会话注入与代理 MUST 只在 Vite serve 模式启用；预览候选的生产构建 MUST 继续使用原有构建路径。

#### Scenario: 预览实例正在运行

- **WHEN** 一个或多个预览实例正在运行，用户执行 `buildr dev`
- **THEN** 预览实例 MUST 继续使用自己的数据根、端口和候选产物
- **AND** 开发模式 MUST NOT 停止、替换或读取预览实例的运行状态

#### Scenario: 退出开发模式

- **WHEN** 用户结束 `buildr dev`
- **THEN** 系统 MUST 停止本次启动的宿主、Vite 服务和 harness 监听
- **AND** MUST NOT 删除预览实例、开发数据根或正式交付记录

#### Scenario: 预览候选构建

- **WHEN** 预览从任务工作树准备候选产物
- **THEN** 开发模式的 Vite 插件 MUST NOT 进入其生产构建
- **AND** 配置内容变化 MAY 使候选按现有摘要规则重新准备一次，但 MUST NOT 改变预览的产品行为

### Requirement: 开发会话只用于本机开发

两个 Vite 开发服务器 MUST 通过读取本机开发宿主页面取得会话，并 MUST 只在 serve 模式把会话注入开发页面。系统 MUST NOT 为此新增公开的令牌接口，MUST NOT 让发布版或独立 Harness 页面获得开发会话。

#### Scenario: 开发页面加载

- **WHEN** 浏览器访问开发模式的 Buildr Web 或 `/harness/` 页面
- **THEN** 页面 MUST 取得与当前开发宿主匹配的会话并正常调用 `/api`
- **AND** 打开预览或发布版页面 MUST NOT 复用该开发会话
