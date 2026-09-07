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

`bin/buildr.mjs` 是薄入口。`src/bootstrap/cli/main.ts` 负责进程级错误、启动/停止和分发；`src/bootstrap/cli/registry.ts` 从每个 Runtime 的 contributions 建立唯一 command catalog、help 和 unknown-command candidates。

## 源码结构

```text
src/
├── bootstrap/       Runtime、Module Registry、CLI Host
├── modules/         产品能力及其 Domain/Application/Persistence/Infrastructure/Interface
├── web/             本机 Web 技术宿主
└── infrastructure/  通用文件、SQLite、Git、进程、资源与协议机制
```

产品模块固定在 `src/modules/`：Workspace、Task、Agent Assets、Project Testing、OpenSpec、Installation、Diagnostics、Publication。Task scope 的 Change 组合位于 `src/modules/task/change/`。

## Module Registry

`src/bootstrap/module-registry.ts` 维护：

- 命名 `requires` 与 `provides`；
- CLI、HTTP、diagnostics contributions；
- 模块 start/stop 生命周期；
- 提供者唯一性和依赖顺序。

`src/bootstrap/runtime.ts:createRuntime()` 只创建平台技术对象、注册 Infrastructure、安装模块并保存私有 Registry context。业务调用通过 `runtimeProvide(runtime, capability)`；Host 聚合通过 `runtimeContributions(runtime, type)`。生产 Runtime 不接受 `Object.assign` 式业务方法注入。

真实循环依赖只使用一次性 Binder：`WORKSPACE_TASK_BINDER`、`TASK_CHANGE_BINDER`、`AGENT_ASSETS_DIAGNOSTICS_BINDER`。

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
- `src`/`bin` 不依赖 `tools` 或 `test`。

## HTTP 与 Web

`src/web/http/router.ts` 只处理 loopback session、安全请求、静态资源和 HTTP contribution 分发。每个业务模块在 `interfaces/http/` 维护 Schema、mapping 和 handler。CLI 与 HTTP 必须调用同一 Application，而不是复制用例。

## 代码生成

`tools/codegen/contracts/` 从模块 HTTP Schema 生成 Buildr 与 Buildr Web DTO。生成结果进入 ignored 或 Candidate staging 目标，不维护 tracked 手写副本。重复生成、`--check`、两端 typecheck、Web build 与真实 HTTP contract tests 共同验证一致性。

## Product verifier 与仓库验证

- 安装后 `buildr package check` 可达的业务验证属于 `src/modules/agent-assets/application/package-maintenance/` 及其明确依赖，并进入应用负载。
- 只服务 `npm test`、Fast、Changed、Focus、Candidate、coverage 或 CI 的 registry、planner、scheduler、runner 和 evidence 位于 `test/verification/`。
- Product `project-testing` 模块只管理用户 Project 的测试声明，不执行上述 Buildr 自测。

## npm 与交付边界

- `package.json#bin.buildr` 指向 `bin/buildr.mjs`。
- `tools/release/application-payload.ts` 构建产品运行闭包；`package.json#files` 与 manifest 约束 npm 文件集合。
- `resources/runtime/` 与 `resources/workspace/` 保存文件型交付源。
- `tools/build/launcher/` 只构建/维护 Development Launcher。
- `package/` 仅保留 ignored `targets/test-context/`，不得新增长期源码或资源。
- 安装后的 `buildr package check` 必须只依赖 tarball 内运行闭包。

## 维护验证

```bash
./tools/development/run-development-npm run test:fast
./tools/development/run-development-npm run typecheck
./tools/development/run-development-npm run build:web
./tools/development/run-development-npm run pack:check
```

架构 verifier 另外检查模块根、单向技术层、公开入口、命令贡献、Application Payload 和空 `package/` 合同。完整入口及证明范围以 Product `verification.yml` 为准。

更完整的位置、对象和调用见 [Buildr 全项目代码地图](../../../knowledge/code-map/README.md)。
