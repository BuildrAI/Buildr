# 服务分层与模块组织

本文记录 Buildr Service 的工程目录、源码模块和技术分层共识，同时维护已经进入当前源码树的迁移基线。目标结构尚未全部完成；文中的“已迁移”只表示对应结构切片已经落入当前实现，不替代 OpenSpec 对产品行为和架构性变更的规范，也不替代 Parent 的 Contribution Handoff 与最终集成验收。

本文是长期架构方向和迁移边界，不是单次实施 authority。每个进入实现的独立结构切片必须绑定 Task-scoped OpenSpec Change；Parent Plan 只负责协调总体结果、架构不变量、能力贡献、依赖和最终验收，不替代 Child Change、Development、Verification 或 Finish。

## 基本原则

Buildr Service 根目录按工程职责组织，`src` 内部优先按业务或产品模块组织，模块内部再按技术职责分层。

目录结构用于表达真实的业务认知、模块边界和技术职责，不为了形式完整预先创建空模块、空层或没有真实需求的抽象。

架构依赖关系是优先指导，不是绝对技术隔离规范。实际设计重点保证：

- 一个事实具有明确的数据模型和写入 authority；
- 领域规则不在多个入口中重复实现；
- 持久化映射和数据存储边界清楚；
- 不因目录分层增加无价值的接口、Facade 或转发层；
- 按真实业务渐进重构，不进行一次性目录搬迁。

## 当前迁移基线

当前源码树已经完成以下结构切片：

| 切片 | 已落地内容 | 仍保留的后续边界 |
|------|------------|------------------|
| Service 根工程职责 | `bin/`、`src/`、`test/`、`resources/`、`web-dist/`、`tools/`、`docs/` 已按工程职责收敛；`bin/buildr.mjs` 保持稳定薄入口 | `package/` 只保留仍有明确 owner 和退出条件的兼容内容 |
| TypeScript 执行基础 | 固定 Node.js 24.15.0，采用 `strict`、`NodeNext`、`verbatimModuleSyntax`、`erasableSyntaxOnly`、`noEmit`；development checkout 支持 `.mjs`/`.ts` 混合加载，CLI identity 是首个生产 `.ts` 切片 | 未触达 `.mjs` 不批量转换；正式 npm Application Payload 继续由锁定 bundler 生成，不直接发布或运行 `.ts` |
| Bootstrap 与模块合约 | `src/bootstrap/cli/`、`module-registry.mjs`、`runtime.mjs` 已成为显式组装入口；模块通过窄 `requires`、`provides`、CLI/HTTP contribution 和 lifecycle 合约注册 | `legacy-runtime-module.mjs` 仍是有 owner 和退出条件的迁移 Facade |
| 通用 Infrastructure | SQLite 连接与全局 migration、filesystem、Git、process、network、platform、product invocation 等通用机制已收敛到 `src/infrastructure/` | Agent runtime 投射相关技术适配将在 Agent Assets 迁移时重新确认最终边界；Parent 中 Infrastructure Contribution 的交付绑定仍需单独对账 |
| Task 参考与专业切片 | Task Record、Task Review、Task Retrospective 的 Domain、Application、Persistence、CLI/HTTP/Internal Adapter 和 `task/module.mjs` 注册已经迁移 | Environment、Development、Verification、Finish、Execution Record、Overview、Planning Identity 与 Parent Coordination 仍待迁移 |
| Workspace Core | Workspace、Project、Service 的 Domain、Application、manifest/registry Repository、CLI/HTTP Adapter 和 `workspace/module.mjs` 已迁移 | Rule、Skill、Command、Component、Builtin 与 runtime projection 属于后续 Agent Assets；Change、OpenSpec、Publication 和通用 Project Verification 归属仍待决定 |
| Web 实例生命周期 | 默认实例、Preview、端口、PID、锁、Secret、Launcher 交接、scheduled maintenance、异常恢复和清理已迁入 `src/web/` | HTTP Server、Router、Session、安全边界和 `web-dist` 静态托管仍暂存于 `src/interfaces/local-app/http/` |
| System Installation | installation identity/origin/registry、update/status、npm lifecycle、Launcher 及其 CLI contribution 已迁入 `src/system/installation/` | `system/doctor` 尚未迁移 |

以上迁移均保持公开 CLI、HTTP、JSON、SQLite schema、migration 顺序与 checksum、事务、锁、幂等、原子性、writer authority 和既有运行行为不变，并同步调整受影响的 Import、Bootstrap 组装、Application Payload、Verification owner 和测试。尚未完成的职责继续遵守本文后续目标边界，不能从目录存在或 Child completed 状态推断已经交付。

## Service 根目录

目标目录为：

```text
buildr/
  bin/
  src/
  test/
  resources/
  web-dist/
  tools/
  docs/
```

| 目录 | 职责 | Java 项目类比 |
|------|------|---------------|
| `bin` | npm executable 的稳定薄入口，只转交给 Bootstrap，不承载 CLI 或业务逻辑 | 启动脚本 |
| `src` | Buildr 产品运行源码，包括业务模块、接口、持久化、基础设施和启动组装 | `src/main/java` |
| `test` | Unit、Component、Contract、Integration、System、Browser 和 Verification | `src/test/java` |
| `resources` | 随 Buildr 发布，由 Buildr 复制、安装、读取或投射的文件型交付内容 | `src/main/resources` |
| `web-dist` | sibling `buildr-web` Service 交付的正式前端构建产物，只消费和托管，不作为前端源码 authority | `static/` |
| `tools` | 只用于开发和发布 Buildr 自身的仓库工具 | Maven、Gradle、CI 和发布辅助工具 |
| `docs` | Buildr Service 的使用、实现和维护文档 | `docs/` |

根目录的 `package.json`、`package-lock.json`、`README.md`、`LICENSE`、`AGENTS.md` 和 ignore 文件描述整个 npm Service，不形成独立目录。

`node_modules/`、`.buildr/` 和临时构建产物属于本机依赖、控制状态或临时结果，不属于长期工程架构。

`buildr-web` Service 是前端源码和正式构建过程的 authority；Buildr Service 中的 `web-dist/` 是受控生成产物，不手工编辑。构建、校验、复制、Application Payload 和 npm 打包必须保持从 sibling Service 到本 Service 的单向交接。

上述根工程职责已经迁入当前目录。`package/` 不再承担通用产品源码或资源 authority，只保留仍有明确兼容 owner 的内容，并在对应后续切片满足退出条件后收敛。

### 保留稳定的根目录 `bin`

npm executable 保持指向：

```text
bin/buildr.mjs
```

例如：

```json
{
  "bin": {
    "buildr": "bin/buildr.mjs"
  }
}
```

`bin/buildr.mjs` 是固定且极薄的 Node.js 进程入口，只负责加载并调用 `src/bootstrap/cli/main.mjs`，以及保留最外层的失败兜底。CLI 解析、模块装配和业务调用都不进入 `bin/`。

## `src` 目标结构

```text
src/
  bootstrap/
    cli/
      main.mjs                 # 创建运行上下文、注册并分发 CLI 命令
      registry.mjs             # CLI 命令表和路由
      help.mjs                 # CLI Help 输出
      diagnostics.mjs          # CLI 失败和诊断输出

  task/
    module.mjs                 # 模块公开注册入口
    domain/                    # Task 领域对象和规则
    application/               # Task 用例和流程编排
    persistence/               # Task 数据读写和对象映射，模块所有权优先于存储介质
    interfaces/                # CLI、HTTP、Job、内部 Driver 等入口

  workspace/
    module.mjs
    domain/
    application/
    persistence/
    interfaces/

  agent-assets/
    module.mjs
    application/
    infrastructure/
    interfaces/cli/

  web/
    application/               # Web 实例和运行生命周期编排
    http/                      # Node.js HTTP Server、路由、Session 和静态文件
    interfaces/cli/            # buildr web 参数、DTO 和结果映射

  system/
    installation/              # Buildr 安装、更新和 Launcher
    doctor/                    # 跨模块只读诊断聚合

  infrastructure/
    sqlite/                    # SQLite 连接和全局有序 DDL migrations
    filesystem/
    git/
    process/
    network/
    platform/
```

不设置以下模糊目录：

```text
product/
runtime/
base/
common/
misc/
```

具有稳定职责但不属于业务管理对象的 Buildr 自身能力，进入 `system/` 下的明确子模块；`system/` 不能作为无法归类内容的杂物间。

当前开发源码允许 `.mjs` 与 `.ts` 渐进共存。新建或真实拆分的生产模块可以采用仅含可擦除类型语法的 `.ts`；不得为了目录迁移批量改写未触达 `.mjs`，也不得引入第二套 TypeScript 运行入口、路径别名或运行时转换器。

## `task` 模块

`task/` 管理 Buildr 的任务及任务生命周期，包括 Task Record、Environment、Development、Review、Verification、Retrospective、Finish、Execution Record 和 Parent Coordination 等能力。

这里的 `task` 是领域或功能模块名称，不只是 `domain/` 层。与 Task 相关的领域模型、应用用例、持久化映射和接口入口都归入 `task/`，再在模块内部按技术职责分层。

模块内部默认在技术层中保持扁平，由文件名表达具体能力，不为 Domain、Application、Persistence 或 Interfaces 目录对称地创建能力子目录：

```text
task/
  domain/
    task-record.mjs
    task-review.mjs
    task-retrospective.mjs
  application/
    task-record-application.mjs
    task-review-application.mjs
    task-retrospective-application.mjs
  persistence/
    task-record-repository.mjs
    task-review-repository.mjs
    task-retrospective-repository.mjs
  interfaces/
    cli/
      task-record.mjs
      task-review.mjs
    http/
      task-record-http.mjs
      task-review-http.mjs
    internal/
      task-retrospective-driver.mjs
  module.mjs
```

只有某项能力已经形成多个需要独立维护的文件、明确的私有协作边界，或者扁平层中的同类文件已明显妨碍查找和所有权判断时，才在对应技术层内为它建立子目录。例如 Task Finish 的 Application 实现包含多个独立交付步骤时，可以使用 `application/finish/`；其他技术层不因此被要求建立对称的 `domain/finish/` 或 `persistence/finish/`。`interfaces/cli/`、`interfaces/http/` 和 `interfaces/internal/` 继续按适配协议与调用方向分类，不属于业务能力子目录。

具体分类根据真实职责逐步形成，不要求一次性建立完整目录，也不为了视觉整齐增加空层、单文件目录或无实际边界的转发文件。

当前已经迁移 Task Record、Task Review 和 Task Retrospective 三个切片，并由 `task/module.mjs` 提供 Application、Persistence Read、CLI/HTTP contribution 和兼容出口。Task Record 现有复杂协作者暂时保留在 `domain/record/`、`application/record/` 和 `persistence/record/`；Review 与 Retrospective 在相应技术层保持扁平。其余 Task 生命周期职责仍位于旧技术分层，待后续切片迁入后再退出兼容入口。

## `workspace` 模块

`workspace/` 管理 Buildr 的基本结构对象：

```text
Workspace
  └── Project
        └── Service
```

Workspace 是管理入口，Project 和 Service 是其中具有独立身份与边界的管理对象。

Workspace Core 已完成迁移：Workspace、Project、Service 的领域对象、应用用例、manifest/registry Repository、CLI/HTTP Adapter 和 `workspace/module.mjs` 已进入上述模块。该模块公开 Workspace、Project、Service Application 与 HTTP contribution；为尚未迁移的消费者保留的 compatibility port 必须在 Agent Assets、Web、System 和最终遗留退出切片中逐步删除。

Change、OpenSpec、Publication、通用 Project Verification 和其他 Workspace 范围能力是否归入 `workspace/`，本轮不提前决定，统一进入文末的待决策清单。

## `agent-assets` 模块

`agent-assets/` 管理面向 Agent 的工作资产和运行时投射。

`agent-assets` 是“所有提供给 Agent 使用的资产”的模块名称，命名保持不变。它不是“工作资产（Work Asset）”的同义词：Work Asset 是更宽的产品概念，还包括 Specs、Project/Service facts 和协作流程等不一定归属于本模块的内容。

Agent Assets 平台迁移已经完成，当前生产结构为：

```text
agent-assets/
  application/
    rules.mjs
    skills.mjs
    commands.mjs
    components.mjs
    runtime.mjs
    runtime-projection.mjs
    package-maintenance.mjs
    package-maintenance/       # Builtin、package sync、receipt 与验证私有协作者
  infrastructure/
    runtime/
      adapter-contract.mjs
      projection.mjs
      check-runtime.mjs
      render-claude-code.mjs
      render-claude-code-rules.mjs
      skills/                  # source、Capability Binding、render plan 与 receipt
  interfaces/
    cli/
      agent-assets.mjs        # Agent Assets command contributions
  module.mjs                  # Bootstrap 唯一装配入口
```

本模块当前没有独立 Domain、Persistence 或 HTTP Controller，因此不创建空目录。Rule、Skill、Command 和 Component 的 manifest/内容仍是 Workspace 源资产，不因代码归入 Agent Assets 而变成独立数据库领域对象；模块专属 CLI descriptor 位于 `interfaces/cli/`，仍由公共 CLI Host 统一解析和分发。若后续出现 Agent Assets HTTP 协议，再按真实职责建立 `interfaces/http/`。

| 概念 | 含义 |
|------|------|
| Rule | Agent 工作时遵守的约束 |
| Skill | 可复用的工作方法 |
| Command | 可用外部工具的定义和要求 |
| Component | 一组资产的组合、安装和生命周期单元 |
| Builtin | Buildr 随产品提供并安装到 Workspace 的内置资产 |
| Projection | 将 Workspace 源资产转换为具体 Agent 能识别的文件 |

运行时投射遵守以下边界：

- Rules 和 Skills 可以投射；
- Components 管理组合和生命周期，可能间接影响投射；
- Commands 只做定义、引用和诊断，不由 Buildr 安装或投射；
- Workspace 是 Skill 的统一源；
- Agent Runtime 是可重建结果，不是源资产。

Bootstrap 恰好安装一次 `agent-assets/module.mjs`。旧的 `src/application/domains/{rules,skills,commands,components,runtime}.mjs`、`src/application/package-maintenance*`、`src/application/runtime.mjs` 和 `src/infrastructure/runtime/` 已退出；`legacy-runtime-module` 不再逐项注册这些能力。通用文件系统、进程、网络、Git 和原子写入机制继续属于全局 Infrastructure，Agent Assets Infrastructure 只保留 Agent runtime adapter、投射计划、冲突检查和 receipt 等专属技术语义。

产品入口 `buildr` Skill 与 Workspace Builtin、package runtime source 的长期合并或删除关系，仍作为后续产品重构线索保留；本次平台迁移只收敛现有实现所有权，不改变三者的产品语义或 writer authority。

`.buildr/agent-runtime/` 保存投射所有权回执、来源摘要和文件清单等本机控制状态，不是源资产，也不是实际投射结果。实际投射结果位于 `.agents/`、`.claude/`、`CLAUDE.md` 等 Agent 原生位置。

## `web` 模块

`web/` 是 Buildr Web 的后端宿主模块，作为一级模块存在，不放入 `system/`。

```text
web/
  application/
    instance-lifecycle.mjs    # 默认实例启动、复用、交接与清理编排
    preview-lifecycle.mjs     # Preview 实例和 Environment resource 编排
    scheduled-maintenance.mjs # 运行期间的定时维护
  infrastructure/
    instance-runtime.mjs      # Web 专属 receipt、锁、健康与退出适配
  interfaces/cli/
    web.mjs                   # buildr web 与 preview command contributions
  module.mjs                  # 向 Bootstrap 注册生命周期能力
  http/
    server.mjs                # 创建、监听和关闭 Node.js HTTP Server
    router.mjs
    session.mjs
    static-files.mjs
```

模块内部默认在这些技术层中保持扁平，由文件名表达默认实例、Preview 和 maintenance 能力；只有某项能力形成多个需要独立维护的私有协作者时才增加子目录，不为了目录对称创建单文件层级。

`web/application/` 负责：

- 默认实例和 Preview 实例管理；
- 判断复用还是启动实例；
- 端口、PID、进程锁和 Secret 的生命周期；
- 退出、清理和是否打开浏览器等流程编排。

`buildr web` 使用统一 CLI Host 完成进程级解析和分发；Web 特有的参数、DTO 和结果映射属于 `web/interfaces/cli/`，并通过模块公开入口向 CLI registry 贡献 command descriptor。模块不重复创建 CLI Host。

`web/http/` 是公共 HTTP 宿主，负责：

- 启动只监听本机的 HTTP Server；
- Router、Session 和公共安全边界；
- 托管根目录 `web-dist/`；
- 将业务请求分发给相应模块的 HTTP Controller。

业务 HTTP Controller 归属各自模块：

```text
task/interfaces/http/
workspace/interfaces/http/
agent-assets/interfaces/http/
system/doctor/interfaces/http/
```

例如：

```text
Browser
    ↓
web/http
    ↓
task/interfaces/http
    ↓
task/application
```

`web/application/` 和 `web/http/` 保持分开：Application 决定是否启动、复用哪个实例以及何时清理，HTTP 负责具体如何创建和运行 Server。这样实例生命周期不会与 Node.js HTTP 实现混在一起。

Web 实例生命周期已经独立迁入上述 `web/` 技术层：默认实例、Preview、端口、PID、锁、Secret、Launcher 交接、scheduled maintenance、异常恢复和清理均由 `web/application/`、`web/infrastructure/`、`web/interfaces/cli/` 与 `web/module.mjs` 负责。HTTP Router、Session、安全边界与 `web-dist` 静态托管在后续独立切片完成前，仍保留在现有 `interfaces/local-app/http` 宿主；该暂存边界不得反向取得实例 receipt、启动锁、scheduled maintenance 或 CLI command authority。

未来引入 Electron 时按真实形态演进：Electron 只是桌面 Launcher 时继续复用 `web/`；Electron 成为独立运行载体时再新增 `desktop/` 或相应 Electron Interface。当前不提前将 `web/` 抽象成含义模糊的 `app/` 或 `runtime/`。

## `system` 模块

`system/` 管理 Buildr 自身的安装和系统诊断，不管理 Workspace 业务对象。

```text
system/
  installation/
  doctor/
```

### `system/installation`

负责正式 Buildr 产品在用户机器上的安装能力：

- npm installation 身份；
- CLI Update；
- Installation Status；
- Launcher 安装、检查、修复和卸载；
- Launcher 与 Host Node、npm package 的绑定。

Launcher 只是可选的桌面启动入口，不是 HTTP Server：

```text
Launcher
    ↓
绑定的 Host Node 和 Buildr npm package
    ↓
buildr web
    ↓
启动同一套 Buildr Web
```

没有安装 Launcher，用户仍然可以直接执行 `buildr web`。

System Installation 已完成迁移。installation identity/origin/registry、CLI Update、Installation Status、Release Awareness、npm installation lifecycle、Launcher binding 与 Launcher 管理通过 `system/installation/module.mjs` 向 Bootstrap 提供窄能力和 CLI contribution；为 Doctor 与旧 runtime consumer 保留的 compatibility port 在 Doctor 和最终遗留退出切片完成后删除。

### `system/doctor`

Doctor 是跨模块的系统诊断能力：

```text
Doctor
  ├── Workspace
  ├── Task
  ├── Agent Assets
  ├── Installation
  └── Web
```

Doctor 理解 Buildr 业务和产品语义，因此不属于通用 Infrastructure。Doctor 不要求为了形式完整创建没有真实内容的 `domain/` 或 `persistence/`。

Doctor 可以直接读取数据库、文件、进程和安装状态等底层事实，也可以消费模块公开的诊断或 Read Model。原始数据库读取只用于连接、schema、migration、checksum、损坏和其他物理健康诊断；涉及业务状态、关系和语义的诊断优先消费所属模块公开的 Diagnostic/Read Model，不在 Doctor 中重新实现表到业务事实的映射。Doctor 只负责观察、诊断和聚合：不取得业务写入 authority，不通过诊断路径修改业务事实，也不复制正常业务流程。每个结构迁移切片都必须同步更新受影响的 Doctor 检查与诊断路径。

## `infrastructure` 模块

`infrastructure/` 提供跨模块复用的通用技术能力：

```text
infrastructure/
  sqlite/
    migrations/               # 整个 Workspace SQLite 的全局有序 DDL
  filesystem/
  git/
  process/
  network/
  platform/
```

Infrastructure 不理解 Task、Workspace、Agent Assets 或 Doctor 等业务语义。

具有业务含义的 Repository、DAO、Mapper 和存储对象归属相应业务模块；数据库连接、迁移执行、文件操作、Git、进程和网络等通用实现归属 Infrastructure。

业务模块的 `persistence/` 首先表达该模块如何读取、写入和映射业务数据，不因为当前使用 SQLite、文件或远端数据源就把业务 Repository 放入全局 Infrastructure。只有一个真实实现时保持扁平；同时存在多个需要独立维护的存储 Adapter 时，可以在模块内部按 `sqlite/`、`filesystem/` 等实现分类。Cloud API 是否属于 Persistence，取决于它是业务事实的数据来源还是外部系统集成，不能只按传输技术归类。

SQLite migrations 继续作为 Workspace 数据库的一套全局、只追加、有序 DDL schema 管理，统一放在 `infrastructure/sqlite/migrations/`。业务表的事实所有权仍属于相应模块；migration 文件集中排序不表示 Infrastructure 取得业务 writer authority。

通用 Infrastructure 边界已经在当前源码树收敛：Workspace SQLite 连接和 migration ledger、全局有序 DDL migrations、filesystem、Git、process、network、platform 与产品调用适配均由 `src/infrastructure/` 提供；Task、Workspace 等业务 Repository 已继续迁回所属模块。该实现事实不替代 Parent 中尚待完成的 Infrastructure Contribution binding/Handoff 对账。

例如：

```text
task/persistence/task-record-repository.mjs
infrastructure/sqlite/workspace-database.mjs
infrastructure/sqlite/migrations/NNNN_<change>.sql
```

## `bootstrap` 模块

`bootstrap/` 负责启动 Buildr、创建运行上下文、装配 Infrastructure、注册业务模块和形成 CLI 入口。它相当于 `SpringApplication.run(...)`、`@Configuration` 和 ApplicationContext 的创建、配置与组装职责。

目标结构：

```text
  bootstrap/
    cli/
      main.mjs                 # CLI Host：组装 runtime、注册命令、分发请求
      registry.mjs             # 命令注册表
      help.mjs                 # Help 输出
      diagnostics.mjs          # CLI 错误和诊断输出
```

`bin/buildr.mjs` 启动一个 Node.js 进程并转交 `bootstrap/cli/main.mjs`。Bootstrap 随后完成运行上下文创建、模块导入与注册、CLI 路由注册和请求分发。普通 CLI 命令完成后进程退出；执行 `buildr web` 时，同一个进程继续承载 HTTP Server。

`bootstrap/cli/` 统一拥有 CLI 进程入口、公共解析、命令 registry、Help、诊断和分发。Task、Workspace、Agent Assets、Web、System 等模块分别在自身 `interfaces/cli/` 中拥有模块特有的参数、DTO、输出和错误映射，并通过模块公开入口向统一 Host 贡献 command descriptor。所有 CLI Adapter 必须保持薄，真实行为继续由对应模块的 Application 或明确公开能力承担。

当前没有必要创建 `bootstrap/web.mjs`。只有未来出现真正独立的 Electron、Worker 或其他可执行进程时，再增加相应 Bootstrap 入口。

原 `application/compose-runtime.mjs` 的组装职责已经迁入 `bootstrap/`。当前 `bootstrap/runtime.mjs`、`module-registry.mjs` 与模块公开入口共同完成显式装配；`legacy-runtime-module.mjs` 仅为尚未迁移的 Application 和 Interface consumer 提供兼容注册，不是新的长期 composition root。

## 模块公开入口与注册

业务模块可以使用根部 `module.mjs` 作为公开注册入口，例如：

```text
bootstrap/cli/main.mjs
    ↓ import
task/module.mjs
    ↓ createTaskModule({ taskStore, workspaceReader, clock, ... })
Task Application、CLI/HTTP contributions、diagnostics、lifecycle
```

这是显式的轻量组装机制，作用类似 Spring 的 `@Configuration`，但不提供依赖扫描或自动注入。Node.js 仍然先按 ESM 规则 `import` 模块，再显式调用创建或注册函数；注册不会让其他文件自动获得可直接使用的 Import。

它的价值是让 Bootstrap 依赖模块公开入口，不逐个了解模块内部文件。`module.mjs` 只公开稳定组装能力，不承载业务规则，也不要求为每个小目录建立注册文件。当前技术栈使用 ESM 显式注册已经足够，第一轮不引入额外的 DI 或模块扫描框架。

模块公开入口遵守以下最小契约：

- 显式声明并接收窄 `requires`，不从任意全局 runtime 查找依赖；
- 显式返回或注册 `provides`，包括 Application、CLI/HTTP contributions、diagnostics 和必要的 lifecycle；
- 不通过隐式扫描、导入副作用或无命名空间的全局对象取得能力；
- Bootstrap 负责模块装配顺序、重复名称检查、启动、停止和资源释放；
- 第一轮为保持行为而保留的宽 runtime 只能作为迁移 Facade，并在对应 Child Task 中记录 owner、适用范围和退出条件。

## 模块内技术分层

业务模块一般采用：

```text
<module>/
  domain/
  application/
  persistence/
  interfaces/
```

不是每个模块都必须具备全部四层。

| 分层 | 职责 |
|------|------|
| `domain` | 领域对象、值对象、核心事实关系和不依赖外部系统的业务约束 |
| `application` | 应用服务、业务用例、流程编排、事务边界和跨对象或跨模块协作 |
| `persistence` | 数据模型与领域模型之间的读取、写入和对象映射 |
| `interfaces` | HTTP、Job、MQ Handler 和内部 Driver 等访问协议适配 |

Buildr 的 CLI 是整个 Node.js 可执行程序共享的单一 Host，因此公共参数解析、命令 registry、Help、诊断和进程级协议输出统一放在 `bootstrap/cli/`。业务命令的模块特有参数、DTO、结果和错误映射进入对应模块的 `interfaces/cli/`，模块只贡献 command descriptor，不重复建立 Host。

### `application` 命名

统一使用 `application/`，表示应用层。不使用顶层 `service/` 作为应用层目录，避免和 Buildr 管理对象中的 Service 概念冲突。

具体实现可以根据职责命名为 `TaskService`、`TaskApplicationService`、`TaskCoordinator` 或 `TaskQueryService`。

### 对象边界

| 对象类型 | 归属 |
|----------|------|
| 数据库 Row、文件存储对象 | `persistence` |
| 领域对象、值对象 | `domain` |
| Command、Query、业务用例输入输出 | `application` |
| HTTP DTO、HTTP 协议响应 | `interfaces` |
| 模块特有 CLI 参数、DTO、输出和错误映射 | 对应模块 `interfaces/cli` |
| CLI registry、Help、公共诊断、进程分发和退出兜底 | `bootstrap/cli` |

一个 Domain 不等于一张表。Domain 可以组合多个数据主体和关系；数据模型与领域模型保持核心事实一致，但允许根据应用表达存在结构差异。具体业务建模原则见[渐进式业务建模](progressive-business-modeling.md)。

## 持久化边界

文件系统、SQLite、MySQL 等属于不同存储介质或存储系统。`persistence` 根据当前真实存储方式完成数据模型和领域模型之间的转换。

Repository、DAO、Mapper 是同一持久映射层的不同技术表达。没有多个持久化实现需求时，不为了形式额外制造 `WarehouseRepository`、`MybatisWarehouseRepository`、`WarehouseMapper` 等多层重复抽象。

同一份业务数据在一个阶段应保持一个明确的写入 authority。迁移期间可以暂时并存新旧实现，但必须明确当前读取 authority、当前写入 authority、数据迁移方式和旧实现退出条件。

以 Task Record 为例：

| 约束 | 具体含义 |
|------|----------|
| 事实所有权 | Task Record 的字段、状态含义和关系属于 `task` 模块，不因为数据存放在 SQLite 就属于 `infrastructure` |
| 唯一 writer | `task/persistence/task-record-repository.mjs` 是当前 Task Record 数据写入入口；CLI、HTTP 和 Doctor 不各自编写更新 SQL |
| 规则不重复 | “哪些状态允许完成”等规则只在 Task Domain/Application 定义，CLI 和 HTTP 只转换请求与结果 |
| 无循环依赖 | 可以形成 `bootstrap → task → infrastructure`，但不能由 `infrastructure` 反向 Import `task`；模块互相调用也不能形成闭环 |

`persistence` 类似 Java 项目中使用 MyBatis-Plus 的 Mapper/DAO 层：普通 CRUD 可以直接复用统一实现，只有特殊查询、事务或映射需求才增加明确代码。它不是要求所有调用都经过多层 Repository 接口，也不阻止本模块 Application 直接调用 Persistence。

Application 拥有业务用例的事务边界。单模块事务由所属 Application 协调，跨模块原子操作由发起用例显式协调同一 transaction/unit-of-work；Repository 不以隐式嵌套事务改变现有原子性。结构迁移必须保持既有事务范围、锁、幂等、顺序、错误和回滚语义。

## 接口层

CLI、HTTP Controller、Job、MQ Handler 和内部 Driver 都属于接口入口。接口层负责访问协议解析、参数和 DTO 转换、调用业务能力，以及输出和错误映射。

默认依赖方向为：

```text
interfaces → application
```

这是指导原则，不要求为简单行为制造空 Application Facade。同一模块内纯查询、没有业务语义且已有唯一 reader 的场景，Interface 可以直接访问明确的 Query/Persistence reader；Mutation 默认经过所属模块 Application。CLI 使用统一 Host，但模块特有 Interface 代码仍属于对应模块。

## 模块协作

模块之间默认优先通过对方的 Application Service 或稳定公开入口协作。

```text
task/application
    ↓
workspace/application
```

Application Service 可以根据真实业务编排、事务、数据复用和实现成本，直接访问本模块的 Domain、Persistence、通用技术组件、Infrastructure 或外部 Client。跨模块协作默认通过对方公开的 Application、Query 或模块入口；不得直接写入其他模块的 Persistence，也不得绕过对方的事实 owner 和唯一语义 writer。

最低依赖边界为：

```text
bootstrap      → module public entries、CLI/Web Host、infrastructure
interfaces     → 本模块 application；纯查询例外可访问本模块明确 reader
application    → 本模块 domain/persistence、其他模块公开 Application/Query、infrastructure
persistence    → 本模块 domain、infrastructure
domain         → 本模块 domain
infrastructure → infrastructure；不得反向依赖业务模块
```

架构检查不因本模块 Application 直接使用 Persistence 或 Infrastructure 就机械判定违规，但必须检查跨模块写入、事实 owner、唯一语义 writer、规则重复、循环依赖和不必要的内部实现耦合。迁移期间无法立即消除的跨模块内部依赖必须记录 owner、原因、验证和退出条件。

## CLI 和 Web 调用链

### 普通 CLI

```text
bin/buildr.mjs
    ↓
src/bootstrap/cli/main.mjs
    ↓
src/bootstrap/cli/registry.mjs
    ↓
对应模块 interfaces/cli/<command>.mjs
    ↓
对应模块 Application 或公开入口
    ↓
domain / persistence
```

CLI 命令完成后进程退出，不需要 HTTP Server。

### Buildr Web 启动

```text
bin/buildr.mjs
    ↓
bootstrap/cli/main.mjs
    ↓
bootstrap/cli/registry.mjs
    ↓
web/interfaces/cli/web.mjs
    ↓
web/application/instance-lifecycle.mjs
    ↓
interfaces/local-app/http/server.mjs
```

对应职责为：

- `bootstrap/cli/registry.mjs` 统一发现并分发 Web command descriptor；
- `web/interfaces/cli/web.mjs` 解析 `--target`、`--port`、`--no-open` 等模块特有参数并映射结果；
- `web/application` 判断复用还是创建 Web 实例，并管理实例生命周期；
- 当前 `interfaces/local-app/http` 创建 HTTP Server 并装配公共 HTTP 宿主，后续整体迁入 `web/http`。

HTTP Server 启动后的浏览器请求链为：

```text
Browser
    ↓
web/http
    ↓
对应业务模块 interfaces/http
    ↓
对应业务模块 application
```

Bootstrap 只负责进程、CLI 协议和启动组装，不承载 Web 实例策略或具体 HTTP Server 行为。

## `resources` 目录

`resources/` 保存不属于 Buildr 后端实现源码，但需要随 Buildr 发布，由 Buildr 读取、复制、安装或投射的文件型交付内容。

资源中可以包含 Skill 自带脚本，但这些脚本对 Buildr Service 来说是交付内容，不是 Buildr 后端实现代码。

目标结构：

```text
resources/
  manifest.yml

  workspace/
    rules/
    skills/
    commands/
    components/
    templates/

  installation/
    launcher/
      icons/
      templates/
```

`resources/workspace/` 保存需要安装或同步到用户 Workspace 的源资产和 Builtins。产品入口 `buildr` Skill 是否进入该 Builtin 体系，本轮不决定。

`resources/installation/` 保存安装 Buildr 本机入口时使用的图标和模板。`src/system/installation/` 负责安装逻辑，`resources/installation/` 保存安装所需文件。

不保留 `resources/bootstrap/`，也不长期保留第二套 Bootstrap Guide 和文字契约。恢复入口由 CLI Help、`buildr init`、Doctor、`sync`、Skill/Builtin 安装与恢复，以及正式产品文档承担。有价值的说明进入 `docs/`，必须保证的行为进入 OpenSpec 或测试。

## `tools` 目录

`tools/` 只供 Buildr 开发者、CI 和发布流程使用，不属于用户安装后的产品运行代码。

```text
tools/
  development/
  release/
```

`tools/development/` 负责使用声明的 Node/npm 运行源码 checkout、启动 Development CLI、安装或更新 Development Launcher，以及其他只服务 Buildr 开发环境的工具。

`tools/release/` 负责构建 npm 发布物，执行版本、Tag 和 Registry 检查，发布 npm package、维护 GitHub Release，以及组装和验证 Release Artifact。

`src/` 不依赖 `tools/`。验证主体和验证入口统一位于 `test/verification/`，不增加 `tools/verification/`。

## 当前根工程职责

Buildr Service 当前按生命周期使用以下目录：

```text
bin/          稳定可执行入口
src/          产品运行源码
resources/    文件型交付资源
web-dist/     sibling buildr-web 的正式静态产物
test/         测试与 verification
tools/        checkout-only development/release 工具
docs/         维护者与公开文档
```

`package/` 仅 deferred 保留 Runtime Buildr Skill 与 Launcher 构建/兼容入口。Runtime Buildr Skill 由后续 Agent Assets Contribution 决定；Launcher 的安装身份、绑定、状态和管理行为已经迁入 `src/system/installation/`，`package/launchers/` 不得重新取得 System Installation authority。不得扩大 `package/` allowlist，也不得让它成为新资源或 runtime 源码的 owner。

模块迁移仍按下列目标继续：

```text
bin/buildr.mjs
    → 保留为稳定薄入口，内部转交 src/bootstrap/cli/main.mjs

src/interfaces/cli/
    → 公共 Host 迁入 src/bootstrap/cli/
    → 模块特有 command adapter 迁入对应模块 interfaces/cli/

src/bootstrap/
    → 已接管进程、CLI Host、模块 registry 和显式组装
    → 已迁移模块通过各自 module.mjs 提供窄 requires/provides/contributions
    → legacy-runtime-module.mjs 仅兼容尚未迁移的职责

src/interfaces/local-app/http/server.mjs
    → 公共 HTTP 宿主迁入 src/web/http/
    → 业务 HTTP Controller 按所有权迁入对应模块 interfaces/http/

src/interfaces/local-app/runtime/
    → 实例、Preview 和维护编排已经迁入 src/web/application/

src/application/{workspace,project,service}/ 与相关全局 persistence
    → Workspace Core 已迁入 src/workspace/

src/application、src/domain、src/interfaces 中的 Task 专业入口
    → Task Record、Review、Retrospective 已迁入 src/task/
    → 其余 Task 生命周期能力继续按后续切片迁移

installation、update、status、Launcher 与 product identity
    → 已迁入 src/system/installation/

```

## 渐进式迁移原则

当前 Buildr Service 已形成 Bootstrap、Infrastructure、Task 部分切片、Workspace Core、Web 实例生命周期和 System Installation 等模块结构，其余生产职责仍与旧全局技术分层并存。后续迁移继续遵循：

- 先明确业务和产品模块，再移动文件；
- 一个模块或一个可独立验证的结构切片逐步迁移；
- 不进行一次性全目录重写；
- 混合职责文件可以在对应模块迁移时按现有职责拆分；
- 每次迁移同时考虑 Domain、Application、Persistence、Interfaces、Bootstrap 和测试；
- 不因内部目录调整改变公开 CLI、HTTP、JSON、存储语义或其他产品行为；
- 新旧结构并存期间保持唯一业务和数据 authority；
- 不建立长期双实现、双读或双写；
- 每个迁移任务明确范围、依赖、验证和退出条件；
- 总体重构可以由父任务管理，具体模块由可独立交付的子任务推进。

Task Record 已作为首个纵向参考切片完成迁移，并验证了 Domain、Application、Persistence、CLI、HTTP、SQLite 和 Bootstrap 的新组织方式。Task Review 与 Task Retrospective 已沿用该范式迁移；这不表示 `task/` 的其余能力已经完成，也不授权一次性重写整个 Task 生命周期。

## 迁移台账与第一轮完成定义

迁移台账按生产职责和能力单元维护，不为 Parent Plan 枚举每个生产文件。每个能力单元至少记录稳定名称、事实 owner、职责边界、主要入口、writer/authority、目标模块以及 `migrated|deferred` 处置。

第一轮结束时，所有现有生产职责都已在迁移台账中归入明确的能力单元，并标记为 `migrated`，或标记为具有明确理由、owner 和后续决策条件的 `deferred`。不得以“尚未讨论”为由留下无 owner、无处置的生产职责。

Child Task 对自己实际移动、拆分、新增和删除的文件承担精确清单、影响范围、验证证据和旧入口退出责任。Parent Plan 只保存能力贡献、依赖和最终验收，不复制 Child 文件清单、状态、Result 或 checklist。

第一轮只有在以下条件同时成立时完成：

- 所有生产职责都已进入迁移台账并得到 `migrated|deferred` 处置；
- 所有计划迁移的能力单元均有 matching Child Contribution Handoff，或已显式 superseded；
- 没有重复实现、无 owner 的遗留代码或无退出条件的迁移 Facade；
- Parent 已按最终架构、行为兼容性、数据 authority、发布物和验证证据完成显式集成验收。

## 第一轮结构重构边界

第一轮只重构 Buildr Service 的分层、模块组织和内部组装，不重构产品功能本身。

允许的变化包括：

- 移动文件和目录；
- 按现有职责拆分混合职责文件；
- 调整内部命名、Import、Export 和模块注册；
- 调整 Bootstrap 和依赖组装；
- 将现有代码归入新的业务模块和技术层；
- 为适配文件拆分和目录迁移而重写、新增或删除测试；
- 机械更新因路径变化受影响的 Verification declaration identity、registry input、affected selector 和验证脚本引用，但不改变 Verification 语义或选择模型。

第一轮不包含：

- 修改业务规则、业务流程或状态机；
- 修改 CLI、HTTP、JSON 或其他公开协议；
- 修改数据模型、表结构、存储语义或 writer authority；
- 优化、合并、删除或重新设计现有产品功能；
- 重构 Verification 的测试指导、声明、选择、执行和结果管理体系；
- 顺手修复迁移过程中发现但不影响结构迁移安全的问题。

只要拆分前后的输入、输出、状态变化和副作用保持一致，文件拆分和内部组装调整属于结构重构，不属于功能重构。

## 测试保持原则

第一轮不重新设计验证体系，只使用当前测试边界证明结构迁移没有改变现有行为：

- 现有业务行为和公开协议测试原则上保持不变；
- 因内部路径、Import 或拆分单元变化，可以重写对应测试；
- 可以新增用于证明新模块组装、入口注册和依赖连接正确的测试；
- 旧测试只有在覆盖已被等价替代，或者只验证已经退出的旧目录结构时才能删除；
- 不降低已有业务行为、公开协议、数据行为和异常边界的测试覆盖；
- 架构和目录测试更新为本文件定义的目标结构；
- 每个结构迁移子任务仍须通过当前适用的测试与验证入口。

Verification declaration、registry 和 selector 中的路径属于结构迁移的直接消费者。为保持既有选择与覆盖而更新这些路径是结构迁移的一部分，不表示重新设计 Verification 体系；路径更新后的正式验证 evidence 必须重新建立。

Verification 体系本身的领域建模、测试指导、能力声明、执行选择、调度和结果管理，在第一轮结构重构完成后作为独立任务讨论和重构。

### 固定验收类别

每个迁移子任务从以下固定类别中选择实际适用项，并在该任务中明确具体命令、样例和预期结果：

- CLI：命令、Help、文本/JSON 输出、退出码和错误映射等价；
- HTTP：路由、方法、状态码、响应 DTO、Session 和错误边界等价；
- 数据：SQLite schema、全局 migration 顺序与 checksum 不变，既有数据可继续读取，语义 writer 不变；
- 发布物：公开产品表面、逻辑资源身份、安装结果和运行行为等价；内部 npm/package/Application Payload 路径可以迁移，但 manifest、resolver、payload builder、验证选择器和 release tests 必须原子更新，`web-dist/` 仍被正确打包和托管；
- 运行行为：普通 CLI 仍按预期退出，`buildr web` 的实例复用、端口、PID、锁、Secret、浏览器打开与清理行为等价；
- 诊断：Doctor 对受影响模块的检查和结果等价，不产生业务写入；
- 结构：模块公开入口和注册正确，没有遗留旧 Import、重复实现或新增循环依赖；
- 测试：受影响测试完成等价迁移，当前适用的正式验证入口通过。

这是一组稳定的检查方向，不是一套要求所有子任务机械执行的固定命令。具体迁移任务根据真实影响确认适用项和证明方式。

## 父任务与子任务

建立一个“Buildr 服务分层和模块组织重构”父任务，并在父任务的 intent 和 scope 中引用本文件，作为结构目标、迁移边界和验收依据。Parent Task 激活并取得 ready Environment、Development Receipt 后，记录 Parent Plan。

Parent Plan 只包含总体 outcome、architecture invariants、Contribution Map、真实 dependencies 和 final acceptance。它不保存 Child 状态、完整 Requirement、文件或 migration 清单、测试 Result，也不使用 Markdown checkbox 表达进度。只有上述协调事实实质变化时才显式 reconcile。

子任务按能够独立交付和验证的结构切片建立，并通过 Parent/Child 关系关联父任务。一个一级模块可以根据实际范围拆成多个子任务，例如 `system/installation` 和 `system/doctor` 可以分别迁移；不要求一个目录对应一个子任务。Child 只有在真实开始时创建，独立拥有自己的 Task-scoped OpenSpec Change、Environment、Development、文件清单、Review、Verification 和 Finish。

第一轮子任务只承担结构迁移。需要改变功能、系统行为、产品设计或验证体系的问题，另行建立后续任务，不混入当前结构迁移子任务。

Child completed 不等于能力贡献已经被 Parent 接受。每个 Child 必须以 Contribution Handoff 说明 planned、delivered、extra、residual、superseded、affected 和唯一 next action；全部贡献得到可证明处置后，Parent 再执行显式最终集成验收，随后按正常 Completion Review、Development handoff 和 Finish 完成自身生命周期。

## 重构观察与反馈

结构重构也是梳理现有架构、系统和产品的过程。迁移过程中应基于实际代码、调用关系、数据 authority、测试和运行行为观察问题并形成建议，但不因此扩大当前子任务的实现范围。

观察结果可以包括：

- 领域边界、模块归属或技术分层不清晰；
- 文件或 Application 混合多个真实职责；
- 功能规则、状态流、数据关系或接口设计存在问题；
- 模块依赖、Bootstrap 组装或基础设施复用存在不合理耦合；
- 测试、Verification、安装、运行或发布体系需要后续重构；
- 产品能力需要调整、删除、补充或形成新需求。

每项建议应尽量记录对应事实、影响范围、初步判断和建议方向。除非问题导致当前结构迁移无法安全保持既有行为，否则只形成后续线索，不在当前子任务中直接修复。

第一轮结构重构完成后，再统一复查这些观察结果，作为后续功能、模块、系统、产品重构或新需求的真实输入。

## 后续继续讨论的内容

以下生产能力的目标模块归属或内部拆分不在总架构阶段提前设计，进入对应结构迁移或后续专项任务时再决定；这不改变每个实施切片必须使用 Task-scoped OpenSpec Change 的治理要求：

- Change 产品能力的模块归属；
- OpenSpec 产品能力的模块归属；
- Publication；
- Package Maintenance；
- Release Awareness；
- 通用 Project Verification；
- 产品入口 `buildr` Skill、Workspace Builtin 与 package runtime source 的最终关系；
- 当前大文件的具体拆分；
- `test/` 与业务模块、测试层级的最终对应；
- Verification 体系本身的后续重构；
- 具体迁移顺序和子任务划分；
- 结构迁移过程中形成的功能、模块、系统和产品建议。
