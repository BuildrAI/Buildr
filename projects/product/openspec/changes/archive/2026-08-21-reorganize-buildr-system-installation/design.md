## Context

Installation 相关职责当前横跨 `src/application`、`src/infrastructure/product-identity`、`src/infrastructure/product-launcher`、`src/interfaces/cli`、Bootstrap CLI 与 release payload entry。Bootstrap 通过 `legacy-runtime-module.mjs` 注册 update/status，CLI registry 单独追加 Launcher commands，Web Runtime 和 payload lifecycle 则直接 import identity、binding 与 enrollment 实现。这些入口共享同一正式 installation ownership 语义，却没有统一模块 owner。

本切片处于 Infrastructure 与 Web 实例生命周期迁移之后，必须保留既有 public CLI/JSON、npm/development channel、Host Node/package binding、原子 Launcher 更新与 Application Payload 行为。Doctor、HTTP Server、Web 生命周期策略及 npm 发布仍由其他能力负责。

## Goals / Non-Goals

**Goals:**

- 建立扁平分层的 `src/system/installation/{application,infrastructure,interfaces}` 与唯一 `module.mjs`。
- 让 Bootstrap 通过 Installation module 注册 update/status/Launcher CLI，并向 Web、Bootstrap identity 与 payload lifecycle 提供窄公开端口。
- 迁移完成后删除旧 Installation 专属入口，避免同一身份、registry、binding 或 Launcher 操作存在第二实现。
- 同步更新 imports、Application Payload、Verification owner 和测试路径，证明外部行为与发布形态等价。

**Non-Goals:**

- 不迁移或重构 Doctor。
- 不修改 Web HTTP Server、Router、Session、安全边界、静态托管或实例生命周期策略。
- 不修改 npm package publication、release orchestration 或前端源码。
- 不改变任何公共 schema、状态、端口、ownership、原子写入、错误或副作用语义。

## Decisions

### 1. Installation 作为 System 内独立模块

新增 `src/system/installation/module.mjs`，模块负责组合 Installation Application、Infrastructure 和 CLI Interface。Bootstrap 显式安装该模块并消费其 capability/contribution；不通过目录扫描或隐式 DI 发现。

备选方案是继续由 `legacy-runtime-module.mjs` 注册这些函数，仅移动文件。这会保留多入口组装和 Web/Bootstrap 对内部路径的依赖，因此不采用。

### 2. 业务编排与技术适配按层放置，不再按小领域嵌套

CLI update、installation status、npm lifecycle enrollment 和 release awareness 进入 `application/`；origin、registry、current product identity、Launcher binding 与平台 Launcher 写入进入 `infrastructure/`；公共 Launcher command 进入 `interfaces/cli/`。各层文件直接平铺，不再增加 `identity/`、`launcher/` 等小领域目录。

通用 process、filesystem、platform、crypto 与 product resource 机制继续由全局 Infrastructure 提供。Installation Infrastructure 可以消费这些机制，但不复制它们。

### 3. 一个模块 capability 覆盖窄安装端口，兼容桥有明确退出条件

Installation module 对 Bootstrap/Web/payload consumers 提供明确的方法集合：读取当前产品身份与 origin、登记/查询 installation、校验 Launcher binding、执行 Launcher 生命周期以及注册 update/status application。迁移期只把既有 runtime method 挂接作为兼容桥，owner 为本 Child，退出条件是剩余 Doctor/legacy consumers 迁完后由 `legacy-exit-and-conformance` 删除；不建立第二套实现。

Web module 只消费“当前产品身份”和“校验 Launcher binding”等 Installation 事实，不取得 Launcher install/update authority。Launcher 最终仍执行 `buildr web`，但 HTTP Server 和实例策略继续属于 Web。

### 4. Installation Status 保留现有聚合输出，不借结构迁移重定义边界

`buildr installation status` 当前包含 installation、Launcher 与 Web instance/profile 观察。该公共 JSON 必须保持等价；本切片只把 Installation owner 的编排迁入模块，并通过现有只读 Web/Workspace observation 端口取得兼容字段。后续 Doctor 或 HTTP 切片可以继续缩窄依赖，但本 Change 不删除或重命名任何字段。

### 5. Application Payload 与 npm lifecycle 使用同一公开 Installation 入口

payload entry 和 Bootstrap `__internal enroll-npm-installation` 不再 import 旧 Infrastructure 路径，而是调用 Installation module 的公开 lifecycle/identity functions。正式 npm package 仍包含相同 origin envelope、资源和 esbuild payload；publication 工具本身不迁移。

### 6. 原子更新 Verification registry 与测试 imports

Verification selector/owner 将旧路径替换为 `src/system/installation/**`，同时保留现有安装、CLI update、Launcher、payload 和 release-smoke 测试证明范围。新增模块架构测试确保 Bootstrap 只注册一次 commands/capabilities，且旧专属入口退出。

## Risks / Trade-offs

- [Risk] Installation Status 同时观察 Web/Workspace facts，容易形成反向依赖 → 通过只读端口和兼容桥保留输出；不让 Installation 写 Web/Workspace 状态，并在后续 System Doctor/HTTP 切片继续收敛。
- [Risk] 移动 identity/binding 会影响 payload、Web 与 release tests 的动态 import → 在移动前枚举全部静态/动态字符串、manifest、Verification owner 和 test doubles，原子更新后扫描旧路径。
- [Risk] Bootstrap 重复注册 Launcher/update/status command → Launcher command 改为 module CLI contribution，legacy registry 入口同步删除，并用 command catalog/module snapshot 测试证明唯一注册。
- [Risk] Launcher 平台文件替换或绑定校验语义漂移 → 保持函数实现与操作顺序，仅调整依赖入口和文件归属，复用现有 macOS/Windows integration 与 release smoke。
- [Trade-off] 为兼容现有 runtime consumers，module 仍短期投射部分 method 到 runtime → 明确 owner/exit，避免同时维护 Facade 与第二实现；最终由 Parent 的遗留退出切片删除。

## Migration Plan

1. 建立 Installation module 与分层目录，先移动实现并更新其内部相对依赖。
2. 将 Bootstrap、Web、payload lifecycle、release awareness 和测试改为消费 Installation module/新路径。
3. 从 legacy runtime 与 CLI registry 删除重复注册，安装 Installation module 后再安装 Web module。
4. 更新 Verification registry、managed mutation owner、Application Payload assertions 与模块架构测试。
5. 运行 focused、affected、typecheck、payload/npm Launcher 与 Product verification；严格扫描旧入口和重复注册。
6. 通过 OpenSpec deterministic convergence/archive 后形成 Task Content Target、正式 Verification 和 Contribution Handoff；`system-capabilities` 保留 Doctor residual。

回滚只通过撤销本 Child 的完整迁移提交恢复旧树；不保留长期双入口、双注册或数据迁移兼容层。

## Open Questions

无。公开行为与范围由 Parent Plan、Service Architecture 和既有安装规范确定。
