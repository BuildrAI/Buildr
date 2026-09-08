## ADDED Requirements

### Requirement: Buildr Web 剩余页面必须按完整功能归位
Buildr Web MUST将 Publication 页面与能力级 client 归入 `features/publication`，将 Settings/Release Awareness 交互归入 `features/installation`，将 Task-scoped Change 页面归入 `features/task`。`src/pages` MUST不再长期保存已有明确功能 owner 的页面；App 壳 MUST只拥有路由、布局、导航、Workspace 上下文与跨页抽屉装配。

#### Scenario: 扫描前端路由与依赖
- **WHEN** 前端架构验证扫描 `App.tsx`、`app`、`features`、`api` 与 `pages`
- **THEN** 每个业务页面 MUST从所属 feature 导入
- **AND** 通用 `api` MUST只保留 transport/session/workspace state 或尚无 feature owner 的公共边界
- **AND** 页面路由、URL、文案语义与稳定 DOM `id`/`data-*` MUST保持兼容

#### Scenario: 壳层显示版本提醒
- **WHEN** Release Awareness 返回可提示更新
- **THEN** Installation feature MUST拥有数据读取、命令文案和交互组件
- **AND** App 壳 MUST只装配该组件，不得取得 update writer 或第二份安装状态

### Requirement: 前后端与项目级测试必须按证明对象维护
Buildr Web Service MUST拥有前端渲染、交互、状态、client 与纯逻辑测试；Buildr Service MUST拥有后端业务、数据、协议、会话、进程、安装及公共宿主测试；真实前后端组合的完整流程 MUST作为 Product 端到端测试由项目验证入口维护。物理测试目录 MAY由最终工程结构决定，但每个测试的断言 owner MUST唯一。

#### Scenario: 运行前端与 Browser 验证
- **WHEN** 本次迁移运行前端 test/build 与生产托管 Browser smoke
- **THEN** 前端单元断言 MUST从 buildr-web Service 运行
- **AND** 跨服务 Browser smoke MUST使用 buildr 正式托管的 `web-dist`
- **AND** 同一行为 MUST不因文件名含 `web` 被机械复制为两套测试
