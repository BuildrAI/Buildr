# 服务分层与模块组织

本文约束 Buildr Product 当前代码组织。规范说明可观察行为；本文和[全项目代码地图](../../knowledge/code-map/README.md)说明行为当前落在何处。

## 结论

Buildr Product 由两个 Service 组成：

- `services/buildr/`：后端、CLI、本机 Web Host、持久化、安装、诊断、工程与发布程序；
- `services/buildr-web/`：React 用户界面及前端状态和客户端。

后端产品能力统一位于 `src/modules/`。`bootstrap/` 只装配，`web/` 只承载本机网页技术宿主，`infrastructure/` 只提供跨能力通用机制。取消 `src/system/`、旧一级业务目录与作为长期源码分类的 `package/`。

## Service 根目录

```text
services/buildr/
├── bin/                 薄启动入口
├── src/                 产品运行时实现
├── tools/               研发、构建、代码生成、性能与发布程序
├── test/                后端和产品组合测试
├── resources/           文件型交付源资产
├── docs/                Service 说明
├── build/               生成类型与测试库，Git 忽略
└── web-dist/            前端构建兼托管产物，Git 忽略
```

根目录不按“是否会进 npm 包”分类。是否发布由 `package.json#files`、`resources/manifest.yml` 和 Application Payload 工具决定；源码职责不由发布路径反向决定。

### `bin`

`bin/buildr.mjs` 是 npm `bin` 兼容入口，只定位并委托 `src/bootstrap/cli/main.ts`。它不注册业务、不访问数据库、不复制命令目录。

### `src`

```text
src/
├── bootstrap/
├── modules/
│   ├── workspace/
│   ├── task/
│   ├── agent-assets/
│   ├── project-testing/
│   ├── openspec/
│   ├── installation/
│   ├── diagnostics/
│   └── publication/
├── web/
└── infrastructure/
```

### `tools`

```text
tools/
├── build/launcher/      Development Launcher 工程程序
├── codegen/contracts/   后端 Schema → 前后端 DTO
├── development/         开发环境入口和本机辅助
├── performance/         隔离性能基准
├── release/             Application Payload、Candidate 与发布工具
└── testing/             测试专用生成程序
```

工程工具可以读取产品公开 Schema 或资源清单，但正式产品运行不加载 `tools/` 源码。开发维护命令 `package check` 调用 `tools/verification/package-check.ts`；正式安装缺少开发工具时明确提示需要开发检出。

### `resources`

```text
resources/
├── workspace/           同步到 Workspace/Project 的源资产
├── runtime/             直接安装到 Agent runtime 的源资产
├── installation/        Launcher 图标等安装资源
├── contracts/           文件型公共契约
└── manifest.yml         发布与同步边界
```

`resources/runtime/skills/buildr/SKILL.md` 是 Buildr 产品入口 Skill 的源文件。`package/targets/runtime/` 已退出。

### `build` 与 `web-dist`

普通生成结果统一到服务 `build/`：`build/generated/` 保存协议类型，`build/test-context/` 保存公开测试库。`package/` 已无职责。前端构建仍输出到后端 `web-dist/`，生成与托管消费同一份产物。两个输出目录均被 Git 忽略，源码和构建程序不放入其中。

## Bootstrap 与命名能力

`src/bootstrap/runtime.ts:createRuntime()` 先注册通用 Infrastructure，再按依赖图安装模块。`src/bootstrap/module-registry.ts` 管理：

- `requires`：模块启动前必须存在的命名能力；
- `provides`：模块对其他模块开放的窄端口；
- `contributes`：CLI、HTTP 与 diagnostics 等由 Host 收集的贡献；
- 生命周期：统一 start/stop。

生产 Runtime 只保留平台技术方法和 Bootstrap context。业务消费者必须调用 `runtimeProvide(runtime, CAPABILITY)`，不能依赖 `runtime.createTask()` 之类宽泛、来源不明的方法注入。

### 晚绑定边界

以下循环来自真实双向读取需求，使用一次性 Binder 收敛：

| Binder | 关系 |
|---|---|
| `TASK_CHANGE_BINDER` | Task 向 Change 提供 scope；Change 安装后回绑 Task 详情所需的 resolver |
| `AGENT_ASSETS_DIAGNOSTICS_BINDER` | Agent Assets 先贡献 diagnostics；Doctor 聚合完成后回绑 内置资产修改后所需的诊断端口 |

Binder 只能绑定一次，不允许重新引入完整 Runtime。

## 产品模块

### Workspace

入口：`src/modules/workspace/module.ts`。

责任包括 Workspace identity、Workspace/Project/Service registry、Source Root、受管变更和相关 CLI/HTTP/diagnostics。内部按真实技术责任划分：

- `domain/`：`Workspace`、`Project`、`Service`、`SourceRoot`；每日演进位于任务子能力的领域层；
- `application/`：命令、查询和跨 Repository 用例；业务归一化诊断也归这里；
- `persistence/`：Workspace、Project、Service YAML Repository；
- `infrastructure/`：management fence、source filesystem 与 Git；
- `interfaces/`：CLI 和 HTTP Adapter。

Workspace 多文件写入保留 mutation journal、管理锁、staging/publish 与恢复语义。

### Task

入口：`src/modules/task/module.ts`。

Task Record 继续是分层参考切片：领域对象在 `domain/`，用例在 `application/`，SQLite Repository 在 `persistence/`，Git Worktree provider 在 `infrastructure/`，CLI/HTTP 在 `interfaces/`。Task Record、Review、Verification 和父任务协调拥有各自 Application 与 Repository，但共享同一 SQLite transaction context。

Task 查询使用持久化状态投影、FTS/索引和 keyset cursor；Task 详情通过窄 resolver 组合 Change，不把通用 OpenSpec 实现放回 Task。

`src/modules/task/change/` 只拥有 Task scope 下的 Change 定位和 HTTP 展示组合。

### OpenSpec

入口：`src/modules/openspec/module.ts`。

通用 Change 读取、delta 解析、收敛观察与计划、projected validation、canonical condition write、receipt 和恢复归 `src/modules/openspec/application/`。它保持：

- 从当前 baseline 与 delta 形成确定性计划；
- 在隔离临时树上严格验证；
- 比较已观察 bytes 后才写 canonical；
- 使用同目录临时文件与原子 rename；
- 失败时保留/生成可恢复证据，不把部分写入报告成成功。

### Agent Assets

入口：`src/modules/agent-assets/module.ts`。

Command、Rule、Skill、Component 已从“参数解析、业务规则、Manifest I/O、外部执行和输出混在应用文件”收敛为：

- `domain/`：Capability identity、Component definition、Command version；
- `application/`：协调资产用例，每个应用在同文件声明自己的依赖类型；命令、规则、技能和组件用例接收结构化输入；
- `persistence/`：各 Manifest/定义和 Capability Graph 的唯一 I/O；
- `infrastructure/`：命令探测、Component source、Agent adapter 和 runtime projection；
- `interfaces/cli/agent-assets.ts`：argv 解析、结果展示和退出语义；
- `interfaces/http/`：只做 HTTP mapping。

`module.ts` 逐一创建应用并显式传入实际方法；不向应用交付共享可变对象。组件与清单之间需要的延迟协作通过具名函数连接，内部辅助方法只在真实消费者需要时公开。运行时（Runtime）与内置资产（Builtin）的既有命令编排保留在对应协作者中，不将本轮收敛描述为全部应用已完成协议分离。

包维护按实际所有权分工：`persistence/package-manifest-repository.ts` 唯一读取资源清单及文件映射；`application/package-maintenance/package-assets.ts` 维护模板补齐和同步路径，`builtin-receipts.ts:snapshot/resolveState` 继续负责实际资产比较；`workspace/application/registry-maintenance.ts` 拥有项目/服务实体登记与迁移。包同步继续在原多文件事务内调用登记维护，再由登记维护在原顺序回调资产模板和技能清单升级；不改变写入范围或迁移结果。替换、退役和回执（Receipt）等既有协作者保留。

### Project Testing

入口：`src/modules/project-testing/module.ts`。

该模块只管理用户 Project 的 `verification.yml`：inspect、validate、expected identity update 和 diagnostics。它不调度 Buildr 自测，不复制 Task Verification Report，不拥有用户测试代码。CLI Adapter 位于该模块 `interfaces/cli/`，应用层接收结构化命令。

Buildr 自身的测试选择、进程调度、资源协调和 Candidate gate 留在 `test/verification/` 或相应 `tools/`。

### Installation

入口：`src/modules/installation/module.ts`。

负责 npm installation identity、origin/registry、CLI update、release awareness、npm Launcher 绑定和平台安装。平台文件与进程副作用位于 `infrastructure/`，版本规则位于 `domain/release-version.ts`，CLI/HTTP 位于 `interfaces/`。

`application/product-installation-status.ts` 的 `installationStatus(options)` 返回安装与实例结果；`application/cli-update.ts` 的 `updateCheck()`、`updateBuildr({ track })` 返回更新计划或执行结果。`interfaces/cli/installation.ts` 独占对应参数解析、打印、JSON 与退出码；安装查询的 HTTP 入口继续直接消费结果型能力。

Development Launcher 的工程实现位于 `tools/build/launcher/`，它只服务当前 checkout；正式 npm Launcher 仍由 Installation 产品模块拥有。两者身份和生命周期隔离。

### Diagnostics

入口：`src/modules/diagnostics/module.ts`。

Doctor 只聚合各模块 diagnostics contribution、运行时状态、installation report 和统一结果模型。Workspace scope/service 的业务理解由 Workspace 提供；Agent Assets、Project Testing 等模块各自贡献诊断。Doctor 不取得这些模块的 writer authority。

`application/doctor-application.ts:doctor(DoctorInput)` 返回完整诊断对象，不读取命令参数、打印或修改退出码。`interfaces/cli/doctor.ts:runDoctorCommand()` 负责默认参数、紧凑/完整 JSON、人类输出和退出状态；资产修改后的诊断在资产命令接口调用应用并格式化结果，保持此前的退出码。

### Publication

入口：`src/modules/publication/module.ts`。

Publication 负责文章列表、详情和资源读取，并提供 HTTP contribution。读取路径与可见资源由模块约束，公共 Web router 不再包含文章业务分支。

## Web Host

`src/web/` 是本机网页的技术宿主，不是业务模块：

- `application/`：实例和 Preview 生命周期；
- `infrastructure/`：PID、锁、端口、目录和进程；
- `http/`：loopback server、session、static files、response 与 contribution router；
- `interfaces/cli/`：`buildr web` 命令。

`web/http/router.ts` 只执行公共安全、会话、静态托管和业务 contribution 分发。Workspace、Task、Change、Publication、Installation、Agent Assets 的 HTTP Schema 和 handler 都在所属模块。

## Infrastructure

`src/infrastructure/` 只提供跨模块通用技术机制：

- `filesystem/atomic-files.ts`、`exclusive-file-lock.ts`、`workspace-mutation.ts`；
- `filesystem/path-safety.ts`、`workspace-path.ts`、`workspace-identity.ts`；
- `filesystem/required-block.ts`、`tree-files.ts`、`yaml.ts`；
- `sqlite/` transaction、migration 与 connection；
- `git/` 与 `process.ts`；
- `product-resources/`、`product-invocation/` 和公共 contract 机制。

`filesystem/index.ts` 仅聚合导出，不再承载 CLI 参数、Workspace 业务诊断或 Git identity 实现。CLI 通用参数位于 `infrastructure/cli-arguments.ts`，Git identity 位于 `infrastructure/git/identity.ts`。

## Buildr Web 前端

前端按用户能力组织：

```text
services/buildr-web/src/
├── app/                  应用壳与全局组合
├── features/
│   ├── workspace/
│   ├── project/
│   ├── service/
│   ├── task/
│   ├── project-daily-progress/
│   ├── publication/
│   └── installation/
├── api/                  共享 transport、session、请求上下文
├── components/           跨功能展示组件
└── lib/                  通用前端辅助
```

路由页面必须归所属 `features/`。Publication 使用 `features/publication/api/publication-api.ts`；Release Awareness 使用 `features/installation/api/release-awareness-api.ts` 和 `ReleaseAwarenessBanner.tsx`；Task Change 的请求状态使用 `features/task/hooks/useTaskChangeDetail.ts`。`App.tsx` 注册路由，`AppLayout.tsx` 只组合应用壳与跨页提示。

## 接口类型与生成

后端模块中的 JSON Schema 是协议 authority。`tools/codegen/contracts/` 从这些 Schema 生成：

- 后端测试/工程消费者 DTO；
- `buildr-web/build/generated/` 前端 DTO；
- Candidate staging 中的同类产物。

生成文件不手写。`contracts:generate`、`contracts:check`、两端 typecheck、Web build 与真实 HTTP contract tests 共同防止漂移。

## 测试边界

| 证明对象 | 所属位置 |
|---|---|
| 后端领域、应用、持久化、协议、会话、进程、安装 | `services/buildr/test/` |
| 前端渲染、交互、状态、客户端与纯逻辑 | `services/buildr-web/test/` |
| 真实前后端组合产品流程 | Product 级 browser/system suite；当前由后端验证宿主选择运行 |
| 用户 Project 测试 | 用户 Project 原生工程；Buildr 只管理声明与 Task 验证报告 |

测试 helper 可以为了构造现场组合命名能力，但不能改变生产 Runtime API。百万 Task benchmark 是隔离性能工具，不进入默认 Candidate 回归。

## 依赖规则

模块内部允许的主方向是：

```text
interfaces → application → domain
interfaces → application → persistence / infrastructure ports
module.ts → 各技术层（私有装配）
```

- Domain 不依赖 Application、Persistence、Infrastructure 或 Interface。
- Application 不解析 CLI argv、不输出终端文本、不导入其他模块内部文件。
- Persistence 拥有数据格式与 I/O，不取得跨用例业务决策。
- 跨模块只能通过 `module.ts` 提供的命名能力、贡献或 Binder。
- `bootstrap`、`web` Host 和公共 Infrastructure 不实现业务特判。
- `tools`、`test` 和前端不能成为后端生产模块的反向依赖。

## 数据和副作用

完整表见[关键调用、数据与副作用](../../knowledge/code-map/calls-data-effects.md)。必须保持的核心不变量是：

- Workspace 多文件 mutation 有 journal、锁和恢复；
- Task 主记录与关系在同一 SQLite transaction context 内提交；
- 所有条件写入比较已观察 identity/digest；
- OpenSpec canonical 写入先隔离验证，再以 expected bytes 原子应用；
- runtime projection 有 ownership receipt，不能静默覆盖用户文件；
- Launcher 和 Web 实例以产品/profile identity 隔离；
- 局部失败只阻止相关动作，不否定已经由权威来源成立的事实。

## 维护检查

结构变化至少检查：

1. `test/contract/architecture-boundaries.test.ts` 与 `test/verification/cli/architecture.ts`；
2. `test/contract/product-source-layout.test.ts`；
3. DTO 重复生成、前后端 typecheck 和正式 Web build；
4. 受影响模块的 unit/component/contract/integration/system suites；
5. Application Payload、`npm pack --dry-run` 和 Candidate 验证；
6. [全项目代码地图](../../knowledge/code-map/README.md)与 Archify 技术图是否仍对应真实文件和调用。

本次只交付当前地图与技术图，不建设自动发现、自动更新、自动生成或自动同步机制。
