# Buildr Product 源码布局

## Purpose

定义 Buildr Product 可执行入口、运行源码、测试验证、仓库脚本和交付资产的生命周期边界，以及源码分层和依赖方向。
## Requirements

### Requirement: Product 顶层目录必须按生命周期分离
Buildr Product Service MUST 使用 `bin/`、`src/`、`resources/`、`web-dist/`、`test/`、`tools/` 和 `docs/` 分别承载可执行入口、产品源码、文件型交付资源、正式 Web 构建产物、测试验证、checkout-only 工具和文档。`package/` MAY 仅保留具备明确后续 owner、理由和退出条件的 deferred 子树。

#### Scenario: 检查完成迁移的 Product checkout
- **WHEN** 架构 verifier 扫描 Product Service 顶层和 tracked files
- **THEN** `bin/`、`src/`、`resources/`、`web-dist/`、`test/`、`tools/` 和 `docs/` MUST 各自只包含其声明生命周期内的内容
- **AND** `package/` MUST 只包含明确 deferred allowlist 内的文件
- **AND** tracked source、test、package metadata、docs 和 active OpenSpec artifacts MUST NOT 引用已迁移的旧路径

### Requirement: Product 源码必须按职责和依赖方向分层
Buildr `src/` MUST 优先按真实业务或产品模块组织已迁移能力，并在模块内部使用 `domain/`、`application/`、`persistence/` 和 `interfaces/` 表达技术职责；跨模块平台能力与尚未迁移的能力 MAY 在渐进迁移期间继续位于明确的全局技术层。模块的每个技术层 MUST 默认扁平，并 MUST 由文件名表达具体能力；只有某项能力包含多个需要独立维护的私有协作者、构成真实子模块或存在明确实现分类时，才允许建立末级能力目录。Buildr MUST 保持接口调用应用用例、应用组合领域与持久化能力、纯领域模型不依赖 adapters 的显式边界，并 MUST NOT 为目录对称创建空层、单文件能力目录、重复实现或旧路径兼容 facade。

#### Scenario: CLI 或本机应用调用 Workspace 用例
- **WHEN** CLI、HTTP 或 Web adapter 读取或修改 Workspace
- **THEN** interface MUST 调用所属模块或现有 `application` 暴露的用例
- **AND** domain MUST NOT 导入 CLI、HTTP、Web、filesystem、process、runtime、persistence 或测试模块
- **AND** application MUST NOT 依赖具体 interface implementation

#### Scenario: 迁移带文件操作的旧领域 handler
- **WHEN** 旧模块同时包含用例编排、filesystem 读取或 mutation
- **THEN** 用例编排 MUST 进入所属模块的 application owner，而不是仅因旧目录名进入 `domain/`
- **AND** filesystem 或数据库映射 MUST 进入所属模块的 persistence，或继续使用具有明确跨模块职责的 infrastructure adapter
- **AND** Product MUST NOT 为目录对称创建没有真实模型职责的空 domain 层

#### Scenario: 架构 verifier 扫描 imports
- **WHEN** Product 验证检查全局技术层与模块内部的 `src/` import graph
- **THEN** verifier MUST 按文件的真实技术职责拒绝反向依赖、循环依赖和绕过 application composition 的跨模块隐式调用
- **AND** 诊断 MUST 标识违规 source 与 target module

#### Scenario: Task Record 作为首个纵向切片完成迁移
- **WHEN** 架构 verifier 检查 Task Record 的 Domain、Application、Persistence、CLI/HTTP Adapter 和模块注册入口
- **THEN** 这些实现 MUST 仅存在于 `src/task/` 的对应扁平技术层，并由 `src/task/module.mjs` 提供单一运行时注册入口
- **AND** `src/task/domain/record/`、`src/task/application/record/` 与 `src/task/persistence/record/` MUST 不存在
- **AND** 旧全局技术层 MUST NOT 保留 Task Record 实现、re-export 或兼容 facade
- **AND** Task Record 公开 CLI/HTTP/JSON、SQLite schema、事务、错误映射和唯一 writer MUST 保持不变

#### Scenario: 已迁移模块包含单文件末级目录
- **WHEN** 架构 verifier 在模块技术层中发现只包含一个能力文件的末级目录
- **THEN** 该目录 MUST 具有多个私有协作者、真实子模块或明确实现分类之一的可验证理由
- **AND** 无上述理由的文件 MUST 位于对应技术层根目录

### Requirement: 通用代码必须具有明确所有权
Buildr Product MUST 将 filesystem、process、network、runtime、CLI output、应用 ports 和领域公共原语放入对应职责目录，并 MUST NOT 建立顶层或 `src/shared/` 作为无语义公共依赖目录。

#### Scenario: 新增跨模块 helper
- **WHEN** 维护者增加被多个模块复用的 helper
- **THEN** helper MUST 根据其领域、应用、基础设施或 interface 语义进入明确 owner
- **AND** 架构 verifier MUST 在发现顶层或 `src/shared/` 时失败

### Requirement: 仓库脚本和测试不得成为产品运行时依赖
Buildr `tools/` 与 `test/verification/` MUST 只能作为开发、测试、分发或发布入口调用产品源码，`bin/` 和 `src/` MUST NOT 导入 `tools/`、`test/` 或 checkout-only dependencies。

#### Scenario: 从 npm tarball 执行产品命令
- **WHEN** 用户在不含 development checkout 的临时 prefix 安装 tarball 并运行代表性 `buildr` 命令
- **THEN** 命令 MUST 只使用 tarball 中的 `bin/`、`src/`、`resources/`、`web-dist/`、发布文档和明确 deferred 的 runtime assets
- **AND** 命令 MUST NOT 读取 `test/`、`tools/`、OpenSpec change 或仓库根外部文件

### Requirement: Project 产品切片必须遵守新源码分层
Buildr MUST separate Project Domain, Application, filesystem/Git Infrastructure and CLI/HTTP/Web Interfaces.

#### Scenario: Project Domain 保持纯净
- **WHEN** architecture verifier scans Project Domain imports
- **THEN** Domain MUST NOT import filesystem, YAML, Git process, HTTP, CLI, runtime, tests or repository implementations
- **AND** Domain MUST contain only Project entity, ProjectSource value object and pure validation

#### Scenario: Project Interfaces 读取和修改
- **WHEN** CLI, doctor, HTTP or Web handles Project data
- **THEN** interface MUST call Project Application use cases
- **AND** interface MUST NOT directly parse or write `projects/manifest.yml` or execute Git observation commands

#### Scenario: Project adapters 实现 ports
- **WHEN** Application reads/writes registry or queries actual Git state
- **THEN** filesystem repository MUST own path/YAML/atomic revision details and Git observer MUST own bounded process execution
- **AND** adapters MUST NOT decide editable field policy, migration authorization or diagnostic severity

### Requirement: Service 产品切片必须遵守新源码分层
Service 产品能力 MUST 将纯 Domain、Application、filesystem/Git Infrastructure 与 CLI/HTTP/Web Interfaces 分离。

#### Scenario: Domain 依赖检查
- **WHEN** 架构验证扫描 `src/domain/service`
- **THEN** Service Domain MUST NOT 导入 YAML、filesystem、Git、HTTP 或 CLI 模块

#### Scenario: Interface 读取 Service
- **WHEN** CLI、doctor 或 HTTP 读取或修改 Service
- **THEN** interface MUST 通过 Service Application 用例
- **AND** MUST NOT 新增直接解析 `services/manifest.yml` 的实现

### Requirement: Product Project 治理根与可执行 Service 根必须分离
Buildr自举Product MUST将治理资产保留在Product Project root，并 MUST将npm package、CLI、运行源码、测试、维护脚本和交付源资产放入已登记Buildr Service root。Product Project root MUST不以`task-environment.yml`或其他技术栈准备清单成为Environment Plan authority，并 MUST不包含`package.json`、`package-lock.json`、`node_modules`或编译器入口。

#### Scenario: 检查 Product Project root
- **WHEN** Agent、CI或release检查`projects/product/`
- **THEN** root MAY包含OpenSpec、docs、knowledge、Project/Service治理声明和薄`buildr`入口
- **AND** MUST不包含Project级Task Environment技术栈计划、npm metadata、node_modules、可执行产品源码或第二份Buildr实现

#### Scenario: Task Environment声明被误作Package root
- **WHEN** layout verifier发现`projects/product/task-environment.yml`
- **THEN** verifier MUST失败并说明Environment Plan由Agent按Task登记
- **AND** MUST不把该文件继续识别为package或Project治理authority

#### Scenario: 检测已废弃 package root 的遗留依赖
- **WHEN** 不含package metadata的`projects/product/`发现node_modules
- **THEN** verifier MUST失败并指出它是遗留依赖
- **AND** MUST不建议sync或doctor自动删除用户数据

#### Scenario: 检查 Buildr Service root
- **WHEN** verifier扫描`projects/product/services/buildr/`
- **THEN** 该目录 MUST是`@buildr-ai/buildr` package、运行源码、验证、维护脚本和交付源资产的唯一源码根
- **AND** Service root MUST提供Service-level `AGENTS.md`

#### Scenario: 从旧开发入口运行 Buildr
- **WHEN** 用户或Agent执行`projects/product/buildr`
- **THEN** 该入口 MUST作为薄兼容bridge调用Buildr Service的CLI
- **AND** bridge MUST不复制运行实现或建立第二份package root

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

### Requirement: 第二轮收敛后顶层生产职责必须全部有 owner
Buildr Service MUST将公共 contract 技术机制、release version、internal workflow route 与 Web HTTP 职责归入明确模块 owner；Bootstrap MUST只负责模块注册、依赖注入、进程入口与生命周期组合。没有独立 owner 的顶层 `src/application`、`src/domain`、`src/interfaces` 生产残留 MUST被删除。

#### Scenario: Bootstrap 进入 Task internal workflow
- **WHEN** Bootstrap 处理内部 Task workflow route
- **THEN** Bootstrap MUST通过 Task module 的公开组装入口调用
- **AND** MUST NOT直接导入 Task internal runner 或维护独立 route mapping

#### Scenario: 扫描最终生产源码布局
- **WHEN** architecture verifier 枚举 `src` 下生产文件
- **THEN** 每个文件 MUST归属 Bootstrap、Infrastructure 或明确业务模块
- **AND** 顶层 `application`、`domain`、`interfaces` MUST不存在生产文件

#### Scenario: 复核前三个 Child owner
- **WHEN** 最终收敛验证检查 Task Execution 与 Verification 路径
- **THEN** 生产实现 MUST继续位于已交付的 Task 与 Verification owner
- **AND** 本 Change MUST NOT恢复旧顶层实现或第二 writer

### Requirement: 退役任务模块不得保留人工源码或兼容转发
Task Development、Task Planning Identity、legacy Task Finish与Terminal Delivery的Domain、Application、Persistence、Interface、fixture、helper和专属测试 MUST直接删除。直接重写的Task Overview、Repository、HTTP契约与Web接口 MUST使用TypeScript单一人工源码；现有共享MJS组合与验证基础 MAY只移除退役依赖，MUST NOT通过仅修改扩展名伪装成已完成TypeScript迁移。

#### Scenario: 扫描生产与测试源码
- **WHEN** source layout verification扫描受影响路径
- **THEN** 退役模块 MUST没有`.mjs|.js|.ts`实现或兼容wrapper
- **AND** 直接重写的TypeScript源码 MUST没有同名MJS、`@ts-nocheck`、无边界`any`或掩盖职责边界的类型断言

#### Scenario: 构建Application Payload
- **WHEN** current TypeScript source生成CLI/runtime payload
- **THEN** 生成JavaScript与声明 MUST只作为构建产物
- **AND** MUST不形成第二人工源码或运行时TypeScript依赖

### Requirement: 迁移期兼容 Runtime 必须只覆盖仍存在的能力
迁移期compatibility port MUST具有明确owner、scope与退出条件，并 MUST不为已退役Task Development、Planning Identity、legacy Finish或Terminal Delivery保留转发、双读或双写。

#### Scenario: 保留能力仍通过兼容port读取Task Record
- **WHEN** Review、Verification、Retrospective或Environment尚未完成结构迁移
- **THEN** compatibility port MAY转发到唯一Task Record owner
- **AND** MUST不恢复已退役模块
