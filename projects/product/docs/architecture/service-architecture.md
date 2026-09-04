# 服务分层与模块组织

本文记录 Buildr Service 的工程目录、源码模块和技术分层共识，同时维护已经进入当前源码树的迁移基线。第一轮计划迁移已经进入当前实现；仍未确定最终归属的生产职责必须在迁移台账中显式标记为 `deferred`，不能因暂不移动而成为无 owner 遗留。文中的“已迁移”只表示对应结构切片已经落入当前实现，不替代 OpenSpec 对产品行为和架构性变更的规范，也不替代父任务基于真实子任务结果完成最终集成验收。

本文是长期架构方向和迁移边界，不是单次实施 authority。每个进入实现的独立结构切片必须绑定 Task-scoped OpenSpec Change；父任务只负责协调总体结果、架构不变量、能力贡献、依赖和最终验收，不替代子任务的 Change、审查、验证或交付。

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
| Service 根工程职责 | `src/`、`tools/` 与普通 `test/` 已收敛为 TypeScript；`bin/buildr.mjs`、`test-context.mjs`、自举用 `package/launchers/manage.mjs` 及 5 个 JavaScript 兼容夹具构成受验证的最小 `.mjs` 允许清单 | `web-dist/`与`package/targets/test-context/`只作为ignored本地构建输出，`package/`其他内容只保留明确owner和退出条件 |
| TypeScript 执行基础 | 固定 Node.js 24.15.0，采用 `strict`、`NodeNext`、`verbatimModuleSyntax`、`erasableSyntaxOnly`、`noEmit`；`src/`、`tools/`与`package/launchers/` 已全部纳入严格 TypeScript 检查 | 普通测试由独立过渡配置和真实运行验证；正式 npm Application Payload 继续由锁定 bundler 生成，不直接发布或运行 `.ts` |
| Bootstrap 与模块合约 | `src/bootstrap/cli/`、`module-registry.ts`、`runtime.ts` 是唯一显式组装入口；模块通过窄 `requires`、`provides`、CLI/HTTP/Diagnostic contribution、runtime port 和 lifecycle 合约注册；`legacy-runtime-module.mjs` 与临时 compatibility Facade 已删除 | 新模块继续直接接入该显式合约，不再恢复第二 composition root |
| 通用 Infrastructure | SQLite 连接与全局 migration、filesystem、Git、process、network、platform、product invocation 等通用机制已收敛到 `src/infrastructure/` | Agent runtime 专属投射继续归 Agent Assets；历史 Infrastructure Child 缺少 Contribution binding，由最终架构收敛 Child 基于 current tree 重新验证并显式 supersede |
| Task 参考与专业能力 | Task Record、Review、Verification、父任务协调（Task Parent Coordination）和复盘文档读取由`src/task/`显式注册；Task Overview、Task Environment、Task Development、Planning Identity、旧Task Finish、Terminal Delivery、Entry Snapshot与Task Execution Record均已退役 | HTTP Controller与Diagnostic Read Model通过模块contribution参与最终组装 |
| Workspace Core 与 Daily Progress | Workspace、Project、Service、Project Daily Progress 的 Domain、Application、manifest/YAML Repository、CLI/HTTP Adapter 和 `workspace/module.ts` 已全部迁移为 TypeScript | Agent Assets、Task Change、Task OpenSpec、System Publication 与 Project Verification 已由各自模块拥有 |
| Web Runtime Host | 默认实例、Preview、端口、PID、锁、Secret、Launcher 交接、scheduled maintenance、异常恢复和清理位于 `src/web/{application,infrastructure,interfaces/cli}`；HTTP Server、Router、Session、安全边界、bounded read executor 与 `web-dist` 静态托管位于 `src/web/http/` | 公共 Host 只处理传输和安全机制；业务路由由 Workspace、Task、Change、Publication 与 Installation 的 HTTP contribution 提供 |
| System Doctor | Doctor 命令、Application 编排、结果模型和各类诊断已迁入 `src/system/doctor/`；Bootstrap 最后装配所有模块的 Diagnostic/Read Model contribution | Doctor 保持只读聚合，不取得任何业务 writer authority |

以上迁移均保持公开 CLI、HTTP、JSON、SQLite schema、migration 顺序与 checksum、事务、锁、幂等、原子性、writer authority 和既有运行行为不变，并同步调整受影响的 Import、Bootstrap 组装、Application Payload、Verification owner 和测试。尚未完成的职责继续遵守本文后续目标边界，不能从目录存在或 Child completed 状态推断已经交付。

## Service 根目录

目标目录为：

```text
buildr/
  bin/
  src/
  test/
  resources/
  tools/
  docs/
  web-dist/                  # ignored，本地按需生成
```

| 目录 | 职责 | Java 项目类比 |
|------|------|---------------|
| `bin` | npm executable 的稳定薄入口，只转交给 Bootstrap，不承载 CLI 或业务逻辑 | 启动脚本 |
| `src` | Buildr 产品运行源码，包括业务模块、接口、持久化、基础设施和启动组装 | `src/main/java` |
| `test` | Unit、Component、Contract、Integration、System、Browser 和 Verification | `src/test/java` |
| `resources` | 随 Buildr 发布，由 Buildr 复制、安装、读取或投射的文件型交付内容 | `src/main/resources` |
| `web-dist` | sibling `buildr-web` Service按需生成的ignored本地静态输出；正式Candidate使用隔离staging，不作为前端源码authority | 构建后的`static/` |
| `tools` | 只用于开发和发布 Buildr 自身的仓库工具 | Maven、Gradle、CI 和发布辅助工具 |
| `docs` | Buildr Service 的使用、实现和维护文档 | `docs/` |

根目录的 `package.json`、`package-lock.json`、`README.md`、`LICENSE`、`AGENTS.md` 和 ignore 文件描述整个 npm Service，不形成独立目录。

`node_modules/`、`.buildr/`、`web-dist/`、`package/targets/test-context/`和两端generated DTO属于本机依赖、控制状态或可重建结果，不属于Git长期源码。

`buildr-web` Service是前端源码和正式构建过程的authority；本地开发可向Buildr Service的ignored `web-dist/`物化，Browser与Candidate则生成到隔离staging。Application Payload和npm打包只消费本次Candidate冻结结果，不读取tracked或陈旧本地输出。

Buildr Web 的 Workspace、Project、Service 前端分别位于 `src/features/workspace/`、`project/`、`service/`，各自拥有路由页面、页面局部组件和确有复杂状态的Hook，不合成统一CRUD功能。Project Daily Progress继续位于独立`features/project-daily-progress/`并由Project详情组合；Project与Service详情只共享`features/shared/hooks/useMarkdownDocumentViewer.ts`中的Markdown加载、路径和历史状态。共享`src/api/workspace.ts`仍是唯一Workspace HTTP Client，`src/pages/`与`src/components/`不保留这些领域的第二份页面或局部组件。

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

`bin/buildr.mjs` 是固定且极薄的 Node.js 进程入口，只负责加载并调用 `src/bootstrap/cli/main.ts`，以及保留最外层的失败兜底。CLI 解析、模块装配和业务调用都不进入 `bin/`。

## `src` 目标结构

```text
src/
  bootstrap/
    cli/
      main.ts                  # 创建运行上下文、注册并分发 CLI 命令
      registry.ts              # CLI 命令表和路由
      help.ts                  # CLI Help 输出
      diagnostics.ts           # CLI 失败和诊断输出

  task/
    module.ts                  # 模块公开注册入口
    domain/                    # Task 领域对象和规则
    application/               # Task 用例和流程编排
    persistence/               # Task 数据读写和对象映射，模块所有权优先于存储介质
    interfaces/                # CLI、HTTP、Job、内部 Driver 等入口
    change/                    # Task Change 查询与 Task-scoped Change read model
    openspec/                  # Task OpenSpec 解析、收敛和内部 CLI

  workspace/
    module.ts
    domain/
    application/
    persistence/
    interfaces/

  agent-assets/
    module.ts
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
    publication/               # Buildr 发布物只读查询与 HTTP contribution

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

当前人工维护的生产、工具和普通测试源码已收敛为 `.ts`。生产与工具代码通过严格类型检查；测试代码暂由独立过渡配置检查语法与模块解析，并以真实测试运行证明行为。不得引入第二套 TypeScript 运行入口、路径别名或运行时转换器。

## `task` 模块

`task/`管理Task Record、Review、Verification、父任务协调（Task Parent Coordination）和复盘文档确定性读取边界；不再包含Task Overview、Task Environment、Development、Retrospective Application、Finish或Task Execution Record。

这里的 `task` 是领域或功能模块名称，不只是 `domain/` 层。与 Task 相关的领域模型、应用用例、持久化映射和接口入口都归入 `task/`，再在模块内部按技术职责分层。

模块内部默认在技术层中保持扁平，由文件名表达具体能力，不为 Domain、Application、Persistence 或 Interfaces 目录对称地创建能力子目录：

```text
task/
  domain/
    task.ts
    task-project.ts
    task-service.ts
    task-change.ts
    task-review.ts
  application/
    task-record-application.ts
    task-record-validation.ts
    task-record-dto.ts
    task-review-application.ts
  persistence/
    task-repository.ts
    task-project-repository.ts
    task-service-repository.ts
    task-change-repository.ts
    task-record-retrospective-document.ts
    task-review-repository.ts
  interfaces/
    cli/
      task-record.ts
      task-review.ts
    http/
      task-record-http.ts
      task-review-http.ts
  module.ts
```

只有某项能力已经形成多个需要独立维护的文件、明确的私有协作边界，或者扁平层中的同类文件已明显妨碍查找和所有权判断时，才在对应技术层内为它建立子目录。`interfaces/cli/`、`interfaces/http/` 和 `interfaces/internal/` 继续按适配协议与调用方向分类，不属于业务能力子目录。

具体分类根据真实职责逐步形成，不要求一次性建立完整目录，也不为了视觉整齐增加空层、单文件目录或无实际边界的转发文件。

当前Task专业模块包括Review、Verification和父任务协调（Task Parent Coordination）。独立Task Overview已删除，Task详情直接读取Task Record与关系投影。复盘是按需纯Skill；正文写入本机ignored Markdown，Task Record只维护摘要和人的决定状态。

Task Record 的 Domain、Application、Persistence和Interface均使用TypeScript并直接位于对应技术层。`task.ts`只定义Task字段及归属Task的Result、History、ParentCompletion与Retrospective数据对象；`TaskProject`、`TaskService`与`TaskChange`各自携带`taskId`。Application拥有输入规范化、业务规则、摘要、父子检查和事务范围，并直接协调四个单表Repository；Infrastructure的`sqlite/transaction.ts`统一执行普通业务事务。旧Retrospective Domain/Application/Repository/HTTP/Driver、Task Finish、Terminal Delivery与统一Task Environment实现已经直接删除，不保留转发入口或兼容投影。默认`task-finish` Skill由Agent编排Git交付、Task结果登记，以及Worktree和具体资源owner的安全清理，本身不形成Application状态。

## `workspace` 模块

`workspace/` 管理 Buildr 的基本结构对象：

```text
Workspace
  └── Project
        └── Service
```

Workspace 是管理入口，Project 和 Service 是其中具有独立身份与边界的管理对象。

Workspace Core 已完成 TypeScript 迁移：Workspace、Project、Service 的领域对象、应用用例、manifest/registry Repository、onboarding、mutation recovery、declaration-intake 编排、CLI/HTTP Adapter 和 `workspace/module.ts` 均位于上述模块。该模块公开 Workspace、Project、Service Application、窄 Workspace/Project Query 以及 CLI、HTTP、Diagnostic contribution；Web 和后续 Task 通过公开 Query/registration port 接入，不再保留临时 compatibility Facade。

Workspace、Project与Service保持三个独立领域和Application边界。只有原`workspace-application.ts`同时承担Registry、metadata、Prompt、Getting Started与诊断且体量过大，因此按真实读写职责拆为`workspace-query-application.ts`和`workspace-command-application.ts`；Project、Service与Project Daily Progress Application职责和体量仍可维护，不为Query/Command目录对称机械拆分。Project与Service的创建、附接、物化、Git身份冲突和Workspace mutation因副作用生命周期独立，分别由`project-creation-application.ts`、`service-creation-application.ts`拥有；Manifest兼容解析、序列化和写入归对应Repository。`interfaces/cli/workspace.ts`、`project.ts`、`service.ts`分别只保留所属领域的参数、调用与输出适配，公共Bootstrap不再实现Workspace命令描述或Project/Service业务写入。各Manifest/Registry Repository与Workspace Management Fence继续独立，并通过明确Runtime type接入`workspace/module.ts`的私有组合；Bootstrap只通过显式runtime port保留当前内部调用兼容，不再由Workspace实现直接向进程级共享runtime注册方法。

Project Daily Progress 也已作为 Project-scoped Workspace 能力迁入该模块：纯模型位于 `domain/project-daily-progress.ts`，用例位于 `application/project-daily-progress-application.ts`，ignored YAML 映射和唯一原子 writer 位于 `persistence/project-daily-progress-repository.ts`，CLI/HTTP Adapter 由 `interfaces/` 提供，并统一通过 `workspace/module.ts` 注册命名 Application capability 与 contributions。公共 CLI/HTTP Host 不再直接注册或实现 Daily Progress 业务路由；公开 CLI、HTTP、JSON、YAML schema、Task 引用与 writer authority 保持不变。

Change、OpenSpec、Publication、Project Verification 和其他 Workspace 范围能力不因作用于 Project/Service 就自动归入 `workspace/`。其中 Change 与 OpenSpec 已归入 `task/`，Publication 已归入 `system/`，Project Verification 已归入 `verification/`；这些模块通过窄 capability 与 contribution 接入 Bootstrap，不复制 Workspace writer。

## `verification` 模块

`verification/`只拥有Project测试地图的parsing、validation与Application；测试执行由Agent调用Project工具，Task Verification报告归`task/`。Task Execution Record已删除。

本轮迁移删除Task Execution Record的CLI、HTTP、JSON、SQLite表和本机正文；其他专业authority保持独立。

## `agent-assets` 模块

`agent-assets/` 管理面向 Agent 的工作资产和运行时投射。

`agent-assets` 是“所有提供给 Agent 使用的资产”的模块名称，命名保持不变。它不是“工作资产（Work Asset）”的同义词：Work Asset 是更宽的产品概念，还包括 Specs、Project/Service facts 和协作流程等不一定归属于本模块的内容。

Agent Assets 平台迁移已经完成，当前生产结构为：

```text
agent-assets/
  application/
    rules.ts
    skills.ts
    commands.ts
    components.ts
    runtime.ts
    runtime-projection.ts
    package-maintenance.ts
    package-maintenance/       # Builtin、package sync、receipt 与验证私有协作者
  infrastructure/
    runtime/
      adapter-contract.ts
      projection.ts
      check-runtime.ts
      render-claude-code.ts
      render-claude-code-rules.ts
      skills/                  # source、Capability Binding、render plan 与 receipt
  interfaces/
    cli/
      agent-assets.ts         # Agent Assets command contributions
    http/                     # Agent Assets HTTP 契约与 Adapter
  module.ts                   # Bootstrap 唯一装配入口
```

本模块当前没有独立 Domain 或 Persistence，因此不创建空目录。Rule、Skill、Command 和 Component 的 manifest/内容仍是 Workspace 源资产，不因代码归入 Agent Assets 而变成独立数据库领域对象；模块专属 CLI 与 HTTP Adapter 位于 `interfaces/`，仍由公共 Host 统一解析和分发。

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

Bootstrap 恰好安装一次 `agent-assets/module.ts`。旧的 `src/application/domains/{rules,skills,commands,components,runtime}.mjs`、`src/application/package-maintenance*`、`src/application/runtime.mjs` 和 `src/infrastructure/runtime/` 已退出；`legacy-runtime-module` 不再逐项注册这些能力。通用文件系统、进程、网络、Git 和原子写入机制继续属于全局 Infrastructure，Agent Assets Infrastructure 只保留 Agent runtime adapter、投射计划、冲突检查和 receipt 等专属技术语义。

产品入口 `buildr` Skill 与 Workspace Builtin、package runtime source 的长期合并或删除关系，仍作为后续产品重构线索保留；本次平台迁移只收敛现有实现所有权，不改变三者的产品语义或 writer authority。

`.buildr/agent-runtime/` 保存投射所有权回执、来源摘要和文件清单等本机控制状态，不是源资产，也不是实际投射结果。实际投射结果位于 `.agents/`、`.claude/`、`CLAUDE.md` 等 Agent 原生位置。

## `web` 模块

`web/` 是 Buildr Web 的后端宿主模块，作为一级模块存在，不放入 `system/`。

```text
web/
  application/
    instance-lifecycle.ts     # 默认实例启动、复用、交接与清理编排
    preview-lifecycle.ts      # Preview 实例编排
  infrastructure/
    instance-runtime.ts       # Web 专属 receipt、锁、健康与退出适配
    directory-picker.ts       # 平台目录选择适配
  interfaces/cli/
    web.ts                    # buildr web 与 preview command contributions
  module.ts                   # 向 Bootstrap 注册生命周期能力
  http/
    server.ts                 # 创建、监听和关闭 Node.js HTTP Server
    router.ts
    session.ts
    static-files.ts
    responses.ts
    read-executor.ts
    read-worker.ts
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

Web Runtime Host 已完整迁入上述 `web/` TypeScript 技术层：默认实例、Preview、端口、PID、锁、Secret、Launcher 交接、异常恢复和清理由 `web/application/`、`web/infrastructure/`、`web/interfaces/cli/` 与 `web/module.ts` 负责；HTTP Server、Router、Session、安全边界、bounded read executor 与 `web-dist` 静态托管由 `web/http/` 负责。公共 Host 只分发 Bootstrap 装配的 HTTP contribution，不导入 Workspace、Task、Change、Publication 或 Installation 的业务 Controller，也不取得业务 writer authority。旧 `interfaces/local-app/http` 与 `interfaces/local-app/runtime` 实现路径已退出。

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

System Installation 已完成 TypeScript 迁移。installation identity/origin/registry、CLI Update、Installation Status、Release Awareness、npm installation lifecycle、Launcher binding 与 Launcher 管理通过 `system/installation/module.ts` 向 Bootstrap 提供窄能力及 CLI、HTTP、Diagnostic contribution；Doctor 与 Bootstrap 消费正式 Application/identity/launcher port，不再依赖临时 compatibility Facade。

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

当前实现由 `system/doctor/module.ts` 注册 Doctor CLI 与 Application port，并在所有业务模块安装完成后接收最终 Diagnostic contribution 列表。诊断实现和结果模型位于 `system/doctor/application/*.ts`；旧 `application/doctor.mjs` 与 `application/doctor/` 路径已删除。该装配顺序保证 Doctor 可以观察完整模块图，同时保持诊断只读和各模块 writer 唯一。

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

通用 Infrastructure 边界已经在当前源码树收敛：Workspace SQLite 连接和 migration ledger、全局有序 DDL migrations、filesystem、Git、process、network、platform 与产品调用适配均由 `src/infrastructure/` 提供；Task、Workspace 等业务 Repository 已继续迁回所属模块。历史 Infrastructure Child 没有独立交付结果时，不能事后用 Child completed 或 Git commit 冒充交付证明；最终架构收敛 Child 必须基于 current tree 重新验证该边界，并在自身Task结果中说明覆盖关系。

例如：

```text
task/persistence/task-repository.ts
task/persistence/task-project-repository.ts
task/persistence/task-service-repository.ts
task/persistence/task-change-repository.ts
infrastructure/sqlite/workspace-sqlite.ts
infrastructure/sqlite/transaction.ts
infrastructure/sqlite/migrations/NNNN_<change>.sql
```

## `bootstrap` 模块

`bootstrap/` 负责启动 Buildr、创建运行上下文、装配 Infrastructure、注册业务模块和形成 CLI 入口。它相当于 `SpringApplication.run(...)`、`@Configuration` 和 ApplicationContext 的创建、配置与组装职责。

目标结构：

```text
  bootstrap/
    cli/
      main.ts                  # CLI Host：组装 runtime、注册命令、分发请求
      registry.ts              # 命令注册表
      help.ts                  # Help 输出
      diagnostics.ts           # CLI 错误和诊断输出
```

`bin/buildr.mjs` 启动一个 Node.js 进程并转交 `bootstrap/cli/main.ts`。Bootstrap 随后完成运行上下文创建、模块导入与注册、CLI 路由注册和请求分发。普通 CLI 命令完成后进程退出；执行 `buildr web` 时，同一个进程继续承载 HTTP Server。

`bootstrap/cli/` 统一拥有 CLI 进程入口、公共解析、命令 registry、Help、诊断和分发。Task、Workspace、Agent Assets、Web、System 等模块分别在自身 `interfaces/cli/` 中拥有模块特有的参数、DTO、输出和错误映射，并通过模块公开入口向统一 Host 贡献 command descriptor。所有 CLI Adapter 必须保持薄，真实行为继续由对应模块的 Application 或明确公开能力承担。

当前没有必要创建 `bootstrap/web.ts`。只有未来出现真正独立的 Electron、Worker 或其他可执行进程时，再增加相应 Bootstrap 入口。

原 `application/compose-runtime.mjs` 的组装职责已经迁入 `bootstrap/`。当前 `bootstrap/runtime.ts`、`module-registry.ts` 与模块公开入口共同完成显式装配；`legacy-runtime-module.mjs` 已删除。保留在组合 Runtime 上的既有进程内调用由模块声明的正式 runtime port 投射，不再携带临时 owner、scope 或退出元数据，也不形成第二 composition root。

## 模块公开入口与注册

业务模块使用根部 `module.ts` 作为公开注册入口，例如：

```text
bootstrap/cli/main.ts
    ↓ import
task/module.ts
    ↓ createTaskModule({ taskStore, workspaceReader, clock, ... })
Task Application、CLI/HTTP contributions、diagnostics、lifecycle
```

这是显式的轻量组装机制，作用类似 Spring 的 `@Configuration`，但不提供依赖扫描或自动注入。Node.js 仍然先按 ESM 规则 `import` 模块，再显式调用创建或注册函数；注册不会让其他文件自动获得可直接使用的 Import。

它的价值是让 Bootstrap 依赖模块公开入口，不逐个了解模块内部文件。`module.ts` 只公开稳定组装能力，不承载业务规则，也不要求为每个小目录建立注册文件。当前技术栈使用 ESM 显式注册已经足够，不引入额外的 DI 或模块扫描框架。

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
| 唯一 writer | Task Record Application在一个同步事务内协调`task-repository.ts`及三个关系Repository；CLI、HTTP和Doctor不各自编写更新SQL |
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
src/bootstrap/cli/main.ts
    ↓
src/bootstrap/cli/registry.ts
    ↓
对应模块 interfaces/cli/<command>.ts
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
bootstrap/cli/main.ts
    ↓
bootstrap/cli/registry.ts
    ↓
web/interfaces/cli/web.ts
    ↓
web/application/instance-lifecycle.ts
    ↓
web/http/server.ts
```

对应职责为：

- `bootstrap/cli/registry.ts` 统一发现并分发 Web command descriptor；
- `web/interfaces/cli/web.ts` 解析 `--target`、`--port`、`--no-open` 等模块特有参数并映射结果；
- `web/application` 判断复用还是创建 Web 实例，并管理实例生命周期；
- `web/http` 创建 HTTP Server，拥有 Router、Session、安全边界、bounded read executor 与 `web-dist` 静态托管，并只分发模块 HTTP contribution。

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

`tools/development/` 负责使用声明的 Node/npm 运行源码 checkout、启动 Development CLI、生成 ignored HTTP DTO 与 `web-dist`、安装或更新 Development Launcher，以及其他只服务 Buildr 开发环境的工具。Development Launcher manager 必须在 Launcher 变更前完成这一准备，使干净 checkout 可直接启动 Web。

`tools/release/` 是 checkout-only 发布编排边界，负责 release selection/provenance、readiness/convergence adapter、构建 npm 发布物，以及版本、Tag、Registry、GitHub Release和Release Artifact的检查或受保护入口。它不取得System Installation、Verification、Task/Finish/self-bootstrap或Bootstrap的writer authority；tag、npm、dist-tag和GitHub Release公共mutation仍只由protected publish workflow执行。

current `release-<version>`模型使用以下协作边界；selection、Candidate、correlation、readiness、受保护发布事务和Git收敛均已由对应owner实现并通过窄read model协作，任何owner事实缺失或漂移都不得回退为旧`dev → main`自动发布路径：

| owner | 职责 | 允许的consumer方式 |
|---|---|---|
| `tools/release` | 人工selection、Git provenance、readiness/convergence adapter | 输出baseline、selection chain、release HEAD/tree与closed findings |
| `src/system/installation` | SemVer、package/version、release track、installation identity | 通过Domain/Application公开能力复用版本语义 |
| `src/verification` | Product Candidate、execution evidence与唯一tarball | 消费精确release source，输出matching Candidate/artifact identity |
| `src/task` | Task Record、Review、Verification、父任务协调与Worktree provider | 只提供各自Application/read model或窄Git位置能力，不保存release正文 |
| self-bootstrap runner | matching retained Activation与Diagnostics | 提供closed result/readback，不写Delivery或Publication |
| Bootstrap | 唯一composition root | 只装配窄requires/provides与接口，不实现发布业务规则 |
| protected `publish.yml` | tag、npm、dist-tag、GitHub Release、Registry readback | 消费matching context和唯一tarball，输出transaction evidence |

这些owner之间不得直接写对方Persistence、复制专业Result或建立release旁路SQLite store。

`src/` 不依赖 `tools/`。验证主体和验证入口统一位于 `test/verification/`，不增加 `tools/verification/`。

## 当前根工程职责

Buildr Service 当前按生命周期使用以下目录：

```text
bin/          稳定可执行入口
src/          产品运行源码
resources/    文件型交付资源
web-dist/     ignored本地静态输出；正式Candidate使用隔离staging
test/         测试与 verification
tools/        checkout-only development/release 工具
docs/         维护者与公开文档
```

`package/` 仅 deferred 保留 Runtime Buildr Skill 与 Launcher 构建/兼容入口。Runtime Buildr Skill 由后续 Agent Assets Contribution 决定；Launcher 的安装身份、绑定、状态和管理行为已经迁入 `src/system/installation/`，`package/launchers/` 不得重新取得 System Installation authority。不得扩大 `package/` allowlist，也不得让它成为新资源或 runtime 源码的 owner。

模块迁移仍按下列目标继续：

```text
bin/buildr.mjs
    → 保留为稳定薄入口，内部转交 src/bootstrap/cli/main.ts

src/interfaces/cli/
    → 公共 Host 迁入 src/bootstrap/cli/
    → 模块特有 command adapter 迁入对应模块 interfaces/cli/

src/bootstrap/
    → 已接管进程、CLI Host、模块 registry 和显式组装
    → 所有模块通过各自 module.ts 提供窄 requires/provides/contributions
    → legacy-runtime-module.mjs 与临时 compatibility Facade 已退出

src/web/http/*.mjs
    → 已迁移为 src/web/http/*.ts；公共 HTTP 宿主仍位于 src/web/http/
    → 业务 HTTP Controller 已按所有权迁入对应模块 interfaces/http/

src/web/runtime/
    → 已删除；实例、Preview 和维护编排位于 src/web/application/，目录选择等适配位于 src/web/infrastructure/

src/application/{workspace,project,service}/ 与相关全局 persistence
    → Workspace Core 已迁入 src/workspace/

src/application、src/domain、src/interfaces 中的 Task 专业入口
    → Task Record、Review、Retrospective、生命周期核心、Delivery 与 Finish 已迁入 src/task/
    → 旧全局 Task Domain、Application、Persistence 与 Interfaces 入口已退出，不再保留后续迁移切片

installation、update、status、Launcher 与 product identity
    → 已迁入 src/system/installation/

src/application/doctor.mjs 与 src/application/doctor/
    → 已删除；Doctor 命令、Application、结果模型和诊断位于 src/system/doctor/

```

## 渐进式迁移原则

当前 Buildr Service 已形成 Bootstrap、Infrastructure、Task（含 Change 与 OpenSpec）、Workspace Core、Agent Assets、System Publication、Web Runtime Host、System Installation 与 System Doctor 的显式模块结构；本轮遗留 Runtime Host 和 Doctor 入口已经收敛。后续结构演进继续遵循：

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

Task Record 是首个纵向参考切片；其后 Task 生命周期、Workspace、Agent Assets、Installation、Web Runtime Host 与 Doctor 已沿同一范式收敛。最终 HTTP/Diagnostic contribution 装配验证了公共 Host 可以保持技术语义，而业务 Controller、Read Model 和 writer authority 仍归所属模块。

## 迁移台账与第一轮完成定义

迁移台账按生产职责和能力单元维护，不在父任务计划中枚举每个生产文件。每个能力单元至少记录稳定名称、事实owner、职责边界、主要入口、writer/authority、目标模块以及`migrated|deferred`处置。

第一轮完整能力台账如下。`Verification owner` 表示当前证明该边界的测试或 Project capability，不表示 Verification 取得业务 authority。

| 能力单元 | 当前 owner 与主要入口 | writer / authority | Verification owner | 处置 | deferred 理由与触发条件 |
|----------|----------------------|--------------------|--------------------|------|--------------------------|
| Bootstrap composition 与 CLI Host | `src/bootstrap/runtime.ts`、`module-registry.ts`、`bootstrap/cli/*.ts` | 唯一模块安装、capability/contribution registry 与公共 CLI 分发；无业务 writer | Bootstrap/architecture contract、`product.delivery` | `migrated` | — |
| 通用 Infrastructure | `src/infrastructure/`；SQLite ledger/migrations、filesystem、Git、process、network、platform、product invocation | 只拥有跨模块技术机制；业务 Repository、DAO、Mapper 与表语义归所属模块 | workspace-sqlite、architecture boundaries、`product.delivery` | `migrated` | — |
| Task 核心能力 | `src/task/module.ts` 及 `domain/`、`application/`、`persistence/`、`interfaces/` | Task Record、Review、Verification与父任务协调（Task Parent Coordination）各自保留唯一事实边界；复盘只有Task Record文档摘要和只读文件入口 | Task contract/integration suites、`product.delivery` | `migrated` | — |
| Workspace Control Plane | `src/workspace/**/*.ts`、`src/infrastructure/product-resources/` | Workspace/Project/Service registry、onboarding、mutation recovery 与 declaration-intake 编排各自唯一 writer；product-resources 只拥有 manifest/path/enumeration 技术能力；Task 引用只读校验 | workspace/project/declaration/package contract 与 integration suites、`product.delivery` | `migrated` | — |
| Agent Assets | `src/agent-assets/**/*.ts` | Rule、Skill、Command、Component、Builtin、Package Assets 与投射继续区分源资产和可重建 runtime authority | capability contracts、package static validation、managed-mutations、`product.delivery` | `migrated` | — |
| Web 实例生命周期 | `src/web/application/`、`infrastructure/`、`interfaces/cli/`、`module.ts` | 只拥有实例启动/复用/维护、Preview、端口、PID、锁与 Secret 编排；该模块已全部使用 TypeScript | Web runtime integration/browser selectors、`product.delivery` | `migrated` | — |
| Web HTTP 公共宿主与静态托管 | `src/web/http/server.ts`、`router.ts`、`session.ts`、`static-files.ts`、`responses.ts`、`read-executor.ts`、`read-worker.ts`、Application Payload 中的 `web-dist` | Server 只拥有 loopback/listen/close 与资源生命周期；Router、Session/请求安全、响应、静态文件和只读执行资源各有窄 owner；`buildr-web` 仍是前端源码/构建 owner | buildr-web-http、Web HTTP architecture contract、web-dist/browser smoke、release artifact set | `migrated` | — |
| 业务 HTTP Controller | Workspace、Task、Change、Publication、System Installation 各模块 HTTP contribution | writer 与 Read Model 继续归各业务模块，公共 Host 只分发 | HTTP/system suites、`product.delivery` | `migrated` | — |
| System Installation | `src/system/installation/**/*.ts`；release version 规则位于 `domain/release-version.ts` | installation identity/origin/update/status/npm lifecycle 与 Launcher 唯一 writer；Release Awareness 与 release tools 复用同一版本 Domain | installation/npm-launcher/release artifact tests | `migrated` | — |
| System Doctor 与 Diagnostic 装配 | `src/system/doctor/`；各模块提供 `diagnostics` contribution | Doctor 只读观察和聚合，不拥有任何业务 writer | Doctor/system suites、`product.delivery` | `migrated` | — |
| 遗留入口与临时 Facade | 旧 `src/web/{http,runtime}`、`src/application/doctor*`、`src/bootstrap/legacy-runtime-module.mjs` | 不保留 writer、转发实现或第二注册路径 | architecture verification、Application Payload validation | `migrated`（已删除） | — |
| 发布物一致性 | `tools/release/application-payload.ts`、package static validation 与 verification registry | Application Payload 是 runtime/read Worker/`web-dist` 的唯一发布清单 | `product.release-artifact-set`、`product.delivery` | `migrated` | — |
| Change | `src/task/change/module.ts`、`src/task/change/application/`、`src/task/change/interfaces/http/` | Task Change Application 继续拥有 Change 查询与 Task-scoped Change read model；通过 OpenSpec Query 读取 checklist | change application integration、architecture verification | `migrated` | — |
| OpenSpec convergence | `src/task/openspec/module.ts`、`src/task/openspec/application/*.ts` | OpenSpec canonical apply/converge/sync/recovery authority 保持唯一；模块公开 CLI 与窄 Query，不并入 Change writer | `product.openspec-convergence-journey`、`product.archive-lifecycle` | `migrated` | — |
| Publication | `src/system/publication/**/*.ts` | System Publication 只读拥有 publication/asset read model；不依赖 Change/OpenSpec，不拥有 writer | publication application integration、`product.delivery` | `migrated` | — |
| Project Verification | `src/verification/**/*.ts`，由Bootstrap和Task Verification消费 | 只校验、读取和更新Project测试地图；正式验证进程、deadline和资源协调技术机制也已纳入严格类型检查。Task验证报告writer仍归Task模块 | project/task verification unit/integration、architecture boundaries、`product.delivery` | `migrated` | — |

### 全局生产 residual 最终收敛

第二轮完成后，`src/application/`、`src/domain/`、`src/interfaces/` 不再保存生产文件。原 residual 已按唯一 owner 收敛：

| 原职责 | 最终 owner | Verification owner | 处置 |
|--------|------------|--------------------|------|
| Declaration Intake next-action contract | `src/infrastructure/contracts/declaration-intake.ts` | declaration-intake unit、Project测试地图integration | `migrated` |
| Public JSON schema identity 与 envelope helper | `src/infrastructure/contracts/public-json.ts` | public-json-contracts system、architecture verification | `migrated` |
| 旧 internal workflow route inventory/router | 已删除且不提供替代聚合层 | Task lifecycle contract、architecture verification | `migrated`（已删除） |
| Git Worktree CLI Adapter | `src/task/interfaces/cli/git-worktree.ts` | Git Worktree contract、CLI architecture | `migrated` |
| Release Version Domain | `src/system/installation/domain/release-version.ts` | release awareness、release contract/cold-start | `migrated` |

完整 JSON Schema、Ajv、DTO 自动生成与 buildr-web typed client 仍属于后续 `evolve-buildr-http-contract-system`，不因本次 identity/envelope 结构迁移而被视为完成。

Child Task 对自己实际移动、拆分、新增和删除的文件承担精确清单、影响范围、验证证据和旧入口退出责任。父任务通过自身目标、可读计划文档、直接Child关系和真实结果协调，不维护Parent Plan mutation或Contribution Handoff。

第一轮只有在以下条件同时成立时完成：

- 所有生产职责都已进入迁移台账并得到 `migrated|deferred` 处置；
- 所有计划迁移的能力单元均有matching Child结果或明确的放弃/替代处置；
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

Verification 的公开契约演进（完整 JSON Schema/Ajv/DTO/Typed Client）、测试指导扩展、调度模型和 Result 语义变化仍作为独立后续 Change；本轮只完成现有实现的 owner/目录边界迁移。

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

建立一个“Buildr 服务分层和模块组织重构”父任务，并在父任务的 intent 和 scope 中引用本文件，作为结构目标、迁移边界和验收依据。Parent只维护目标、关系和自己的结果判断，不要求Parent Plan、Environment或Development作为协调前置。

父任务计划写入其intent或具名可读文档，说明总体目标、架构约束、真实依赖和最终验收；直接Child状态与结果继续由Task Record读取，不建立Parent Plan mutation、Contribution Map或第二进度表。

子任务按能够独立交付和验证的结构切片建立，并通过直接`parentTaskId`关联父任务。一个一级模块可以根据实际范围拆成多个子任务；不要求一个目录对应一个子任务。Child只有在真实需要时创建，并按自身目标选择OpenSpec、工作位置、Review、Verification、Git与收尾能力，不补造统一流程记录。

第一轮子任务只承担结构迁移。需要改变功能、系统行为、产品设计或验证体系的问题，另行建立后续任务，不混入当前结构迁移子任务。

Child completed 不等于 Parent 已完成。Agent从真实Child结果、代码、Git和外部系统重新检查总体目标；只有用户明确授权父任务完成时，Parent管理才记录结果。Task Review、Verification、Git、默认Task Finish与具体资源owner保持独立，由Agent按实际目标组合。

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

- Package Maintenance；
- Release Awareness；
- 通用 Project Verification；
- 产品入口 `buildr` Skill、Workspace Builtin 与 package runtime source 的最终关系；
- 当前大文件的具体拆分；
- `test/` 与业务模块、测试层级的最终对应；
- Verification 体系本身的后续重构；
- 具体迁移顺序和子任务划分；
- 结构迁移过程中形成的功能、模块、系统和产品建议。
