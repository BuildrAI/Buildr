## ADDED Requirements

### Requirement: Bootstrap 必须拥有进程入口与模块组装
Buildr Service MUST 保持 `bin/buildr.mjs` 为稳定薄入口，并 MUST 由 `src/bootstrap/` 唯一拥有 Runtime composition、公共 CLI Host、命令目录合并、Help、进程级诊断和分发。Application 与业务 Interface 层 MUST NOT 再拥有全局 composition root。

#### Scenario: 从 npm executable 启动普通 CLI
- **WHEN** 用户通过开发 checkout、npm tarball 或 Application Payload 执行 `buildr` 命令
- **THEN** `bin/buildr.mjs` MUST 只委托 `src/bootstrap/cli/main.mjs` 并保留最外层失败兜底
- **AND** Bootstrap MUST 创建同一组模块与公共 CLI Host后分发命令
- **AND** 普通命令的帮助、输出、错误码、退出码和完成后退出行为 MUST 保持等价

#### Scenario: 启动 Buildr Web
- **WHEN** 用户执行 `buildr web`
- **THEN** 公共 CLI Host MUST 在同一 Node.js 进程中完成模块组装和 Web command分发
- **AND** Bootstrap MUST NOT 创建第二个 CLI Host或改变现有 HTTP Server、端口、Session、安全和实例生命周期语义

### Requirement: 模块必须通过显式窄合约参与组装
每个已迁移业务模块 MUST 通过根部 `module.mjs` 提供稳定 closed descriptor，显式声明有名称的 `requires`、`provides`、CLI/HTTP/diagnostic contributions和可选 lifecycle。Bootstrap MUST 显式选择依赖并装配模块，模块 MUST NOT 通过扫描、导入副作用或任意全局 Runtime lookup取得能力。

#### Scenario: Bootstrap 创建 Task Record 模块
- **WHEN** Bootstrap 装配 Task Record
- **THEN** `src/task/module.mjs` MUST 只接收 Structured Workspace Store、Project/Service Reader、Change Resolver、operation memoizer和适用的 Parent Coordination Reader等已声明依赖
- **AND** 模块 MUST 提供唯一 Task Record Application API、当前兼容所需的窄 Persistence Read Port及自身 CLI/HTTP contributions
- **AND** Bootstrap、CLI Host与HTTP Host MUST NOT 直接导入 Task Record内部 Application或Persistence实现

#### Scenario: 模块声明无效
- **WHEN** 两个模块或 contributions使用重复identity、required依赖缺失、descriptor包含非法字段或 lifecycle 不完整
- **THEN** Bootstrap MUST 在执行业务命令或启动长期资源前 fail closed
- **AND** 诊断 MUST 标识冲突模块、capability或contribution identity

#### Scenario: 模块拥有生命周期资源
- **WHEN** 一个模块提供真实 `start` 与 `stop` lifecycle
- **THEN** Bootstrap MUST 按确定性注册顺序启动模块并按逆序停止
- **AND** 启动中途失败时 MUST 只逆序释放已经成功启动且由本次Bootstrap拥有的资源

### Requirement: 模块 Interface 必须由所属模块贡献
模块特有 CLI参数、DTO、输出、错误映射与HTTP Controller MUST 由所属模块 Interface持有并通过模块公开入口贡献；公共Host只合并、校验和分发 contributions，MUST NOT复制业务 Adapter或建立第二份命令/路由目录。

#### Scenario: 注册 Task Record CLI命令
- **WHEN** Bootstrap构建统一 `COMMAND_CATALOG`
- **THEN** `task create|inspect|update|activate|complete|abandon` descriptors MUST来自Task模块公开入口
- **AND** Help、unknown-command candidates与Dispatch MUST继续消费同一合并目录
- **AND** Task Record CLI Adapter MUST调用同一Task Record Application API

#### Scenario: 分发 Task Record HTTP请求
- **WHEN** Buildr Web HTTP Host收到Task列表、详情、更新、完成或放弃请求
- **THEN** Host MUST通过已注册Task HTTP contribution分发请求
- **AND** Task HTTP Adapter MUST调用同一Task Record Application API
- **AND**公开HTTP path、method、DTO、授权、响应与错误映射 MUST保持等价

### Requirement: 迁移期兼容 Runtime 必须有界且可退出
尚未迁移能力 MAY 暂时使用由Bootstrap唯一拥有的兼容 Runtime Facade，但该Facade MUST只投射同一真实实现、记录owner、适用调用者与退出条件，并 MUST NOT形成第二实现、第二writer、双读或双写。新的模块化实现 MUST NOT新增对宽Runtime的业务依赖。

#### Scenario: 旧Task能力读取Task Record
- **WHEN** 尚未迁移的Task Development、Review、Verification、Retrospective、Finish或Environment能力读取Task Record
- **THEN** 兼容Facade MAY投射Task Record Application API或已确认的窄Persistence Read Port
- **AND** 调用 MUST仍落到同一Task Record Repository、SQLite连接、事务和writer authority
- **AND** 架构验证 MUST拒绝基线清单之外新增的宽Runtime消费者

#### Scenario: 后续能力完成模块迁移
- **WHEN** 对应Parent Contribution已交付并为原调用者提供模块公开Application或Read Port
- **THEN** 该调用者 MUST退出兼容Facade
- **AND** 最终 `legacy-exit-and-conformance`验收 MUST删除无剩余owner或无退出条件的Facade
