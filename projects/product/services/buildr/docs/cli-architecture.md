# Buildr Product 内部架构

本文面向 Buildr 维护者，说明 Product 源码、CLI、Agent runtime、仓库验证与交付资产的边界。`src/` 是应用负载的内部实现，不是公开 JavaScript API；公开兼容承诺仍以命令、参数、help、JSON schema、文件结果和 OpenSpec specs 为准。

## 生命周期目录

```text
bin/                         npm executable 薄入口
src/
  bootstrap/                 进程级 composition、module registry 与公共 CLI Host
    cli/                     main、统一 command catalog、help、diagnostics 与 dispatch
  domain/
    workspace/               Workspace 实体、UUID 格式与纯字段约束
    task-record/             Task Record closed schema、状态与纯字段约束
  application/               用例、跨模块组合和产品 verifier
    domains/                 现有领域操作 handler；尚非纯领域模型
    task-record/             六个 Task Record action、引用校验与 read/result model
    workspace/               Workspace 查询、修改、迁移和 prompt 用例
    worktree/                Canonical task checkout 与创建后环境 bootstrap 用例
  infrastructure/            filesystem、network、platform、Agent runtime adapters
    filesystem/              Manifest 与专业 Task records、路径、YAML、revision 与 transaction primitive
    sqlite/                  Workspace structured store、migrations 与 Task Record repository
  interfaces/
    cli/                     未迁移能力的命令参数与输出 adapter
    local-app/               loopback HTTP 与离线 Workspace Web 页面
  task/                      Task Record 模块优先纵向切片
    module.mjs               requires/provides/CLI/HTTP contribution 公开入口
test/
  unit/                      小粒度单元测试
  contract/                  静态和公开契约测试
  integration-*/             分级集成测试
  fixtures/                  测试样本
  verification/              仓库门禁、规划、执行和证据
scripts/                      checkout 安装、卸载和验证入口
package/                      Buildr 向 Workspace/runtime 交付的源资产
```

`bin/buildr.mjs` 只启动 `src/bootstrap/cli/main.ts`。Bootstrap 是唯一 composition root：`runtime.mjs` 组装模块，`bootstrap/cli/` 持有公共 Host。Product 根 `buildr` 是 checkout convenience entry，也委托同一个 bin；npm 安装、checkout 执行与本机安装因此共享一套 implementation。

`src/application/domains/` 保留原有 Rules、Skills、Commands、Components、部分 workspace lifecycle、OpenSpec 和 runtime handler。Workspace、Project、Service 已完成垂直切片：`src/domain/<domain>/` 只表达实体、值对象和纯约束，`src/application/<domain>/` 持有用例，`src/infrastructure/filesystem/*-manifest-repository.mjs` 持有 YAML/path/revision，Git adapter 持有实时观察，`src/web/` 持有 HTTP/Web。旧 lifecycle 只能逐步委托这些 Application，不得新增 interface 直接解析 manifest 的路径。

## 依赖方向与所有权

当前迁移接受以下依赖方向：

```text
bin -> bootstrap -> module entry -> interfaces/application/persistence
                 \-> legacy runtime module -> application/infrastructure
interfaces -> application -> infrastructure
                         \-> domain（存在纯领域模型后）
infrastructure -----------> domain
```

- `bin` 不包含业务逻辑。
- `bootstrap` 只拥有进程、module composition、公共 Host 与正式 runtime port 投射，不拥有业务规则、DTO 或数据库实现。
- 已迁移模块只通过根部 `module.mjs` 声明 named `requires`、namespaced `provides`、CLI/HTTP contributions 与可选 lifecycle；模块不扫描全局 Runtime。
- `interfaces` 负责协议适配，只调用应用用例，不被 application 或 infrastructure 反向依赖。
- `application` 组合产品行为；现阶段可调用明确命名的 infrastructure adapter。未来抽取纯 domain 时，domain 不得依赖 filesystem、process、runtime、CLI 或测试代码。
- 全局 `infrastructure` 持有 filesystem、network、进程/Git 等通用机制；Agent runtime 的专属实现属于 `agent-assets/infrastructure/runtime`。
- `src` 与 `bin` 不得导入 `test/` 或 `scripts/`。

不建立顶层或 `src/shared/`。复用代码按语义归属：文件和 transaction primitive 在 `infrastructure/filesystem`，子进程调用在 `infrastructure/process.mjs`，产品目录常量在 `infrastructure/product-layout.mjs`，远程读取在 `infrastructure/network`，Agent runtime 在 `agent-assets/infrastructure/runtime`，JSON contract 在 `application`，公共 CLI Host 在 `bootstrap/cli`，能力专属 Adapter 在所属模块或 `interfaces/cli`。新增 helper 必须先确定 owner。

`infrastructure/platform.mjs` 只是一份供 `bootstrap/runtime.mjs` 构造进程内 runtime object 的通用技术 dependency registry，不导出 Agent runtime 或业务语义。`bootstrap/legacy-runtime-module.mjs` 与带退出条件的 compatibility Facade 已删除；普通模块必须直接导入 Node API、明确的 module capability/runtime port 或 product-layout owner，不得从 platform 聚合面取 named imports。

三个稳定的有界入口保留现有调用表面，但不承载无界长流程：

```text
system/doctor/module.mjs
  -> system/doctor/application/{doctor-application,scope,service,runtime}-diagnostics.mjs
agent-assets/application/package-maintenance.mjs
  -> agent-assets/application/package-maintenance/{verification-registry,static-validation,smoke-checks}.mjs
agent-assets/infrastructure/runtime/render-claude-code.mjs
  -> agent-assets/infrastructure/runtime/skills/{arguments,manifests,contributions,sources,render-plan}.mjs
```

CLI command 只进入 `src/bootstrap/cli/registry.mjs` 合并出的唯一 command catalog。Agent Assets、Task、Workspace、Publication、Change、System Installation、System Doctor 和 Web 的 descriptor 来自各自 module contribution；公共 Host 只负责合并与分发。每个 executable descriptor 同时携带唯一 key、`primary | agent-machine | maintenance` surface、summary、canonical help、match 与 run adapter。dispatch、unknown-command candidates、根帮助分区和 leaf/aggregate topic 都消费同一棵 per-runtime catalog。`buildr web` 的 HTTP Host只遍历Bootstrap传入的HTTP contributions，不直接导入业务 Adapter。新增命令不得在入口直接实现 mutation，也不得建立第二份 registry。

Surface只控制发现层级与兼容承诺，不提供权限。`agent-machine`保留Review、任务验证报告与Worktree等低频机器接口；`maintenance`隔离package、preview与OpenSpec workflow。`openspec audit`、`openspec sync-plan`/`sync-apply`的公开route、handler和JSON schema已删除；deterministic planner/apply primitive继续由单一`openspec converge`transaction内部组合，事务期只读恢复检查由唯一三段route`openspec convergence inspect`提供。

Task Record 是参考模块：`src/task/module.ts`只接收Structured Workspace Store、Project/Service Reader、Change Resolver与operation memoizer等命名窄依赖，在私有组合对象中创建Repository与Application，再提供唯一Application API、Persistence Read Port及CLI/HTTP/Diagnostic contributions。CLI与HTTP Adapter调用同一Application对象；复盘文档的固定路径读取与两态登记也归Task Record，复盘分析本身由纯Skill和Agent完成。

任务研发聚合、任务规划身份和旧Task Finish Application均已删除。Bootstrap不安装这些模块，CLI/HTTP/Web不提供对应入口，SQLite migration删除两张旧current表。任务总览只组合Task Record、Review、Verification和Environment；任务收尾由Agent按Skill直接组合Git、环境及业务工具，不创建交付状态库。

## Product verifier 与仓库 verification

分类依据是安装后 CLI 的运行依赖，而不是文件名：

- `buildr package check` 可达的 static、workspace、Commands、Rules、Skills 和 runtime verifier 属于产品，位于 `src/agent-assets/application/package-maintenance/` 或明确的 infrastructure owner，并随 npm package 发布。
- 只服务 `npm test`、Fast、Changed、Focus、Candidate、coverage 或 CI 的 registry、planner、scheduler、runner、timing、evidence 和 focused verifier 位于 `test/verification/`，不进入 npm tarball。
- `test/verification/verify-buildr-product*` 只是 checkout 入口，委托统一 verification registry，不复制 step、预算或依赖关系。

Workspace E2E 位于 `test/verification/workspace/`，保留 `workspace-lifecycle`、`ownership-recovery` 和 `runtime-reconciliation` 三条跨组件路径。其他 help、onboarding、runtime family parity、tarball inventory 与安装后生命周期由各自 focused verifier 持有。

验证 registry 是 step identity、executor、inputs、依赖、profile/group、并发类别、artifact metadata 与 Project Testing 分类的唯一规划事实源；分类只给出 owner、主要意图、执行边界、证明范围、目标耗时和主要证据 owner。`fast` profile 表达低成本 Quick，inputs 表达 affected owner，`candidate` profile 是显式完整回归组合；它们不再被复制成一份混合 Quick、Task-affected、Candidate、Release 的场景分类。只服务于 CI 定向诊断的复合 slice 可声明 `selection: explicit-only`，保留 inputs 作为覆盖边界但不得被 changed planner 自动选择。planner 对未映射的 Product 路径 fail closed；验证选择基础路径命中全局 owner 时，同一个 changed plan 扩展为完整回归。显式 Candidate 入口选择完整 profile，并只创建一个共享只读 tarball artifact。

## npm 与交付边界

- `package.json#bin.buildr` 指向 `bin/buildr.mjs`。
- 正式 npm candidate 由同一 application payload builder 生成 runtime bundle 与资源，再由 release artifact builder 对 staging 执行唯一一次 `npm pack`；平台制品消费同一个 payload identity。根 `package.json#files` 不再作为正式发布 inventory authority。
- npm tarball 只携带薄入口、runtime bundle、payload manifest、安装来源 receipt 与完整运行资源；不携带平台 Node、Launcher、开发源码树或测试工具链。
- `package/` 只表示 init、sync、runtime 和 bootstrap 使用的交付源资产；正式 tarball 中它位于 payload 资源树，不是 npm 源码、构建脚本或测试 fixture 目录。
- 安装后的 `buildr package check` 必须只依赖 tarball 内的运行闭包。
- 内部路径不提供兼容承诺；重构仍不得改变公开 CLI 行为、JSON schema、文件结果或 transaction/fail-closed 语义。

## 维护验证

```bash
node test/verification/cli/architecture.mjs
npm test
npm run test:changed -- --plan
npm run test:focus -- group:cli
npm run test:focus -- group:runtime
node test/verification/cli/compatibility.mjs
node test/verification/cli/package-parity.mjs
node test/verification/integrity/managed-mutations.mjs
```

架构 verifier 检查生命周期目录、薄入口、`src` import 方向、无 owner 的 shared、关键 facade、完整 runtime inventory、command descriptor schema/唯一 key/surface/help/replacement、verification registry、Candidate required gates 和 npm 边界。CLI compatibility 直接遍历 catalog 验证 retained leaf/aggregate help，并验证已删除 route 返回标准 unknown-command 且零写入。mutation verifier 递归扫描全部发布 runtime module 的直接写入白名单；package parity 从 tarball 安装并比较 checkout/npm 行为。
