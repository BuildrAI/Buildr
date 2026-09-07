## MODIFIED Requirements

### Requirement: Web HTTP 公共宿主必须归属 Web 模块
Buildr MUST 将 Node.js HTTP Server、Router dispatch、Session、Origin 与 request 安全边界、bounded read worker 以及 `web-dist` 静态托管实现放在 `src/web/http/`，并由 `web/module.ts` 通过窄入口接入 Bootstrap。公共 HTTP 宿主 MUST只处理通用协议、查询解析、贡献分发与托管职责；所有业务路径、参数合法性和错误映射 MUST由所属 `src/modules/*/interfaces/http` contribution 处理，不得在公共 Router 中出现 Task、Workspace、Agent Assets、Installation、Publication 或 OpenSpec 特判。

#### Scenario: 启动默认或 Preview Web 实例
- **WHEN** Web 实例生命周期 Application 请求启动 Buildr Web Server
- **THEN** Web 模块 MUST 使用同一 `web/http` Host 启动 loopback Server，并保持端口、实例 Secret、Session、Preview identity、静态资源和关闭行为等价

#### Scenario: 分发业务 HTTP 请求
- **WHEN** 公共 Host 收到属于某业务模块的请求
- **THEN** Host MUST调用该模块注册的 HTTP contribution
- **AND** 业务 contribution MUST拥有路径、查询/请求参数、DTO和错误映射
- **AND** Host MUST不直接读写业务存储或返回业务特有参数诊断

### Requirement: System Doctor 必须聚合只读诊断能力
Buildr MUST 将 Doctor 的用例、结果模型和诊断 Interface 放在 `src/modules/diagnostics/`，并通过 `modules/diagnostics/module.ts` 注册 Doctor CLI/Application 能力。Diagnostics MUST优先消费所属模块公开的 Diagnostic contribution 或 Read Model；只有连接、schema、migration、checksum、文件、进程、网络和安装等物理健康检查可以直接消费相应技术 capability。Diagnostics MUST保持只读，不得取得任何业务 writer authority。

#### Scenario: 执行全 Workspace Doctor
- **WHEN** 用户执行既有 `buildr doctor` 命令
- **THEN** Diagnostics 模块 MUST聚合已安装模块的诊断贡献并返回与迁移前等价的 finding、health、repair plan、JSON 和退出状态

#### Scenario: 诊断业务语义
- **WHEN** Doctor 检查 Task、Workspace、Agent Assets、Project Testing 或其他模块拥有的业务状态
- **THEN** Diagnostics MUST复用该模块提供的归一化 Diagnostic/Read Model
- **AND** MUST不复制 SQL、Manifest Mapper、capability binding、runtime adapter 或业务状态推导规则
