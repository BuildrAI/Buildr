## Context

当前 `bin/buildr.mjs` 委托 `src/interfaces/cli/main.mjs`，后者再加载同时持有命令目录、Runtime 创建、Web/Launcher 注册、Help 与分发的全局 Registry。`src/application/compose-runtime.mjs` 以 56 个顺序注册函数构造宽 `runtime` 对象；Task Record 虽已位于 `src/task/`，其 `module.mjs` 仍通过修改该全局对象完成注册，中央 CLI Registry 与 Web HTTP Host也直接导入 Task Record Adapter。

本 Change 不改变业务或协议，只把相当于 Java `SpringApplication + ApplicationContext + Module @Configuration` 的职责收敛到 Bootstrap。其主要约束是：现有大量生产消费者和测试仍依赖 `createRuntime()` 的宽方法表，不能在同一 Child 中迁移所有能力；Task Record 则必须成为首个真正通过窄模块入口装配的参考实现。

## Goals / Non-Goals

**Goals:**

- 让 `bin/buildr.mjs` 只依赖 `src/bootstrap/cli/main.mjs`，由 Bootstrap 拥有进程级 CLI Host 与组装。
- 建立显式、可验证的模块 `id / requires / provides / contributions / lifecycle` 合约。
- 让 Task Record 在模块内部用窄依赖创建 Persistence 与 Application，并贡献自身 CLI/HTTP Adapter。
- 保留当前宽 Runtime 调用表的行为兼容，同时将兼容桥限制在 Bootstrap、记录 owner 和退出条件，并禁止新模块依赖它。
- 证明命令目录、Help、错误、普通 CLI 退出、Web 同进程托管、npm package 与 Application Payload 行为等价。

**Non-Goals:**

- 不迁移 Task Environment、Development、Review、Verification、Finish 等其余 Task 能力。
- 不迁移 Web Runtime、HTTP Server、Workspace、Agent Assets、System 或 Infrastructure 的正式模块目录。
- 不修改 CLI/HTTP/JSON、SQLite schema、migration、事务、状态机、错误映射或 writer authority。
- 不引入自动扫描、反射式 DI、容器框架、第二 Runtime 或长期双实现。

## Decisions

### 1. Bootstrap 成为唯一 Composition Root

建立 `src/bootstrap/runtime.mjs` 和 `src/bootstrap/cli/`。现有 `createRuntime()` 的生产行为迁入 Bootstrap；所有生产源码、测试和验证入口改用新路径，删除 Application 层的 composition owner。`bin/buildr.mjs` 保持原 npm executable 身份，只更新内部 import。

选择显式 ESM composition，而不是引入 DI 框架：当前模块数量和依赖规模不需要扫描或装饰器，显式装配更容易审查唯一 writer、顺序和循环依赖。

### 2. 模块合约采用 closed descriptor 与显式工厂

Bootstrap 的模块 registry 接受稳定 descriptor：

- `id`：唯一模块名称；
- `requires`：有名称的窄依赖集合，由 Bootstrap 显式选择并传入；
- `provides`：带 namespace 的 Application/Read Port 等能力；
- `contributions.cli/http/diagnostics`：由 Host 消费的接口贡献；
- `lifecycle.start/stop`：可选生命周期，按注册顺序启动、逆序停止。

Registry 在产生可执行应用前拒绝重复模块名、重复 provide identity、重复 CLI/HTTP contribution identity、缺失依赖和非法 lifecycle。模块不通过全局扫描、导入副作用或任意 Runtime lookup 取得能力。

### 3. Task Record 在私有组装对象中复用现有已验证实现

`createTaskModule(requires)` 只接收 Task Record 当前真实依赖：Structured Workspace Store、Project/Service Reader、Change Resolver、Workspace operation memoizer和可选 Parent Coordination Reader。模块在私有对象中注册现有 Persistence 与 Application，再只导出明确的 Application API、兼容期只读 Persistence Port、CLI contribution、HTTP contribution和 Task ID pattern。

本 Change 不顺便重写已通过验证的 Task Record 规则、SQL 或事务。后续如果需要把内部注册函数进一步改成 class/factory，可作为 Task capability 的独立实现细化；对 Bootstrap 而言，私有组装对象已经消除任意全局 Runtime 依赖。

### 4. 单一 Bootstrap Compatibility Facade 保持未迁移消费者可用

Bootstrap 将 Task Record 的公开 Application API和当前确有消费者的窄 Persistence Read Port投射回兼容 Runtime 方法表。其他尚未迁移能力继续由一个 `legacy-runtime-module` 执行原有注册顺序。

兼容 Facade 的 owner 是 `bootstrap-and-module-contracts` Contribution；适用范围仅为本 Change 基线中已存在的调用者，架构 verifier 拒绝新增业务依赖。退出条件是对应 Task、Workspace、Agent Assets、Web 和 System Contributions 完成模块迁移，最终由 `legacy-exit-and-conformance` 移除。Facade 不复制实现、不开第二数据库、不形成双读双写。

### 5. CLI 与 HTTP Host 消费模块 contribution

Task Record 六个 CLI descriptor 移出中央命令定义，继续与其他命令合并为唯一 `COMMAND_CATALOG`；Help、候选提示和 Dispatch 仍消费同一目录。Task Record CLI Adapter 改为接收明确 Application API。

Web HTTP Host 不再直接导入 Task Record HTTP Adapter，而是调用 Bootstrap 已组装的 HTTP contribution dispatcher；Task Record HTTP Adapter同样接收明确 Application API。HTTP Server 的目录、Session、安全、实例生命周期和静态托管不在本 Change 中迁移。

### 6. Lifecycle 先形成可执行合约，不虚构业务资源

模块 registry 实现并测试同步或异步 `start/stop`、失败回滚和逆序释放。Task Record 当前没有长生命周期资源，因此不提供空 hook；Web Server 仍由现有 Web 命令和 Node event loop持有。后续 Web/System 模块只能通过该合约贡献真实 lifecycle，不另建第二套 Host。

## Risks / Trade-offs

- [宽 Runtime 仍暂时存在] → 只保留一个 Bootstrap Facade、建立基线调用者清单并由 verifier 拒绝新增；后续 Contribution 按 owner 退出。
- [移动公共入口会影响大量测试和发布路径] → 原子更新全部 import、Verification ownership、tarball/Application Payload 检查，并执行 focused、affected 和正式交付验证。
- [模块 contribution 与旧中央 Registry 可能重复] → Registry 在启动前按稳定 identity 检查重复，Task Record 旧 descriptor 同步删除。
- [异步 lifecycle 可能改变普通命令退出] → 当前生产模块没有 lifecycle hook；使用专门 contract test验证启动、失败回滚和停止，不改变现有命令的进程持有者。
- [HTTP Host 仍依赖兼容组合结果] → 只把路由注册改为 contribution dispatcher，不迁移 Web 实现；由后续 Web Runtime Child 删除兼容连接。

## Migration Plan

1. 建立 module contract/registry 与 Bootstrap Runtime，先保持旧注册顺序和现有行为。
2. 将公共 CLI Host 文件和 `bin` 委托迁入 Bootstrap，更新全部生产与测试 import。
3. 将 Task Record 改为窄模块工厂，并接入 CLI/HTTP contributions 与唯一兼容 Facade。
4. 更新架构 verifier、Verification selector、CLI current knowledge和技术架构台账。
5. 运行 focused、Task Record、CLI、Web、npm tarball/Application Payload与 affected验证；失败时回退本 Change 的目录和组装改动，不涉及数据迁移或持久状态回滚。

## Open Questions

无。本 Change 中不决定后续模块的业务拆分顺序，也不决定最终移除宽 Runtime 的具体 Child 数量。
