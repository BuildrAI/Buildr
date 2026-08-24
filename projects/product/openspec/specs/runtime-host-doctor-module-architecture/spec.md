# runtime-host-doctor-module-architecture Specification

## Purpose

定义 Web HTTP 公共宿主、System Doctor、模块 contributions 最终装配与遗留运行时退出的结构和行为等价约束。

## Requirements

### Requirement: Web HTTP 公共宿主必须归属 Web 模块
Buildr MUST 将 Node.js HTTP Server、Router dispatch、Session、Origin 与 request 安全边界、bounded read worker 以及 `web-dist` 静态托管实现放在 `src/web/http/`，并由 `web/module.mjs` 通过窄入口接入 Bootstrap。公共 HTTP 宿主 MUST 只处理通用协议与托管职责，业务请求 MUST 分发给所属模块提供的 HTTP contribution，不得在宿主内重新实现业务 Repository、Mapper、状态规则或 writer。

#### Scenario: 启动默认或 Preview Web 实例
- **WHEN** Web 实例生命周期 Application 请求启动 Buildr Web Server
- **THEN** Web 模块 MUST 使用同一 `web/http` Host 启动 loopback Server，并保持端口、实例 Secret、Session、Preview identity、静态资源和关闭行为等价

#### Scenario: 分发业务 HTTP 请求
- **WHEN** 公共 Host 收到属于 Task、Workspace 或其他业务模块的请求
- **THEN** Host MUST 调用该模块注册的 HTTP contribution，并且 MUST NOT直接读写该模块的业务存储

### Requirement: System Doctor 必须聚合只读诊断能力
Buildr MUST 将 Doctor 的用例、结果模型和诊断适配放在 `src/system/doctor/`，并通过 `system/doctor/module.mjs` 注册 Doctor CLI/Application 能力。Doctor MUST 优先消费所属模块公开的 Diagnostic contribution 或 Read Model；只有连接、schema、migration、checksum、文件、进程和安装等物理健康检查可以直接消费相应技术适配。Doctor MUST保持只读，不得取得任何业务 writer authority。

#### Scenario: 执行全 Workspace Doctor
- **WHEN** 用户执行既有 `buildr doctor` 命令
- **THEN** System Doctor MUST 聚合已安装模块的诊断贡献并返回与迁移前等价的 finding、health、repair plan、JSON 和退出状态

#### Scenario: 诊断业务语义
- **WHEN** Doctor 检查 Task、Workspace、Agent Assets 或其他模块拥有的业务状态
- **THEN** Doctor MUST 复用该模块提供的 Diagnostic/Read Model，不得复制 SQL、Row Mapper 或业务状态推导

### Requirement: Bootstrap 必须完成最终显式装配并退出遗留入口
Bootstrap MUST 按依赖顺序显式安装 Infrastructure、业务模块、Web HTTP Host 与 System Doctor，且每个 capability、HTTP contribution、Diagnostic contribution 和 writer MUST只有一个 owner。完成迁移后 MUST 删除 `legacy-runtime-module`、旧 `interfaces/local-app/http` 业务路由和已无消费者的临时 Facade；不得保留第二套连接、事务、读写实现或扫描式动态注入。

#### Scenario: 创建 Runtime
- **WHEN** Bootstrap 创建 Buildr Runtime 并读取 module snapshot
- **THEN** 所有运行能力 MUST来自显式 module/Bootstrap 注册且依赖无环，snapshot MUST不包含 legacy module 或重复 contribution

#### Scenario: 检查旧入口
- **WHEN** 结构契约和迁移台账检查已完成的 Runtime Host、Doctor 与遗留退出路径
- **THEN** 旧 HTTP Host、legacy runtime registration 和无 owner Facade MUST不存在，所有 consumer、测试与 Application Payload MUST指向新入口

### Requirement: 迁移必须保持外部行为、数据与发布物等价
本迁移 MUST保持公开 CLI、HTTP method/path/status/JSON、Session 与安全响应头、SQLite schema、migration 顺序/checksum、事务、锁、CAS、幂等、原子性、Web 端口/实例复用/Preview、Doctor finding、业务 writer authority 和发布物逻辑资源身份不变。`buildr-web` MUST继续拥有 React/Vite 前端源码与正式构建，Buildr Service MUST只消费、打包并同源托管 `web-dist`。

#### Scenario: 验证开发和发布形态
- **WHEN** 测试分别从 development checkout、Application Payload 和 npm/package candidate 启动或检查 Buildr
- **THEN** CLI、HTTP、Doctor、静态托管与资源解析 MUST保持等价，且 `web-dist` 与 read worker MUST仍被正确交付

#### Scenario: 验证写入唯一性
- **WHEN** 迁移后运行 writer、循环依赖和存储边界契约检查
- **THEN** 每类业务写入 MUST仍由原所属模块的唯一 Repository/Application 执行，Web HTTP Host 与 System Doctor MUST不产生业务写入
