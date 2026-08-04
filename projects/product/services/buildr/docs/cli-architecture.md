# Buildr Product 内部架构

本文面向 Buildr 维护者，说明 Product 源码、CLI、Agent runtime、仓库验证与交付资产的边界。`src/` 是 npm package 的内部实现，不是公开 JavaScript API；公开兼容承诺仍以命令、参数、help、JSON schema、文件结果和 OpenSpec specs 为准。

## 生命周期目录

```text
bin/                         npm executable 薄入口
src/
  domain/
    workspace/               Workspace 实体、UUID 格式与纯字段约束
    task-record/             Task Record closed schema、状态与纯字段约束
  application/               用例、跨模块组合和产品 verifier
    domains/                 现有领域操作 handler；尚非纯领域模型
    task-record/             五个 Task Record action、引用校验与 read/result model
    workspace/               Workspace 查询、修改、迁移和 prompt 用例
    worktree/                Canonical task checkout 与创建后环境 bootstrap 用例
  infrastructure/            filesystem、network、platform、Agent runtime adapters
    filesystem/              Manifest/Task Record repository、路径、YAML、revision 与 transaction primitive
  interfaces/
    cli/                     CLI registry、help、参数与输出 adapter
    local-app/               loopback HTTP 与离线 Workspace Web 页面
test/
  unit/                      小粒度单元测试
  contract/                  静态和公开契约测试
  integration-*/             分级集成测试
  fixtures/                  测试样本
  verification/              仓库门禁、规划、执行和证据
scripts/                      checkout 安装、卸载和验证入口
package/                      Buildr 向 Workspace/runtime 交付的源资产
```

`bin/buildr.mjs` 只启动 `src/interfaces/cli/main.mjs`。Product 根 `buildr` 是 checkout convenience entry，也委托同一个 bin；npm 安装、checkout 执行与本机安装因此共享一套 implementation。

`src/application/domains/` 保留原有 Rules、Skills、Commands、Components、部分 workspace lifecycle、OpenSpec 和 runtime handler。Workspace、Project、Service 已完成垂直切片：`src/domain/<domain>/` 只表达实体、值对象和纯约束，`src/application/<domain>/` 持有用例，`src/infrastructure/filesystem/*-manifest-repository.mjs` 持有 YAML/path/revision，Git adapter 持有实时观察，`src/interfaces/local-app/` 持有 HTTP/Web。旧 lifecycle 只能逐步委托这些 Application，不得新增 interface 直接解析 manifest 的路径。

## 依赖方向与所有权

当前迁移接受以下依赖方向：

```text
bin -> interfaces -> application -> infrastructure
                   \--------------> domain（存在纯领域模型后）
infrastructure --------------------> domain
```

- `bin` 不包含业务逻辑。
- `interfaces` 负责协议适配，只调用应用用例，不被 application 或 infrastructure 反向依赖。
- `application` 组合产品行为；现阶段可调用明确命名的 infrastructure adapter。未来抽取纯 domain 时，domain 不得依赖 filesystem、process、runtime、CLI 或测试代码。
- `infrastructure` 持有 filesystem、network、进程/Git 和 Agent runtime 的具体实现。
- `src` 与 `bin` 不得导入 `test/` 或 `scripts/`。

不建立顶层或 `src/shared/`。复用代码按语义归属：文件和 transaction primitive 在 `infrastructure/filesystem`，子进程调用在 `infrastructure/process.mjs`，产品目录常量在 `infrastructure/product-layout.mjs`，远程读取在 `infrastructure/network`，Agent runtime 在 `infrastructure/runtime`，JSON contract 在 `application`，CLI registry/help/output 在 `interfaces/cli`。新增 helper 必须先确定 owner。

`infrastructure/platform.mjs` 只是一份供 `application/compose-runtime.mjs` 构造兼容 runtime object 的 composition dependency registry。普通模块必须直接导入 Node API、runtime adapter 或 product-layout owner；不得从 platform 聚合面取 named imports。待兼容 runtime object 被后续功能逐步拆除后，该 registry 也可删除。

三个稳定 facade 保留现有调用表面，但不承载无界长流程：

```text
application/doctor.mjs
  -> application/doctor/{scope,service,runtime}-diagnostics.mjs
application/package-maintenance.mjs
  -> application/package-maintenance/{verification-registry,static-validation,smoke-checks}.mjs
infrastructure/runtime/render-claude-code.mjs
  -> infrastructure/runtime/skills/{arguments,manifests,contributions,sources,render-plan}.mjs
```

CLI command 只在 `src/interfaces/cli/registry.mjs` 登记一次。领域操作由 `src/application/compose-runtime.mjs` 装配；`buildr app` 的 HTTP interface 由 CLI interface 在同一 composition 边界注册，Application 不反向依赖 Interfaces。新增命令不得在入口直接实现 mutation，也不得建立第二份 registry。

Task Record 是当前完成垂直切片的领域：`domain/task-record` 只验证 closed v1 record 与状态，`application/task-record` 拥有 create/inspect/update/complete/abandon、registry/Change 引用解析和响应级 digest 前置条件，`interfaces/cli/task-record.mjs` 只拥有 argv/输出/退出码适配，`infrastructure/filesystem/task-record-repository.mjs` 只拥有 canonical `.buildr/tasks/<task-id>/task.yml` 的 parse/render/atomic replace。Repository 通过 Git topology 判断 linked worktree，不把整个 Task 目录纳入 transaction/rollback，已有 sibling 一律保持不变。CLI 与 Local App HTTP/Web 都只适配同一 Application；Web feature 不读取 YAML，HTTP interface 不接受 caller 提供的 filesystem path。Task Environment、Development、Review、Verification、Git、Finish、Board 与 Retrospective 仍由各自模块拥有，不能进入 Task Record repository。

Task Development是无公共CLI的垂直切片：`domain/task-development`验证closed Receipt、Content Target、policy、Candidate/generation、gate、decision与append-only handoff；`application/task-development`是唯一reader/writer并只通过Task Record/Environment/Review/Verification Applications和Content observer port取事实；filesystem repository只拥有canonical`development.yml`，internal driver只转发同一Application methods，不注册command或Local App route。

Task Finish的CLI adapter只解析`run|inspect`。首次run从Environment与Task Development Application取得Task、current handoff、Candidate和Content Target，不接受Project/Change、Candidate/generation或Verification authority输入。Git-backed Product run在创建时冻结retained checkout当前符号分支；显式target必须与其一致，Environment checkout `startPoint`不取得交付分支authority。随后按显式值、Environment evidence、target branch upstream或唯一配置remote冻结真实delivery remote；任一identity无法确定时不创建run。`task-finish-run.mjs`持有breaking v2 canonical run store、产品resume token与结果投射；`task-finish-product-executor.mjs`只组合内容等价Git carrier、fast-forward/普通push、push后远端ref回读、retained sync/install/doctor和Environment cleanup。只有真实after ref等于carrier才能记录`remoteAfterRef`并进入cleanup。它不执行OpenSpec、formal Verification、Completion Review、Candidate freeze或风险决定；target race与内容漂移终止run并返回Development，只有carrier未变的暂态外部条件可以resume。没有action registry、caller completion、typed recovery parser或旧v1 reader；retained metadata-only精确Git handoff属于Task Finish Skill，不进入CLI产品executor。

## Product verifier 与仓库 verification

分类依据是安装后 CLI 的运行依赖，而不是文件名：

- `buildr package check` 可达的 static、workspace、Commands、Rules、Skills 和 runtime verifier 属于产品，位于 `src/application/package-maintenance/` 或明确的 infrastructure owner，并随 npm package 发布。
- 只服务 `npm test`、Fast、Changed、Focus、Candidate、coverage 或 CI 的 registry、planner、scheduler、runner、timing、evidence 和 focused verifier 位于 `test/verification/`，不进入 npm tarball。
- `scripts/verify-buildr-product*` 只是 checkout 入口，委托统一 verification registry，不复制 step、预算或依赖关系。

Workspace E2E 位于 `test/verification/workspace/`，保留 `workspace-lifecycle`、`ownership-recovery` 和 `runtime-reconciliation` 三条跨组件路径。其他 help、onboarding、runtime family parity、tarball inventory 与安装后生命周期由各自 focused verifier 持有。

验证 registry 是 step identity、executor、inputs、依赖、profile/group、并发类别、artifact metadata 与 Project Testing 分类的唯一规划事实源；分类只给出 owner、主要意图、执行边界、证明范围、目标耗时和主要证据 owner。`fast` profile 表达低成本 Quick，inputs 表达 affected owner，`candidate` profile 是显式完整回归组合；它们不再被复制成一份混合 Quick、Task-affected、Candidate、Release 的场景分类。planner 对未映射的 Product 路径 fail closed；验证选择基础路径命中全局 owner 时，同一个 changed plan 扩展为完整回归。显式 Candidate 入口选择完整 profile，并只创建一个共享只读 tarball artifact。

## npm 与交付边界

- `package.json#bin.buildr` 指向 `bin/buildr.mjs`。
- `package.json#files` 发布 `bin`、`src`、公开文档和顶层 `package`，不发布仓库测试、维护脚本、active changes 或 Workspace 私有资产。
- `package/` 只表示 init、sync、runtime 和 bootstrap 使用的交付源资产；它不是 npm 源码、构建脚本或测试 fixture 目录。
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

架构 verifier 检查生命周期目录、薄入口、`src` import 方向、无 owner 的 shared、关键 facade、完整 runtime inventory、command 唯一登记、verification registry、Candidate required gates 和 npm 边界。mutation verifier 递归扫描全部发布 runtime module 的直接写入白名单；package parity 从 tarball 安装并比较 checkout/npm 行为。
