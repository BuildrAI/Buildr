## Context

Buildr Product 由同一 Git 仓库中的 `buildr` 后端 Service 与 `buildr-web` 前端 Service 构成。当前后端已经具备 `bootstrap`、业务模块、`web` 与通用 `infrastructure` 的基本边界，Task Record 和 Workspace 也已形成可参考的领域、应用、持久化、接口与私有装配结构；但业务模块仍散落在 `src/task`、`src/workspace`、`src/agent-assets`、`src/verification`、`src/system/*`，`package/` 仍混有工程源码与交付资源。

当前实现还存在四类横向问题：

1. `bootstrap/runtime.ts` 通过 `Object.assign` 把不同模块的大量方法注入单一运行时对象，调用方难以判断真实 owner。
2. `infrastructure/filesystem/index.ts` 同时承担通用锁与原子文件机制、Workspace 识别、Rule 受管区块、参数处理、YAML 辅助和诊断桥接。
3. Agent Assets 的 Application 文件同时处理参数、规则、Manifest、事务、执行与输出，能力绑定解析藏在 `infrastructure/runtime/skills`。
4. Project Verification、Task Verification、Buildr 自测工程与 OpenSpec/Change 都存在名称相近但 writer 和副作用完全不同的职责，现有路径不足以表达差异。

本次工作跨两个 Service、npm 发布清单、工程工具、测试、OpenSpec、当前态知识和 CI。现有公开 CLI、HTTP、JSON、SQLite、Workspace 文件格式、安装身份、运行时投射、Web Session 和资源逻辑身份均属于兼容边界。

## Goals / Non-Goals

**Goals:**

- 每个生产和工程职责都有单一、可定位的 owner，并能从代码地图追到主要对象、代表方法、数据与副作用。
- 后端形成 `bootstrap → modules/web → infrastructure` 的显式依赖方向；模块之间只通过窄 capability、query 或 contribution 协作。
- Agent Assets、Diagnostics、Project Testing、OpenSpec、Installation、Publication 等能力拥有准确命名和内部职责边界。
- `package/` 不再承载人工维护源码；代码生成、构建、测试、发布和资源各自归位。
- 前端按完整功能归位剩余页面和客户端，保持现有路由、DOM 验收钩子与同源托管。
- 同步迁移所有源码、测试、工程程序、构建、打包、CI、规范和文档消费者；旧内部入口在验证后删除。

**Non-Goals:**

- 不新增用户项目完整测试生命周期产品能力。
- 不实现代码地图或当前态模型的自动发现、更新和生成机制。
- 不实现技术图自动同步机制。
- 不改变公开业务语义、数据模型、协议、权限、安全或恢复承诺。
- 不发布正式版本，不完成父任务，不因“全项目”而重写已经合理的 Task Record、Workspace、事务、锁、管理保护、隔离验证或发布事务。

## Decisions

### 1. 以产品能力统一后端一级模块

最终生产源码使用以下结构：

```text
src/
├── bootstrap/                         进程入口、模块注册、显式依赖装配与生命周期
├── modules/
│   ├── workspace/                    Workspace、Project、Service、Daily Progress
│   ├── task/                         Task Record、Review、Verification Result、父任务、Worktree、任务专属 Change 关联
│   ├── agent-assets/                 Rule、Skill、Command、Component、Builtin 与 runtime projection
│   ├── project-testing/              Project verification.yml 的解析、读取与受控更新
│   ├── openspec/                     通用规范解析、读取、收敛、条件写入、恢复与隔离验证
│   ├── installation/                 安装身份、更新、版本、Launcher 与 npm lifecycle
│   ├── diagnostics/                  只读 Doctor 聚合、结果与接口
│   └── publication/                  文章及附件只读能力
├── web/                              Web 实例、Preview、HTTP 公共宿主、Session 与静态托管
└── infrastructure/                   filesystem、SQLite、Git、process、network、platform 等通用技术机制
```

选择 `modules/` 是为了让产品能力与 `web`、`bootstrap`、通用技术机制在同一阅读层级上清晰分离。模块内部只在真实需要时使用 `domain/`、`application/`、`persistence/`、`infrastructure/`、`interfaces/`；不为了目录对称增加空层。

替代方案是保留当前多个一级业务目录，仅删除 `system/`。该方案改动较小，但不能形成统一导航，也会继续让新增业务能力与技术根并列，因此不采用。

### 2. 保留 Task 与 Workspace 的内部结构，只迁移根路径和真实依赖

Task Record、Review、Verification Result、父任务协调以及 Workspace/Project/Service/每日演进的现有 Domain、Application、Repository、Interface 和管理保护已有明确 writer；本次整体迁入 `modules/`，只修正跨模块 import、宽运行时依赖和文档路径。不会按文件体量机械拆分这些已可维护文件。

Task 专属的 Change 关联、Task scope 定位、原型发现和展示组合继续在 `modules/task/change/`；通用 OpenSpec 解析、canonical 读取、冲突规划、隔离 strict validation、条件应用和恢复整体迁入 `modules/openspec/`。这避免“Task 使用 OpenSpec”被误解为“OpenSpec 属于 Task”。

### 3. Agent Assets 按业务语义、持久化与投射机制分开

Agent Assets 的最终结构按真实复杂度组织：

```text
modules/agent-assets/
├── application/                      Rule/Skill/Command/Component/Builtin 用例与 runtime 编排
├── domain/                           capability graph、binding、成员与 ownership 规则
├── persistence/                      workspace manifests、receipts 与源文件映射
├── infrastructure/runtime/           adapter、render、projection、runtime check
├── interfaces/{cli,http}/            参数、输出、DTO 与错误映射
└── module.ts                          私有组合与窄公开 capability
```

不会为每个小函数建立文件。`components.ts`、`commands.ts`、`skills.ts` 等大文件按“用例编排 / Manifest 持久化 / 领域规则 / 外部执行”这些独立变化原因拆分；同一用例的输入、结果和紧密私有函数仍保留在一起。能力绑定与依赖解析从 `infrastructure/runtime/skills/capabilities.ts` 移入 Domain/Application owner，因为它决定产品语义，不是渲染技术细节。

替代方案是只重命名文件和目录。它无法消除参数、规则、读写和执行混合，因此不采用。

### 4. 用具名模块能力替代宽泛方法注入

Bootstrap 保留唯一 `ModuleRegistry`，但模块通过 descriptor 的 `provides` 和 `contributions` 暴露具名对象。CLI、HTTP、Doctor 及其他模块直接接收所需 capability；不再把模块方法批量 `Object.assign` 到共享 runtime 后再通过方法名反查 owner。

过渡中允许 `platform` 和少量通用 Infrastructure 形成一个明确的技术对象，但所有业务模块消费者必须迁移到具名 capability。测试若需要替换协作者，通过模块工厂参数或窄测试端口完成，不通过隐藏的可写 runtime property。

### 5. 拆分文件系统聚合但保留关键技术不变量

`infrastructure/filesystem/index.ts` 拆为少量稳定技术文件：

- `atomic-files.ts`：原子写入、复制/删除与目录物化原语。
- `exclusive-file-lock.ts`：锁记录、stale owner、claim/release 与超时。
- `workspace-mutation.ts`：跨文件 mutation journal、恢复和 fault injection。
- `managed-block.ts`：通用受管区块解析与更新机制；Workspace Rule 语义由 Agent Assets 使用者提供。
- `workspace-path.ts`：canonical Workspace 根、symlink 和受限路径识别的技术部分。
- `yaml.ts`：严格 YAML document/value 的通用解析和渲染辅助。
- `index.ts`：只导出这些机制，不注册业务命令或 Doctor bridge。

Workspace 初始化、gitignore 内容、Rule scope、CLI `--target` 参数与诊断归一化分别迁往 Workspace、Agent Assets、Interface 和 Diagnostics owner。独占锁、原子 rename/fsync、journal、CAS 与失败恢复逻辑保持原算法和错误码。

### 6. Diagnostics 只聚合，不替其他模块定义业务健康

`modules/diagnostics` 负责 Doctor 用例、结果模型、CLI 与聚合。Workspace、Agent Assets、Project Testing、Installation、Task 等模块通过 diagnostic contribution 或 read model 提供自己的业务归一化；Diagnostics 只直接检查 SQLite schema/checksum、文件、进程、网络和安装等物理事实。

`normalizeProjectManifest`、`normalizeServiceManifest`、capability 绑定判断、runtime adapter 状态等业务规则从 Doctor 文件迁回所属模块，Doctor 只消费稳定诊断结果。Doctor 的 JSON、finding code、repair plan、退出码和只读边界不变。

### 7. 明确三类测试职责

- `modules/project-testing` 只拥有 `verification.yml` 的 Domain、Application、Persistence/Infrastructure 和公开 declaration capability。
- `modules/task` 继续拥有 Task Verification Report 的唯一 writer 与读取组合。
- `test/verification` 和 `tools/testing|verification` 只服务 Buildr 自身的测试选择、调度、执行、候选验证和测试辅助；实际用例仍位于 `test/unit|component|contract|integration|system|browser-smoke`。

不因名称都含 verification 合并状态，也不把工程测试运行结果写入第二套产品状态。

### 8. `package/` 退出人工源码，工程程序与资源分别归位

迁移关系如下：

| 现有位置或能力 | 动作 | 最终归属与理由 |
| --- | --- | --- |
| `package/launchers/build.ts`、`manage.ts` | 移动 | `tools/build/launcher/`；只在 checkout 构建/维护 Launcher |
| `package/launchers/manage.mjs` | 保留薄兼容后迁移消费者并删除 | 开发入口直接调用 TypeScript 工程程序；不长期保留第二源码 |
| `package/targets/runtime/skills/buildr/SKILL.md` | 移动 | `resources/runtime/skills/buildr/SKILL.md`；是直接安装到 Agent runtime 的文件型交付源 |
| `package/targets/test-context/` | 保留 ignored 发布输出路径 | 由 `tools/testing` 从 `src/infrastructure/testing/context-runtime` 生成，只为 `test-context.mjs` 公共 facade 与 matching types 服务，不是人工源码 |
| `tools/contracts/` | 移动 | `tools/codegen/contracts/`；从后端 Schema 生成前后端 DTO |
| `web-dist/` | 保留 ignored 输出 | buildr-web 的正式构建产物，由 buildr 同源托管与打包 |

`resources/manifest.yml`、`package.json files/exports/scripts`、构建脚本、候选制品、静态验证、CI 与文档同步更新；生成 DTO 继续不跟踪且只有后端 Schema authority。

`@buildr-ai/buildr/test-context` 是唯一稳定编程子路径，继续由顶层 `test-context.mjs` 和 `types` condition 暴露 generated ESM/声明；其 source runtime 保留在通用 Infrastructure，因为这是产品确实对外提供的跨项目测试技术能力。`package.json` 的 `./*` 只保留既有兼容访问，不把 `src/**` deep import 描述或提升为稳定 API；本次不为旧内部源码路径建立转发文件。Candidate 必须验证唯一公共 facade 在无 checkout 环境中的 ESM import 与 TypeScript consumer。

### 9. 前端按完整功能收敛，不引入新 Store

- Article 页面与其读取客户端迁入 `features/publication/`。
- Settings 与 Release Awareness/Installation 交互迁入 `features/installation/`；App 壳只保留布局、导航、Workspace 上下文和抽屉装配。
- `TaskChangeDetailPage` 属于 Task-scoped Change 展示，迁入 `features/task/pages/`；通用 OpenSpec 不因此成为前端 Task 的数据 owner。
- 未使用的 Placeholder 删除；通用 transport/session 保留在 `api/`，能力级 client 随 feature 迁移。
- 现有路由、URL、文案语义、DOM `id`/`data-*`、Ant Design 与无远程资源约束保持不变；不引入 Redux/Zustand。

### 10. 代码地图和技术图是当前态导航，不是第二规范

`knowledge/code-map/` 维护四层地图：系统与工程、功能模块、技术层/对象/代表方法、关键调用/数据/副作用。地图只登记稳定能力和代表符号，不逐行索引。`knowledge/archify/` 保存必要图源和冻结展示；本次至少更新系统全景图，并新增一张关键调用/数据责任图。`knowledge/architecture/technical.md` 与两项 Service 说明引用地图和图，不复制全部条目。

规范（应然）、实现/登记（实然）、当前态知识（解释）和历史归档继续分开；发现冲突先修复权威资产或如实记录，不通过改图掩盖。

## Migration Inventory

| 当前能力 | 处理 | 原因 | 调整后职责 |
| --- | --- | --- | --- |
| `src/workspace/**` | 移动并修正依赖 | 已有内部结构合理 | `src/modules/workspace/**` 唯一 Workspace owner |
| `src/task/**` | 移动；通用 OpenSpec 子树拆出 | Task 内部 writer 合理，但 OpenSpec 非 Task 专属 | `src/modules/task/**` 与 `src/modules/openspec/**` |
| `src/agent-assets/**` | 移动并内部重组 | 参数、规则、Manifest、执行与投射混合 | `src/modules/agent-assets/**` 分层 owner |
| `src/verification/**` | 移动并重命名 | 名称与 Task Verification、自测工程混淆 | `src/modules/project-testing/**` 只管理测试声明 |
| `src/system/installation/**` | 移动 | `system` 无稳定业务含义 | `src/modules/installation/**` |
| `src/system/doctor/**` | 移动并下沉业务规则 | Doctor 只应聚合 | `src/modules/diagnostics/**` |
| `src/system/publication/**` | 移动 | 文章读取是明确产品能力 | `src/modules/publication/**` |
| `src/web/**` | 保留并去业务特判 | 是跨模块公共宿主和实例 owner | `src/web/**` 只处理宿主、Session、静态资源与 contribution dispatch |
| `src/infrastructure/**` | 保留并拆解文件聚合 | 通用技术机制有价值，业务职责需退出 | 狭义技术 adapters 和唯一 provider |
| `src/bootstrap/**` | 保留并重写装配 | 唯一 composition root 正确，方法注入不透明 | 显式模块 capability 与 lifecycle 装配 |
| `tools/contracts/**` | 移动 | 是后端接口代码生成工程程序 | `tools/codegen/contracts/**` |
| `package/launchers/**` | 移动/删除兼容 | 是工程构建程序，不是发布源码分类 | `tools/build/launcher/**` |
| `package/targets/runtime/**` | 移动 | 是文件型交付源资产 | `resources/runtime/**` |
| `test-context.mjs`、`src/infrastructure/testing/context-runtime/**`、generated `package/targets/test-context/**` | 保留并更新清单 | 是明确公开 Test Context facade、产品 runtime 实现与可重建发布输出三层 | facade 只指向 generated ESM/types，源码不依赖 Buildr 自测 provider |
| `package.json` 的 `./*` export | 保留兼容但不建旧路径 facade | 当前 metadata 允许 deep access，但规范未承诺内部路径稳定 | 文档只承诺 bin 与 `./test-context`；Candidate 检查不把 wildcard 当公共 API |
| Buildr 自测 runner | 保留并校正文档/选择 | 属于测试辅助或工程工具 | `test/verification/**`、`tools/testing|verification/**` |
| 前端 `src/pages/Articles*` | 移动 | 完整 Publication 功能 | `features/publication/**` |
| 前端 `SettingsPage` 与壳层更新逻辑 | 移动/内部整理 | Installation 功能不应由壳层拥有 | `features/installation/**`，壳层只装配 |
| 前端 `TaskChangeDetailPage` | 移动 | 是 Task-scoped 展示 | `features/task/pages/**` |
| Task Record、Workspace、锁、事务、Fence、OpenSpec 收敛协作者 | 保留有价值边界 | 具有独立失败/安全/写入责任 | 仅迁移路径和显式依赖，不合并成巨型应用 |

## Risks / Trade-offs

- [大范围路径迁移造成遗漏消费者] → 以 `git ls-files` 清单、全仓 `rg`、TypeScript 编译、架构契约、生成检查、npm pack 和文档链接检查逐层验证；旧路径扫描必须为零。
- [宽 runtime 收敛触发大量测试 fixture 断裂] → 先建立具名 capability，再逐模块迁移调用方和测试端口；每一切片完成后运行相关 unit/component/contract，最后删除旧注入。
- [拆分 Agent Assets 或 filesystem 时改变锁、原子写入或恢复语义] → 先复制不变量测试，保持错误码和算法，拆分只移动 owner；对 managed mutations、runtime projection、重复 render、冲突和故障注入运行行为验证。
- [npm tarball 或 Application Payload 缺少迁移文件] → 同步 `resources/manifest.yml`、`package.json files`、payload 构建和 package static validation，并从 candidate/pack 清单回读。
- [前端物理迁移误改体验] → 保持路由与稳定 DOM 钩子，运行前端 typecheck/build 和全部 Browser smoke；本次不做视觉重设计。
- [单次变更体量大，回滚困难] → 按模块切片形成可独立测试的提交前工作序列，但最终只在所有消费者迁移、整体回归和文档一致后交付；未通过时保留隔离 worktree，不污染 retained checkout。
- [目录统一诱发过度拆分] → 只有稳定能力、独立变化原因或实际复杂度需要时拆文件；保留已经可维护的完整应用和重要技术边界。

## Migration Plan

1. 固定当前文件、模块、调用、规范、测试、资源与发布消费者清单，严格验证本 Change 的 planning artifacts。
2. 迁移顶层业务模块与通用 OpenSpec，更新 Bootstrap/module descriptors、imports、架构检查和直接测试；保持行为不变。
3. 分切片重构 Agent Assets 与 filesystem owner，消除宽 runtime 注入；逐切片验证锁、事务、Manifest、projection 与 CLI/HTTP。
4. 收敛 Project Testing、Diagnostics 和 Web Router 业务边界，迁移接口 DTO codegen 与 `package/` 内容。
5. 整理前端功能、Buildr 自测工程归属、构建/CI/打包/发布消费者和全部旧路径引用。
6. 更新 canonical specs 的 delta、当前态知识、完整代码地图、Archify 图、Service/维护文档与导航。
7. 运行受影响检查、完整低成本回归、必要集成/系统/Browser/pack/candidate 检查；记录正式 Task Verification。
8. 收敛并归档 OpenSpec Change，完成精确 Git commit/push、远端回读、自举激活与 Worktree 安全清理；父任务保持 active。

回滚只发生在未交付的隔离任务分支：若某切片无法保持兼容，停止继续迁移并修复当前切片，不在 retained checkout 上做破坏性恢复。提交并推送后不改写共享历史；后续问题使用新的修复提交。

## Open Questions

无需要用户决定的产品语义问题。最终文件拆分、目录名和实施顺序属于已授权范围内的常规技术决定；若实施中发现公开行为、数据语义、权限或兼容必须改变，再停止对应修改并请求决定。
