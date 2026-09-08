# Buildr Service

## 职责

Buildr Service 提供 npm CLI、本机 HTTP Host、Workspace/Task/Agent Assets/OpenSpec 等产品能力、SQLite/YAML 持久化、安装与 Doctor，以及构建、生成、验证和发布本 Service 的工程入口。

## 入口与运行时

- 开发 CLI：`projects/product/buildr`；PATH 上的 `buildr` 只代表 npm installation。
- npm 入口：`bin/buildr.mjs`，薄委托 `src/bootstrap/cli/main.ts`。
- 对象装配：`src/bootstrap/runtime.ts:createRuntime()`。
- 模块访问：`runtimeProvide(runtime, capability)`；CLI/HTTP/diagnostics 使用 contribution catalog。
- 本机 Web：`src/web/` 拥有实例、Preview、session、static files 和路由分发，不实现业务 handler。

生产 Runtime 不暴露扁平业务方法。命名能力和一次性 Binder 使依赖来源可追踪，同时避免 Task↔Change、Agent Assets↔Diagnostics 的装配循环。

## 产品模块

所有后端能力位于 `src/modules/`：

- `workspace/`：Workspace、Project、Service 和受管 mutation；
- `task/`：Task Record、Review、Verification、父任务协调和 Worktree；
- `task/change/`：Task scope 下的 Change 展示；
- `task/daily-progress/`：Git 提交主导、关联本地任务的每日演进；
- `openspec/`：通用 OpenSpec 读取、收敛、验证、条件写入和恢复；
- `agent-assets/`：Command、Rule、Skill、Component、Capability Binding 和 runtime projection；
- `project-testing/`：Project `verification.yml` 管理；
- `installation/`：npm installation、update、release awareness 和正式 Launcher；
- `diagnostics/`：Doctor 只读聚合；
- `publication/`：文章与资源读取。

内部层次按真实责任使用 Domain、Application、Persistence、Infrastructure 和 Interface。模块之间不能导入对方内部文件，只能消费模块入口提供的 capability、contribution 或 Binder。

## 数据

- Workspace identity 和 Project/Service registry：Workspace YAML/Manifest；
- Task、关系、Review、Verification：Workspace SQLite，同一 transaction context；
- Project daily progress：`.buildr/daily-progress/`；
- Agent Assets：源 Manifest/定义、Capability Graph 与可重建 runtime receipt；
- Project testing declaration：`projects/<project>/verification.yml`；
- OpenSpec：Project canonical specs、Change receipt/recovery；
- Installation：产品数据根与平台 Launcher binding。

所有非创建 Task 写入比较当前 digest。Workspace 多文件操作保留 management fence、mutation journal 与恢复；OpenSpec canonical 写入保留 projected validation、expected bytes、staging/rename 和恢复。

## 工程与交付边界

- `tools/codegen/contracts/`：从后端模块 Schema 生成前后端 DTO；
- `tools/build/launcher/`：Development Launcher 工程程序；
- `tools/release/`：Application Payload、Candidate 和发布工具；
- `test/verification/`：Buildr 自测选择、调度与资源协调；
- `resources/runtime/`：直接安装到 Agent runtime 的文件型源；
- `resources/workspace/`：同步到 Workspace/Project 的文件型源；
- `build/test-context/`：ignored 派生产物；`package/` 不再承载长期源码。

测试上下文（Test Context）在独立暂存目录编译，重复生成相同内容时保持现有文件不变，避免并行检查加载模块时出现目录被清空的窗口；内容变化采用逐文件原子替换。

Buildr 产品的 `project-testing` 模块只管理用户 Project 测试声明。Buildr 自身测试执行属于 `test/`/`tools/`，Task Verification Report 仍由 Task 模块唯一写入。

## Buildr Web 交接

后端业务模块提供 HTTP Schema 与 contribution；`tools/codegen/contracts/` 生成 Buildr Web 使用的 DTO。Web Host 负责 loopback session、安全请求、静态托管和分发。前端负责页面状态与交互，不直接读取 Workspace 文件或 SQLite。

## 运行与验证

开发和 Candidate 检查使用 Service 内 `tools/development/run-development-npm`，确保 Node.js `24.15.0`。主要验证包括 typecheck、unit/component/contract/integration/system、OpenSpec strict validation、架构边界、正式 Web build、browser suite、Application Payload 和 npm pack。

百万 Task 查询基准位于 `tools/performance/task-query-million.ts`，使用隔离数据，不进入默认回归。

## 局部术语

除下列 Service 局部术语外，当前不重定义 Project glossary；Project Testing、Task Verification、Diagnostics 与 OpenSpec 的长期边界继续以 Project 术语表为准。

- 技术运行时（Runtime）：Bootstrap 持有的平台技术对象和私有模块登记上下文，不是业务方法集合。
- 命名能力（Named Capability）：模块公开的窄端口，以稳定 capability id 被消费者获取。
- 贡献（Contribution）：模块交给 CLI、HTTP 或 Doctor Host 聚合的 Adapter/诊断项。
- 绑定器（Binder）：解决真实装配循环的一次性晚绑定端口，不允许替代正常单向依赖。

## 代码入口

- [全项目代码地图](../code-map/README.md)
- [Buildr 技术架构](../architecture/technical.md)
- [服务分层与模块组织](../../docs/architecture/service-architecture.md)
