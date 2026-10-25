# Buildr CLI 与模块架构

本文面向 Buildr Service 维护者。公开兼容承诺是命令、参数、help、JSON Schema、文件结果与 OpenSpec Specs；`src/` 内部路径不是公开 API。

## 运行入口

```text
projects/product/buildr（checkout convenience）
  → services/buildr/bin/buildr.mjs
  → src/bootstrap/cli/main.ts
  → createRuntime()
  → module CLI contributions
```

`bin/buildr.mjs` 是薄入口。`src/bootstrap/cli/main.ts` 处理内部安装动作、进程级错误，并延迟加载命令分发；`src/bootstrap/cli/registry.ts` 创建技术运行时（Runtime），从模块贡献（Contribution）建立唯一命令目录、帮助与未知命令候选，再调用对应入口。模块生命周期由模块登记（Module Registry）管理。

正式 npm 包由 `../../../../skills/buildr-release/scripts/release-artifact.ts:npmBinSource()` 生成默认入口，在完整业务负载、产品 Node 范围检查及安装环境注入之前，调用安装模块的 `application/workspace-cli-routing.ts`。独立的 `runtime/workspace-cli-router.cjs` 只读现有管理归属和启动登记，选择继续当前 npm 或委派开发来源；不装配业务运行时（Runtime）或打开 SQLite。参数与当前目录原样传递，委派边界清理父来源身份并传播标准输入输出、退出状态及适用信号。显式源码入口、图形启动器（Launcher）、安装自身动作和独立 `buildr-mysql` 保持绑定来源。

## 源码结构

```text
src/
├── bootstrap/       Runtime、Module Registry、CLI Host
├── modules/         产品能力及其 Domain/Application/Persistence/Infrastructure/Interface
├── web/             本机 Web 技术宿主
└── infrastructure/  通用文件、SQLite、Git、进程、资源与协议机制
```

产品模块固定在 `src/modules/`：Workspace、Task、Agent Assets、Project Testing、OpenSpec、Knowledge、Workbench、Installation、Diagnostics、Publication。Task scope 的 Change 组合位于 `src/modules/task/change/`。

## Module Registry

`src/bootstrap/module-registry.ts` 维护：

- 命名 `requires` 与 `provides`；
- CLI、HTTP、diagnostics contributions；
- 模块 start/stop 生命周期；
- 提供者唯一性和依赖顺序。

`src/bootstrap/runtime.ts:createRuntime()` 只创建平台技术对象、注册 Infrastructure、安装模块并保存私有 Registry context。业务调用通过 `runtimeProvide(runtime, capability)`；Host 聚合通过 `runtimeContributions(runtime, type)`。生产 Runtime 不接受 `Object.assign` 式业务方法注入。

跨模块需要延后连接的能力通过一次性绑定器（Binder）装配；当前连接点以[运行时装配](../src/bootstrap/runtime.ts)为准，不在此重复维护成员清单。

## CLI Adapter 责任

每个模块的 `interfaces/cli/` 负责：

- 识别与解析 argv；
- 将参数转换为结构化 Application input；
- 展示文本/JSON、设置命令级退出语义；
- 提供唯一 command descriptor。

Application 不读取 `process.argv`、不打印结果、不拼接 CLI help。以 Agent Assets 为例，`src/modules/agent-assets/interfaces/cli/agent-assets.ts` 统一适配 Commands、Rules、Skills、Components 和 package maintenance，所属应用只处理结构化数据。

## 命令目录

Descriptor 包含唯一 key、surface、summary、canonical help、match 与 run adapter。公共 CLI Host 合并模块贡献；新增命令不能在 Host 实现业务，也不能建立第二份 registry。

- `primary`：普通用户入口；
- `agent-machine`：Review、Task Verification、Worktree 等低频机器入口；
- `maintenance`：package、Preview、OpenSpec 等维护入口。

Surface 只控制发现和兼容表面，不提供权限。

## 模块依赖方向

```text
bin → bootstrap → module entry
interfaces → application → domain
interfaces → application → persistence / infrastructure ports
module.ts → private composition
```

- Domain 不依赖 I/O 或上层；
- Application 不导入其他模块内部文件；
- Persistence 拥有数据格式和 I/O，不拥有跨用例决策；
- Infrastructure 只放跨能力技术机制；
- 正式产品运行闭包不加载 `tools` 或 `test`；开发维护命令的显式例外见下文。

## HTTP 与 Web

`src/web/http/router.ts` 只处理 loopback session、安全请求、静态资源和 HTTP contribution 分发。每个业务模块在 `interfaces/http/` 维护 Schema、mapping 和 handler。CLI 与 HTTP 必须调用同一 Application，而不是复制用例。

### 公开名称与兼容标识

公开产品名使用 Buildr Web。协议和环境中的历史名称不能随文案机械替换；以下是当前仍有用途的兼容边界，不表示旧公开产品名继续使用。

| 对象 | 当前行为与保留标识 | 实现依据 |
| --- | --- | --- |
| 实例记录 | 当前写入 `buildr.local-app-instance/v2`，兼容读取 `buildr.local-app-instance/v1`；不能把仅存在旧记录当作当前进程身份已匹配 | [实例读写](../src/web/infrastructure/instance-runtime.ts) |
| 健康响应和预览结果 | 保留 `buildr.local-app-health/v1`、`buildr.local-app-preview/v1`，公开 JSON 登记中的 `localAppPreview` 不随产品命名重写 | [HTTP 响应定义](../src/web/http/buildr-web-http-contracts.ts)、[JSON 身份登记](../src/infrastructure/contracts/public-json.ts) |
| 本机数据与预览环境 | `BUILDR_APP_DATA_DIR` 和 `BUILDR_LOCAL_APP_PREVIEW` 仍由当前实现读取，分别用于应用数据位置及受管预览身份 | [应用数据位置](../src/modules/installation/contracts/web-profile.ts)、[预览生命周期](../src/web/application/preview-lifecycle.ts) |
| 文章平台值 | 读取时将旧 `local-app` 归一化为 `buildr-web`；其他值由文章自身的数据校验处理，不按公开命名批量改写历史文章 | [平台值转换](../src/modules/publication/domain/publication.ts)、[文章读取](../src/modules/publication/persistence/publication-repository.ts) |
| 开发应用标识 | 新构建使用 `ai.buildr.web.dev`，保留旧标识 `ai.buildr.local-app.dev` 的兼容声明；替换和清理仍须证明应用归属，不能仅凭名称删除 | [启动器构建](../tools/build/launcher/build.ts)、[启动器管理](../tools/build/launcher/manage.ts) |

## 代码生成

`tools/codegen/contracts/` 从模块 HTTP Schema 生成 Buildr 与 Buildr Web DTO。生成结果进入 ignored 或 Candidate staging 目标，不维护 tracked 手写副本。重复生成、`--check`、两端 typecheck、Web build 与真实 HTTP contract tests 共同验证一致性。

## 开发维护与仓库验证

- `buildr package check` 是开发维护命令，调用检出目录中的 `tools/verification/package-check.ts`。正式安装包不携带该工具，调用时会提示需要开发检出；它不是用户安装后的健康检查入口。
- 资产初始化与同步的产品实现位于 `src/modules/agent-assets/application/package-maintenance/`，按真实依赖进入应用负载（Application Payload）。
- 只服务 `npm test`、Fast、Changed、Focus、Candidate、coverage 或 CI 的 registry、planner、scheduler、runner 和 evidence 位于 `test/verification/`。
- Product `project-testing` 模块只管理用户 Project 的测试声明，不执行上述 Buildr 自测。

## npm 与交付边界

- `package.json#bin.buildr` 指向 `bin/buildr.mjs`。
- `../../../../skills/buildr-release/scripts/application-payload.ts` 构建产品运行闭包；`package.json#files` 与 manifest 约束 npm 文件集合。
- `resources/runtime/` 与 `resources/workspace/` 保存文件型交付源。
- `tools/build/launcher/` 只构建/维护 Development Launcher。
- 源码桥接与 macOS 开发启动器（Development Launcher）将 `tools/development/programs/` 和已选 Node.js 的目录加入当前进程的 `PATH`，提供 `buildr-mysql` 辅助命令。该私有目录不含 `buildr`，默认 npm 安装入口保持独立；通用连接程序继续按实际依赖判断可用性。
- `package/` 已无职责；派生测试库位于 Git 忽略的 `build/test-context/`。
- 安装后的用户命令只依赖安装包内运行闭包；开发维护命令 `package check` 不属于该范围。
- 现有 `docs/cli-reference.md` 随应用负载（Application Payload）交付，供命令无法启动或离线时读取安装与恢复依据；其他开发文档和源码链接仍以仓库为准，不为安装包复制整套手册。

## 维护验证

```bash
./tools/development/run-development-npm run check
./tools/development/run-development-npm run test:related -- --plan
./tools/development/run-development-npm run build:web
./tools/development/run-development-npm run pack:check
```

推送前 `check` 聚合四服务完整静态检查（Static Check）与单元测试（Unit Test），`test:related` 依据用户请求及实际改动选择相关四类。完整入口都支持 `--plan` 查看选择与 `--check <id>` 显式指定检查，不冒充实际测试结果。架构检查核对模块根、单向技术层、公开入口、命令贡献、应用负载（Application Payload）和 `package/` 不再承载产品文件的约定。完整入口及证明范围以 Product `verification.yml` 为准。

更完整的位置、对象和调用见 [Buildr 全项目代码地图](../../../knowledge/code-map/README.md)。

## 文件型交付资源

服务（Service）的 `resources/` 保存产品读取、复制、安装或投射的文件型来源；用户工作空间（Workspace）的登记和运行状态由各自写入者生成，不进入资源树。

| 来源 | 职责 |
| --- | --- |
| [`resources/manifest.yml`](../resources/manifest.yml) | 声明发布范围、工作空间（Workspace）及项目（Project）映射、内置资产、组件（Component）和运行时技能（Runtime Skill）来源 |
| `resources/workspace/` | 规则（Rule）、技能（Skill）、命令（Command）、组件（Component）、`AGENTS.md` 与 Git 模板的交付源 |
| `resources/runtime/` | 直接安装到智能体运行时（Agent Runtime）的源，包括 Buildr 产品入口技能（Skill） |
| `resources/installation/launcher/` | 启动器（Launcher）使用的无行为静态图标 |

开发启动器（Launcher）工程属于 `tools/build/launcher/`，正式 npm 启动器（Launcher）行为属于 `src/modules/installation/`；生成的测试库在被 Git 忽略的 `build/test-context/`，均不属于文件资源目录。Archify 已退出产品内置，完整发行仅作为 Buildr 自用技能（Skill）保留；来源与旧安装迁移见[维护说明](../../../knowledge/docs/reference/archify.md)。

安装包资源和用户共享资源有不同范围：`~/.buildr/resources/` 只收录 `workspace/skills/` 的技能源与协作约定，以及 `runtime/skills/` 的产品入口技能（Skill）。技能附件整体保留；共享目录顶层为 `skills/`、`contracts/` 和内部清单 `resource-set.json`。`AGENTS.md`、项目初始化和 Git 模板、组件（Component）安装声明、命令（Command）声明、启动器图标、包源清单及内部检查配置继续从安装包读取，不再保存共享副本。

共享集按完整文件清单、摘要和执行权限检查；普通 `.DS_Store` 不纳入内容身份，Finder 浏览不会造成损坏误报。同名符号链接或目录、其他未声明文件和真实官方文件损坏仍拒绝。旧宽泛共享集在下次准备时完整替换，沿用空间重新准备与失败重试，不逐文件合并。

资源映射或交付内容变化时，按实际影响核对清单、初始化与同步解析、安装包及应用负载（Application Payload），选择相关运行时或浏览器检查。只改解释文字不要求重跑全部发布验证。正式运行闭包不加载开发工具；`buildr package check` 仍只适用于开发检出目录。
