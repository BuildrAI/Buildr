# Buildr 技术架构

本文是 Buildr 已实现技术架构的入口，帮助维护者快速判断：源码由谁拥有、模块如何协作、数据写在哪里、运行时如何形成，以及关键流程应继续阅读哪份文档。

本文不是行为规范、迁移台账或实现清单。规范性行为以 [OpenSpec specs](../../specs/) 为准；单个 Service 的详细职责见 [Buildr Service](../services/buildr.md) 与 [Buildr Web Frontend Service](../services/buildr-web.md)；源码目录和分层约定见 [服务分层与模块组织](../../../docs/architecture/service-architecture.md)。

## 一页架构图

```text
Product Project: projects/product/
├── OpenSpec / docs / knowledge / Service registry
└── Services
    ├── buildr-web                         React / Vite 前端源码
    │     └── build ───────────────────┐
    └── buildr                         │
          ├── bin/buildr.mjs           │  稳定薄 CLI 入口
          ├── src/bootstrap/           │  唯一进程组装入口
          ├── src/workspace/           │  Workspace / Project / Service
          ├── src/task/                │  Task Record / Review / Verification / Parent Coordination / Worktree
          ├── src/agent-assets/        │  Rule / Skill / Component 与 runtime 投射
          ├── src/verification/        │  Project 验证执行
          ├── src/web/                 │  Buildr Web Runtime 与本机 HTTP Host
          ├── src/system/              │  Installation / Doctor / Publication
          ├── src/infrastructure/      │  SQLite / Git / 文件 / 进程 / 网络
          └── web-dist/ <──────────────┘  ignored本地静态输出

Candidate隔离staging ── Web dist + Test Context + DTO + manifest
Buildr npm package
└── CLI + Application Payload + migrations + resources + frozen web-dist
      ├── 命令行调用
      ├── loopback Buildr Web
      └── 向 Agent runtime 投射受管工作资产
```

这套结构遵守三个基本方向：

- Product Project 管治理事实，Service 管可执行实现。
- Bootstrap 只负责组装；业务模块拥有自己的语义、Application 和数据写入权。
- Buildr 提供可信事实、确定性安全边界和少量安全原语；Agent 负责理解目标并选择专业动作。

## 所有权与源码边界

| 范围 | 当前职责 | 不负责 |
|------|----------|--------|
| `projects/product/` | 产品治理、OpenSpec、文档、当前认知和 Service registry | CLI、HTTP 或业务运行实现 |
| `services/buildr/` | CLI、Application、Buildr Web Runtime、数据存储、验证、npm package 和发布实现 | Buildr Web React/Vite 权威源码 |
| `services/buildr-web/` | React/Vite/TypeScript 前端源码、依赖和正式构建 | 生产 HTTP、session、SQLite 或业务 writer |
| 用户 Workspace | Workspace/Project/Service registries、用户长期工作资产和本机 Task 事实 | Buildr 产品包源码 |
| Agent runtime 目录 | Buildr 从 Workspace 源资产生成的可重建投影 | 长期事实源和业务 authority |
| Product Data Root / Web Data Root | installation、Launcher、Web instance 和本机协调状态 | 可移植工作资产或 Git 内容 |

Workspace 中由 Buildr 交付的 Rules、Skills、Commands 和 Components 是安装结果，只能由 Product checkout 的 `update` / `sync` 单向物化。Agent runtime 投影可以重建，不能反向成为 Workspace 源资产。

Project 和 Service source 统一通过 Workspace registry 解析：

- 未声明 `root` 的 v2 source 使用受管根（Managed Root）。
- `root: attached` 表示登记机器本地已有的绝对 Git top-level。Buildr 只拥有 registry relation，不因 attach 获得外部仓库内容所有权。
- 任何 mutation 都必须由实际 consumer 继续证明目标 identity、路径和 ownership，不能凭目录名推断权限。

相关术语见 [Workspace、Managed Root 与 Attached Root](../glossary.md)。

## Buildr Service 模块

Buildr Service 根目录按工程职责组织，`src/` 先按业务或产品模块划分，模块内部再按 Domain、Application、Persistence、Infrastructure 和 Interfaces 等真实需要分层。

```text
services/buildr/
├── bin/                  npm executable 的稳定薄入口
├── src/                  产品运行源码
├── test/                 Unit 到 System / Browser 的测试与验证
├── resources/            随产品交付的文件型资源
├── web-dist/             buildr-web按需生成的ignored本地静态输出
├── tools/                只服务 Buildr checkout 的开发与发布工具
├── package/              有明确兼容 owner 的保留实现
└── docs/                 Service 使用和维护文档
```

### 进程组装

`src/bootstrap/` 是唯一进程级 composition root。`bin/buildr.mjs` 只进入 Bootstrap CLI；Bootstrap 显式注册模块 descriptor，检查模块 identity、依赖、公开能力、CLI/HTTP/Diagnostic contributions 和成对生命周期。

模块按注册顺序启动、逆序停止。部分启动失败只回滚本次已启动资源。业务模块不依赖目录扫描、导入副作用或全局 Runtime lookup 完成组装。

### 业务与产品模块

| 模块 | 拥有的主要职责 | 公开协作边界 |
|------|----------------|--------------|
| `workspace/` | Workspace、Project、Service、Project Daily Progress、registry 与 source 解析 | Workspace/Project query、CLI/HTTP/Diagnostic contribution |
| `task/` | Task Record、Review、任务验证报告、父任务协调（Task Parent Coordination）与复盘文档只读边界 | 专业Application、窄read capability、CLI/HTTP/Diagnostic contribution；复盘分析由Skill和Agent完成 |
| `agent-assets/` | Rule、Skill、Command、Component、Builtin/package maintenance 和 Agent runtime 投射 | runtime projection、capability binding、CLI contribution |
| `verification/` | Project verification declaration、capability execution、资源协调和 transient evidence | verification Application 与 execution result |
| `web/` | Buildr Web 实例、Preview、session、安全、静态文件和本机 HTTP Host | loopback HTTP、业务 HTTP contribution 分发 |
| `system/installation/` | 安装身份、版本感知、update 和 Launcher binding | CLI、release-awareness HTTP、诊断读取 |
| `system/doctor/` | 跨模块只读诊断聚合 | CLI 与结构化 Diagnostic Result |
| `system/publication/` | 发布物只读查询 | Publication HTTP contribution |

模块只公开协作者真正需要的窄能力。公共 CLI Host、HTTP Host 和 Doctor 不重新实现业务语义，也不取得专业 writer authority。

### 通用基础设施

`src/infrastructure/` 只提供通用技术机制：

- SQLite 连接、全局有序 migration、事务和锁；
- filesystem identity、路径 containment、symlink 与原子写入；
- Git、process、network、platform 和 Product invocation；
- 通用 JSON Schema 编译、公共 identity/envelope 等跨模块契约机制。

业务 Schema、错误语义、DTO mapping 和写入规则仍由所属模块拥有。Infrastructure 不成为业务状态仓库或全局 service locator。

## 主要调用链

### CLI

```text
bin/buildr.mjs
  → bootstrap/cli/main
  → Bootstrap module registry
  → 模块贡献的 CLI adapter
  → 专业 Application
  → 专业 Repository 或外部 effect port
```

CLI adapter 负责参数和结果映射，不复制 Application 规则。正式 Task 的受管消费者通过 retained controller 与内部 route 调用同一 Application，不另建第二套业务实现。

### Buildr Web

```text
Browser
  → loopback Buildr Web Runtime
  → session / Origin / request validation
  → 模块贡献的 HTTP Controller
  → 专业 Application 或 read model
  → SQLite、registry 或受控文件读取
```

Buildr Web Runtime 只监听 loopback，并同源托管 `web-dist`。HTTP Host 负责传输、安全、session 和资源限制；Workspace、Task、Installation、Publication 等业务 Controller 由对应模块贡献。

普通 GET 只读取已保存事实，不执行 Git、Environment provider、Content Target observation、migration 或 Finish 扫描。Web 页面不通过拼装多个响应建立第二个业务 authority。

### Agent runtime 投射

```text
Workspace 源资产
  → Agent Assets render plan
  → ownership / conflict / integrity 检查
  → adapter 原生 runtime 目录
  → projection receipt 与局部 binding evidence
```

Runtime adapter 只投射受管 Rules、Skills、contributions 和 consumer-local capability binding。Project 普通知识、Service repository 和 Task 本机状态不会复制进 Agent runtime。

## 数据与写入权

| 数据 | Authority | 写入者 | 生命周期 |
|------|-----------|--------|----------|
| Workspace、Project、Service 与资产 registries | Workspace 源文件 | 各领域 renderer/writer | 可进入 Git 的长期事实 |
| OpenSpec specs / changes / knowledge | Product Project 文件 | OpenSpec 或 current knowledge 对应流程 | 可进入 Git 的产品事实 |
| Task current records | `.buildr/local/workspace.sqlite` | 各专业 Application + Repository | Workspace 本机 current facts |
| SQLite schema | 随 npm package 交付的连续 SQL scripts | SQLite infrastructure migration | 只允许前向迁移 |
| Project Daily Progress | `.buildr/daily-progress/<project>/<date>.yml` | Daily Progress Application | Git ignored 的本机日事实 |
| Agent runtime ownership receipts | `.buildr/agent-runtime/` | Agent Assets runtime projection | 本机控制状态，可重建 |
| Web instance、Launcher 和管理 claim | Product/Web Data Root 与 Workspace local state | Web / Installation owner | 本机运行协调状态 |

专业 Repository 只持久化所属 closed payload、必要查询字段和完整性约束。不存在跨专业 current 副本或聚合 writer；页面和 Agent 按需读取 Task Record 及各专业 Application 的独立投影。

SQLite 是每个 canonical Workspace 独立的 local-only Structured Store，不进入 Git、同步或 Agent runtime。共享团队 authority 属于未来 Server/Cloud 边界，不能通过同步本机数据库实现。

## 任务收尾与专业能力

默认收尾由智能体（Agent）读取收尾技能（Skill），组合 Git、系统工具和已有 Buildr 接口完成目标。完整参与者、调用关系、状态、清理安全与自举边界集中在 [任务收尾](../flows/task-closeout.md)。

任务记录保存结果；Git 和外部系统拥有交付事实；Worktree、Preview 等具体资源所有者分别保护自身删除安全。普通完成不要求候选、交接、五阶段或额外对账，也不把完成记录冒充机器验证。

Agent直接读取当前Task、代码、Git、文件、运行现场和所需专业结果后选择开发动作。Task Entry Snapshot、`task next`、任务研发聚合、任务规划身份、统一Task Environment、独立Task Overview和旧机器交付历史均已删除。Buildr Web直接展示Task Record，并按需分别读取Review、Verification与父任务协调，不计算跨专业完成状态。

## Runtime、构建与分发

### Node 与 TypeScript

- Product checkout 由 `.node-version` 固定 development Node `24.15.0`。
- npm package 的 Host Node 范围由 `package.json#engines.node` 声明，当前为 `>=24.15.0 <25`。
- 后端允许 `.mjs` 与仅含可擦除类型语法的 `.ts` 渐进共存，并通过严格 `noEmit` typecheck 约束。
- 正式 npm package 使用锁定 bundler 将同一模块图冻结为单一 CommonJS Application Payload；tarball 不运行 TypeScript compiler，也不携带开发类型工具链。

### Buildr Web 交接

`buildr-web`是前端源码authority。本地构建可写入ignored sibling `buildr/web-dist/`；Browser与Candidate向隔离staging构建并直接消费matching结果。npm package只携带Candidate冻结的Web dist，不携带`buildr-web`源码或Vite toolchain。

released 与 development Web profile 使用隔离的 Data Root、instance receipt、锁和日志，可以并存。Launcher 只保存已验证的 Host Node、package entry、channel 和端口策略，不复制 Buildr、Node 或前端源码。

### 安装与自举

npm package 是唯一正式 Buildr 安装。机器 PATH 中的 `buildr` 属于 npm installation；development checkout 使用显式 `projects/product/buildr` 入口，不覆盖默认 CLI。

Buildr 自举只在 matching Task Delivery 后，由专用 self-bootstrap runner 使用 retained Product checkout 和 retained Node 编排 sync、Development Web、入口 identity 与 Doctor。Candidate runtime 不能写 retained canonical Workspace SQLite，也不能替代 retained writer。

## 验证与发布边界

验证分成三个目的不同的层次：

| 层次 | 目标 | 主要入口 |
|------|------|----------|
| 开发反馈 | 快速证明受影响范围，发现直接回归 | affected / admission / 条件 Browser |
| Product Candidate | 对冻结源码、平台、Host Node、Task lifecycle 和 package artifact 做闭合验证 | verification registry 与 Candidate gate |
| 正式发布 | 证明同一 Candidate artifact、发布授权、Registry/GitHub readback 和安装 smoke | protected release transaction |

Project `preparation.yml` 描述已知准备配方，`verification.yml`使用v4测试地图描述稳定测试能力族。地图只登记测试族、适用scope、代码与测试位置、完整入口、选择提示和资源要求，不登记每个测试文件。Agent结合Task目标与当前改动选择并直接调用Maven、npm、Playwright、Browser、HTTP或项目自有runner；Task Verification Application不生成Plan、不执行测试，只保存或查询开发完成后的任务验证报告。准备的实际执行结果由对应Project、Service或外部工具拥有，不进入Task Record或统一环境状态。

多Project Task仍只有一个聚合Content Target和一个任务验证报告。报告保存每个Project实际使用的测试地图identity、检查与gap；Agent负责判断整体覆盖和结论，不让单Project通过代表整个Task。Current Knowledge继续保存按Project完整覆盖的最小dispositions，但不成为Task Verification固定前置。

Buildr Product内部验证分成控制面与执行面。`test/verification/{ownership,registry,planner,dag-scheduler,executor}.mjs`组成Verification Control Plane，负责owner选择、预算准入、依赖与resource grant；公共`src/infrastructure/testing/context-runtime/*.ts`是runner-independent definition、配置identity、worker/suite/test cache、lease、reset、dirty/evict与持久Worker Host的strict TypeScript authority，向ignored本地目录或Candidate staging确定性生成标准ESM与`.d.ts`后通过`@buildr-ai/buildr/test-context`随唯一npm tarball提供，Git不保存编译副本。test-only `test/context/`只拥有Buildr immutable-seed Pool、领域provider和覆盖全部registry step的`context-runtime|hybrid|full-lifecycle`处置：一次plan内prepare并投影versioned seed identity，每个case取得独立Sandbox Lease。outer scheduler同时约束step class、跨plan协调资源和workers/processes/git/workspaceIo数值容量，`node-context-test` Host数只能消费exact grant。Context复用只消除非主要前置成本，不改变Unit/Component/Integration/System边界或primary evidence owner。

Candidate 只构建一份 tarball，平台和 Host Node consumer 复用同一 artifact。正式发布不重新构建 Application Payload 或重新 `npm pack`。完整发布事实链见 [Buildr npm 发布流程](../flows/open-source-release.md)。

Product测试执行框架、Context contract、资源模型与新测试接入流程见 [Buildr Product Verification Framework](../../../services/buildr/docs/verification-framework.md)。

## 跨模块不变量

1. **一个事实只有一个 owner。** CLI、HTTP、Doctor、Overview 和 Agent Skill 只能调用或投影，不复制 writer。
2. **就绪度绑定具体动作。** `ready`、`blocked` 和 `attention` 只描述具体 consumer 的具体 action，不形成 Workspace 或 Agent 的全局许可。
3. **只读入口不产生隐式副作用。** GET、inspect 和 Doctor 不执行 migration、Git、环境准备、恢复或清理。
4. **源码、投影和本机状态分离。** Workspace 源资产可长期治理；runtime projection 可重建；SQLite、receipt、carrier 和 instance state 保持本机或临时边界。
5. **身份和副作用必须可证明。** 写入、交付、清理和外部 mutation 必须证明目标 identity、path、ownership、authority 和当前性；不能证明时保留现场。
6. **Buildr 不替 Agent 做专业决策。** Buildr 提供事实、安全边界和操作原语；Agent 选择 Git、PR、恢复、重新开发或放弃等策略。
7. **规范、当前认知和历史分层。** Specs 定义行为，knowledge 解释当前实现，Change 记录本次设计，archive 只保留历史来源。

门禁分类的完整说明见 [门禁分类与有界审计](governance-gate-taxonomy.md)。

Buildr Product自身的测试runner仍属于项目测试架构，可按Project需要管理timeout、process group、资源和测试上下文；它不是Task Verification Application，也不生成Task Verification专属Execution Record。

## 深入阅读

| 想了解的问题 | 继续阅读 |
|--------------|----------|
| 产品角色、领域模型和产品边界 | [产品架构](product.md) |
| Buildr Service 工程目录与模块分层 | [服务分层与模块组织](../../../docs/architecture/service-architecture.md) |
| Buildr Service 详细接口、数据和运行事实 | [Buildr Service](../services/buildr.md) |
| Product测试选择、Context与层级并发 | [Buildr Product Verification Framework](../../../services/buildr/docs/verification-framework.md) |
| Buildr Web 前端源码、构建和消费边界 | [Buildr Web Frontend Service](../services/buildr-web.md) |
| OpenSpec 从提案到归档的跨模块流程 | [OpenSpec Change 生命周期](../flows/openspec-change-lifecycle.md) |
| npm Candidate、发布与安装事实链 | [Buildr npm 发布流程](../flows/open-source-release.md) |
| Project Daily Progress 的写入与展示 | [项目每日演进](../flows/project-daily-progress.md) |
| Task Finish 的规范性行为 | [Task closeout orchestration specification](../../specs/task-closeout-orchestration/spec.md) |
| 人和 Agent 共用的 canonical 名称 | [术语表](../glossary.md) |
| 文档区域的权威分工 | [Buildr 文档说明](../../../docs/document-index.md) |
