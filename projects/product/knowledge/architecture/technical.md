# Buildr 技术架构

Buildr Product 是本机优先的智能体工作系统，由 Buildr 后端 Service 与 Buildr Web 前端 Service 共同提供。当前实现采用能力模块、命名端口、贡献式 Host 和明确的数据写入权。

## 技术图

- [Buildr 系统总览](../archify/system/buildr-system-overview.html)
- [能力、数据与副作用流](../archify/flows/capability-data-responsibility.html)
- [四层全项目代码地图](../code-map/README.md)

## 服务边界

| Service | 当前责任 | 不负责 |
|---|---|---|
| `services/buildr` | CLI、本机 HTTP Host、产品模块、SQLite/YAML、安装与诊断、工程/发布入口 | React 页面状态与前端交互 |
| `services/buildr-web` | React 页面、Feature 状态、HTTP 客户端、用户交互 | 后端业务规则、文件/SQLite writer、测试声明执行 |

真实前后端组合的浏览器流程属于 Product 级端到端测试（End-to-End Test）；当前物理执行入口位于后端 Service 的验证宿主。

## 后端结构

```text
src/
├── bootstrap/       模块登记与对象装配
├── modules/         Workspace、Task、Agent Assets、Project Testing、OpenSpec、Installation、Diagnostics、Publication
├── web/             本机 Web 进程、会话、静态托管与 HTTP contribution 分发
└── infrastructure/  文件、路径、SQLite、Git、进程与产品资源等通用机制
```

`bootstrap/runtime.ts:createRuntime()` 创建技术 Runtime，并由 `module-registry.ts` 安装模块。业务能力通过 `runtimeProvide()` 按 capability id 获取；CLI、HTTP 和 diagnostics 通过 `runtimeContributions()` 聚合。生产 Runtime 不扁平注入业务方法。

Workspace↔Task、Task↔Change、Agent Assets↔Diagnostics 的真实循环由一次性 Binder 完成晚绑定，其余依赖保持单向。

## 模块与所有权

| 模块 | 入口 | 核心所有权 |
|---|---|---|
| Workspace | `src/modules/workspace/module.ts` | Workspace/Project/Service、每日演进、受管 mutation |
| Task | `src/modules/task/module.ts` | Task Record、关系、Review、Verification、父任务协调、Worktree |
| Task Change | `src/modules/task/change/module.ts` | Task scope 的 Change 定位与展示组合 |
| OpenSpec | `src/modules/openspec/module.ts` | 通用读取、严格验证、收敛、条件应用和恢复 |
| Agent Assets | `src/modules/agent-assets/module.ts` | Rule、Skill、Command、Component、Capability Binding、runtime projection |
| Project Testing | `src/modules/project-testing/module.ts` | 用户 Project `verification.yml` 的 inspect/validate/update |
| Installation | `src/modules/installation/module.ts` | npm installation、update、release awareness、正式 Launcher |
| Diagnostics | `src/modules/diagnostics/module.ts` | 只读聚合与 Doctor 结果 |
| Publication | `src/modules/publication/module.ts` | 文章与资源只读访问 |

每个模块按真实需要使用 `domain/`、`application/`、`persistence/`、`infrastructure/`、`interfaces/`。不要求空层，也不为相同字段机械制造镜像类型。

## 主要调用链

### CLI

```text
bin/buildr.mjs → bootstrap/cli/main.ts → module CLI contribution
               → Application → Domain / Repository / Infrastructure port
```

### Buildr Web

```text
React feature → feature/shared API client → web/http/router.ts
              → module HTTP contribution → Application → data owner
```

### Agent runtime 投射

```text
Agent Assets Application → Capability Graph / manifest Repository
                         → runtime adapter + projection plan
                         → Agent native files + ownership receipt
```

## 数据与写入权

| 当前事实 | Owner | 存储 |
|---|---|---|
| Workspace identity、Project/Service registry | Workspace | `.buildr/workspace.yml`、各 Manifest |
| Project daily progress | Workspace | `.buildr/daily-progress/` |
| Task Record、关系、Review、Verification | Task | Workspace SQLite |
| Agent Assets manifests 与 Capability Graph | Agent Assets | Rule/Skill/Command/Component 源资产 |
| Agent runtime projection | Agent Assets | Agent 文件与 `.buildr/agent-runtime/` receipt |
| Project testing declaration | Project Testing | `projects/<project>/verification.yml` |
| OpenSpec canonical | OpenSpec | `openspec/specs/`、Change receipt/recovery |
| npm installation 与 Launcher | Installation | Product data root 与平台入口 |

Doctor、Web Host、Bootstrap 和 Buildr Web UI 都不是这些数据的第二 writer。

## 工程、资源与发布

- Node.js 固定为 `24.15.0` 开发基线；TypeScript 使用严格检查和 NodeNext。
- HTTP Schema 属于后端业务模块；`tools/codegen/contracts/` 生成两端 DTO。
- Development Launcher 位于 `tools/build/launcher/`；Agent runtime 文件型源位于 `resources/runtime/`。
- `package/` 仅保留 ignored test-context 生成目标。
- Application Payload 根据依赖闭包和 manifest 构建；`package.json#files` 决定 npm 文件清单。
- Buildr 自测调度位于 `test/verification/`；产品 `project-testing` 模块只管理用户 Project 测试声明。

## 前端结构

Buildr Web 以 `src/features/<capability>/` 组织页面、组件、Hooks 和专用 API。`src/api/` 只保留共享 transport、Local Session 与生成 DTO；`src/app/` 只组合应用壳。Publication、Installation 和 Task Change 已分别归入对应 Feature，不再把业务页面堆在 `src/pages/`。

## 安全与一致性不变量

- Workspace 多文件写入使用管理锁、mutation journal 和恢复。
- Task 主记录与关系使用同一 SQLite 事务；条件写入比较 `recordDigest` 或报告 digest。
- OpenSpec 先 projected strict validation，再比较 expected bytes 并原子应用。
- 文件写入使用安全 canonical path、staging 与原子替换。
- Agent runtime projection 使用 ownership receipt，冲突显式失败。
- Web instance 与 Launcher 按 identity/profile 隔离，不接管未知进程或入口。
- 局部错误不扩大为无关能力失败，也不否定已经成立的权威事实。

## 验证边界

后端 Service 证明业务、数据、协议、进程和安装；前端 Service 证明渲染、交互、状态和客户端；Product browser/system suite 证明真实组合流程。Candidate 另外证明生成、Application Payload、npm pack 和正式入口。

## 深入阅读

- [服务分层与模块组织](../../docs/architecture/service-architecture.md)
- [CLI 与模块架构](../../services/buildr/docs/cli-architecture.md)
- [文件型交付资源](../../services/buildr/docs/resources.md)
- [全项目代码地图](../code-map/README.md)
