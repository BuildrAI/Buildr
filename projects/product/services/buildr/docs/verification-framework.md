# Buildr Product Verification Framework

本文描述 Buildr 当前真实使用的验证架构，以及公共 Node.js Test Context Runtime 的设计、API、执行宿主和接入方式。目标不是只让 Buildr 某一组测试变快，而是建立一套后续 Node.js 项目也能沿用的测试执行基础：测试声明所需 Context，Runtime 按配置身份缓存应用组装，Runner 在多个持久 Worker Host 中并行执行，provider 负责隔离、reset 和污染失效。

本文不替代Project `verification.yml`、任务验证报告或正式Release authority；它只说明Buildr Product自身如何选择并执行产品测试。

## 1. 总体架构

```text
changed / focus / daily-full / candidate
                 │
                 ▼
Verification Control Plane
ownership → registry → planner → DAG scheduler → executor
                 │                         │
                 │                         └─ exact worker/resource grant
                 ▼
Node Test Context Execution Plane
test registration → Context-aware runner → persistent Worker Hosts
                         │                         │
                         │                         ├─ Context cache
                         │                         ├─ node:test isolation=none
                         │                         └─ test leases
                         ▼
Provider / Isolation Plane
Application state │ immutable seed │ sandbox │ snapshot │ full lifecycle
                         │
                         ▼
Evidence Plane
queue/grant + create/hit/acquire/body/reset/dirty/destroy + diagnostics
```

四层 authority 相互独立：

- Verification Control Plane 决定“跑什么”和“最多给多少资源”；
- 公共 Test Context Runtime 决定“Context 如何注册、缓存和失效”；
- provider 决定“某种技术状态如何隔离和恢复”；
- `node:test` 继续负责 assertion、test semantics、reporter 和结果。

Context Runtime 不读取 changed paths、daily-full/Candidate profile 或 Buildr Workspace；Verification planner 也不创建 Application Context。内部`core` profile只是不破坏历史plan/timing identity的daily-full兼容投射。

## 2. 目录与发布边界

### 2.1 公共 Runtime

```text
src/infrastructure/testing/context-runtime/
├── types.ts                strict公共类型与泛型推导
├── definition.ts           defineTestContext、配置规范化与identity
├── runtime.ts              cache、scope、dependency、lease、reset、dirty/evict
├── node-test.ts            node:test注册adapter与direct-file lifecycle
├── node-runner.ts          多持久Worker Host编排
├── node-runner-cli.ts      verification executor入口
└── index.ts                TypeScript公共API聚合

test-context.mjs            package顶层稳定facade
package/targets/test-context/
├── *.js                    ignored本地输出或Candidate暂存中的标准ESM
└── *.d.ts                  ignored本地输出或Candidate暂存中的类型声明
tools/testing/test-context-build.mjs
                           generate/check唯一生成入口
```

公共入口是：

```js
import {
  defineTestContext,
  createTestContextRuntime,
  createNodeTestContextAdapter,
  contextTest,
  runNodeTestContextHosts,
} from '@buildr-ai/buildr/test-context';
```

该入口进入唯一`@buildr-ai/buildr` npm tarball，不创建第二个Candidate、tarball或Release transaction。源码authority是strict TypeScript；`test-context:generate`向显式ignored或隔离目标生成标准ESM和`.d.ts`，`test-context:check`通过双临时构建与本地物化检查确定性。根`typecheck`先生成再执行strict no-emit；Candidate只复制本次artifact set中的冻结输出。package export的`types`继续指向包内声明，Node只执行生成JavaScript，不执行raw`.ts`或依赖类型擦除。

公共模块只依赖Node.js标准库，不依赖Buildr CLI、Workspace、Git或SQLite。出现第二个真实消费者或独立版本需求后，可以把同一API提取到独立包；当前先用真实接入证明抽象。

### 2.2 Buildr adapters

```text
test/context/
├── profiles.mjs            outer verification可静态读取的Buildr seed profile
├── registry.mjs            Buildr filesystem provider registry
├── runtime.mjs             legacy/outer immutable-seed Pool adapter
├── node-test.mjs           legacy helper兼容入口
└── providers/
    ├── task-lifecycle.mjs  task-lifecycle/v1 immutable Workspace seed
    └── task-application.mjs
        ├── buildr.task-application/v1
        └── buildr.task-workspace/v1
```

`test/context/` 不再拥有通用 Context Runtime authority。它只实现 Buildr 特有 provider和旧 helper兼容层：outer Pool负责把不可变 seed投射给子进程；公共 Runtime负责Host内Application cache、test lease与失效。

## 3. 公共 Context Definition

一个definition同时描述可缓存state和每次测试取得的value：

```js
const applicationContext = defineTestContext({
  id: 'example.application',
  version: 1,
  scope: 'worker',
  parallelSafety: 'shared',
  sourceIdentity: 'example-source/v3',
  dependencies: [],
  async create({ config, dependencies, identity, record }) {
    return createApplication(config);
  },
  async acquire({ state, config, owner, record }) { return state; },
  async release({ state, value, outcome, record }) {},
  async reset({ state, record }) {},
  async inspect({ state }) { return 'clean'; },
  async destroy({ state, reason }) { await state.close(); },
});
```

必填字段：

- `id`：稳定 dotted/kebab identifier；
- `version`：正整数，生命周期或兼容语义改变时升级；
- `scope`：`worker | suite | test`；
- `parallelSafety`：`shared | exclusive | isolated`；
- `create()`：创建可缓存 state。

可选字段包括dependencies、source identity，以及acquire/release/reset/inspect/destroy hooks。definition是closed contract；非法id/version/scope、缺少create、非法hook和dependency cycle都在test body前失败。

## 4. Cache Identity

每个cache entry由以下事实生成SHA-256身份：

```text
definition id/version
+ canonical JSON configuration
+ explicit source identity
+ dependency identities
+ owning scope identity
```

配置只接受可确定的JSON值：`null`、字符串、布尔、有限数字、数组和plain object；object key排序后编码。`undefined`、function、symbol、BigInt、循环对象或隐式类实例会被拒绝。

同一Host、相同worker配置只`create`一次，后续记录`cache-hit`。version、config、source或dependency identity变化自动cache miss。Context object不跨进程共享；4个Host最多有4份matching Application Context，这是Node进程隔离的真实边界。

## 5. Scope与生命周期

| Scope | Cache寿命 | 典型用途 |
| --- | --- | --- |
| `worker` | 一个持久Host进程 | Application/DI组装、只读seed pool、常驻服务 |
| `suite` | 显式`suiteId`到`closeSuite()` | 同一测试集合共享的有界状态 |
| `test` | 单个test lease | transaction、临时session、逐case资源 |

长生命周期Context不能依赖更短生命周期Context：worker只能依赖worker；suite可以依赖worker/suite；test可以依赖任意scope。Runtime先创建dependency，Host关闭时按创建逆序destroy。

```text
resolve definition graph
→ compute identity
→ create or cache-hit
→ wait for parallel-safety admission
→ acquire test value
→ run test body
→ release value
→ inspect
→ reset when last lease leaves
→ test-scope destroy / dirty evict / retain cache
```

body成功、失败、超时或取消都必须release。body与cleanup同时失败时保留两个错误。

## 6. 并发安全与隔离

- `shared`：多个test可以并发持有同一state；适用于不可变对象或明确并发安全的Application Context。
- `exclusive`：同一entry一次只有一个lease；后续test等待并记录`wait`。
- `isolated`：state可以共享，但`acquire()`必须返回与state不同的独立value；适用于immutable seed → sandbox、database snapshot。

| 行为 | 推荐策略 |
| --- | --- |
| 纯Application/DI组装 | worker state；shared或exclusive reset |
| 所有写入走同一数据库session | transaction/savepoint test value |
| SQLite跨连接或子进程 | 每worker/test database snapshot |
| filesystem/Workspace | immutable seed + isolated sandbox clone |
| Git index/refs/worktree | immutable repository seed +独立worktree/sandbox |
| CLI/process protocol | worker-owned service或独立process lease |
| init/migration/Finish/cleanup本身是证据 | full lifecycle，不跳过前置行为 |

单一数据库connection的rollback不能恢复其他进程、Git refs或文件副作用。Context共享不改变Unit/Component/Integration/System分类。

## 7. Dirty、Reset与失败恢复

测试可以显式标记无法安全reset的状态：

```js
control.markDirty('application', 'policy-cannot-be-reset-safely');
```

provider的`inspect()`也可返回`{ dirty: true, reason }`。显式dirty让entry在active leases归还后evict；unexpected inspect drift同时使当前test失败关闭。release/reset/destroy失败同样可见，不能静默重建后记录为passed。

## 8. `node:test`注册API

```js
import { contextTest, defineTestContext } from '@buildr-ai/buildr/test-context';

const application = defineTestContext({
  id: 'orders.application', version: 1,
  scope: 'worker', parallelSafety: 'shared',
  create: () => createOrdersApplication({ database: 'memory' }),
  destroy: ({ state }) => state.close(),
});

contextTest('creates an order', {
  contexts: {
    app: { definition: application, config: { profile: 'integration' } },
  },
}, async (t, { app }, control) => {
  const result = await app.createOrder({ sku: 'A-1' });
  t.assert.equal(result.status, 'created');
});
```

callback参数是Node TestContext、按alias解析的values、包含identities和`markDirty()`的control。直接执行单文件时adapter建立进程本地Runtime，并在测试结束后close；不要求Buildr runner。

也可以显式创建adapter：

```js
const runtime = createTestContextRuntime({ onEvent });
const { test } = createNodeTestContextAdapter({ runtime, suiteId: import.meta.url });
```

测试发现、assertion、mock和reporter仍由实际runner负责。

## 9. 持久Worker Host

`node:test`默认每文件一个子进程，进程内cache无法跨文件复用。Context-aware runner将文件稳定分配给不超过grant的多个Host；每个Host执行：

```text
node --test --test-isolation=none --test-concurrency=1 <assigned files...>
```

- 一个Host连续执行多文件，module cache和Context cache持续存在；
- 多个Host进程并行，提供CPU/IO并发；
- Host内文件顺序执行，case并发仍服从Context安全策略；
- Host数不超过outer `resourceGrant.workers`；
- 任一Host失败使aggregate失败；
- Host退出时Runtime统一destroy并写入transient evidence。

不能让整个Core直接使用一个`isolation=none`进程：未注册测试可能依赖process global隔离，单进程也无法提供CPU并行。只有`node-context-test` owner进入持久Host；其他owners继续默认process isolation。

## 10. Buildr provider组合与真实采用

Buildr在公共Test Context Runtime上注册Application与Workspace Context。`createBuildrApplicationTest()`让Task read models、Parent/Task coordination与Project Daily Progress在独立sandbox中复用同一Host的Application组装；以初始化、migration、自举、Candidate、tarball或Launcher真实生命周期为主证据的owner继续使用`full-lifecycle`。已删除的任务研发、旧收尾与统一Task Environment不再拥有Context、owner或测试分片。

真实Git、完整CLI协议、Worktree create/cleanup、Preview owner、自举与Workspace init/cleanup仍保留Integration/System主证据。Candidate/Release仍保留唯一tarball、Launcher、Host Node、Windows、npm integrity和readback/convergence。

### Prepared Fixture Provider

Buildr测试层现在在公共Test Context Runtime之上注册三类可复用准备组件：

- `workspace-foundation/v1`：已初始化但没有业务Project的不可变Workspace；
- `project-foundation/v1`：包含`demo` Project、但没有Service的不可变Workspace；
- `git-repository/v1`：带`dev`基线的bare remote；每次lease复制remote并创建独立working clone。

首批只迁移`system-workspace-lifecycle`中不以准备行为为主证据的case。Project create/migration/attach、Service create/migration/attach、Workspace metadata/registry、capability retirement、HTTP与Git观察仍在逐case sandbox中真实发生；Workspace init与Project foundation不再由每个case重复支付。相同机器同一基线的一次直接对照中，Project文件约从24.1秒降到14.9秒，Service文件约从18.6秒降到9.7秒，manifest文件约从31.2秒降到29.0秒，package retirement约从20.2秒降到16.6秒；并行owner墙钟约从51.3秒降到42.6秒。该owner仍是`full-lifecycle`，因为同一owner内的fresh init、identity、migration、registry和Workspace黄金证据没有被替换。

其余重型旅程已按同一准则复核：

- Finish曾试接Git provider，全部9个journey通过，但两轮约84.4/82.4秒，高于改造前约76.7秒，因此撤回；carrier、worktree、target transition和cleanup继续由case自己构造。
- Candidate tarball已由plan中的唯一`candidate-artifact`生成并供后续step消费，不再建立第二套Context缓存。
- npm安装、Launcher、Host Node与release smoke验证的正是artifact安装、进程启动、绑定、readback和shutdown；共享已启动process会替换主证据，因此保持独立。
- 初始化、migration、自举和cleanup同样只可复用与断言无关的外层准备，不能复用正在被验证的可变结果。

## 11. Verification Control Plane

`test/context/dispositions.mjs`为registry中每个step保存唯一Context处置：

| disposition | 含义 |
| --- | --- |
| `context-runtime` | 可复用组装和逐case隔离均由公共Runtime/provider拥有 |
| `hybrid` | 复用Application或immutable seed，但仍执行真实filesystem、SQLite、CLI、Git或process边界 |
| `full-lifecycle` | stateless检查，或初始化、恢复、Finish、自举、cleanup、Candidate/Release本身就是primary evidence |

处置包含稳定reason code；registry增删或重命名step而未同步处置会在执行前失败。处置不是profile：同一个`full-lifecycle` owner仍可能属于affected、Core、Candidate、Host Node或Windows显式投影。

- `ownership.mjs`：changed path → primary owner；
- `registry.mjs`：step、profile、dependency、executor、Context、资源和预算；
- `planner.mjs`：owner选择、closed validation、关键路径与预算准入；
- `dag-scheduler.mjs`：dependency/class/named resource/numeric capacity；
- `executor.mjs`：把exact grant转成`node-test`并发或Context Host数；
- `plan-runner.mjs`：一次plan的outer Context、DAG和evidence。

step声明contexts、isolation/reset/parallel safety、`workers/processes/git/workspaceIo` demand、跨plan resources、executor、预算和primary evidence。planner在进程启动前拒绝unknown key/executor、不可满足capacity和缺失文件。DAG只在完整grant可用时启动，inner runner不得扩大并发。

## 12. 测试边界

| 边界 | 主要机制 | 不应出现 |
| --- | --- | --- |
| Unit | 纯函数、同进程值、fake collaborator | filesystem、process、Git、网络、Workspace |
| Component | 有界Application组装、in-memory/fake port | 真实filesystem、数据库、process或cleanup |
| Integration | 真实SQLite、filesystem、Git、child CLI、module protocol | 重复完整用户/发布Journey |
| System | 公共CLI/HTTP/Workspace/Task/Finish、自举、恢复、并发黄金旅程 | 为普通规则重复建立完整世界 |
| Static | schema、源码、manifest、文档与declaration | 可变fixture或运行时副作用 |

Application Context不是Component的同义词。复用worker Application state后，只要仍穿过真实SQLite、filesystem或Git，测试仍是Integration/System。

## 13. 证据、选择与验证对象

Product验证只回答三个正交问题：

| 问题 | 权威事实 | 可选值 |
| --- | --- | --- |
| 用什么证据证明？ | registry step `executionBoundary` | Static、Unit、Component、Integration、System |
| 本次选择多少？ | ownership + planner | affected、full |
| 验证什么对象、支持哪个决定？ | `verification.yml` capability + Candidate/Release workflow | frozen Task Content / Task Delivery、Product Artifact Candidate、Published Release |

Quick只表示开发期低成本反馈，focus只用于诊断；两者都不冒充正式Task Verification。`verification.yml`声明capability级对象、选择、决定、环境与副作用；ownership唯一持有path→primary owner；registry唯一持有step、profile、dependency、resource、budget和primary evidence。planner只消费这些authority，不存在第二套执行图。

| Verification target | Default selection | Object | Added evidence |
| --- | --- | --- | --- |
| Task Delivery | affected | frozen Task Content | affected development evidence |
| Full Regression | full | Task/current source | complete daily evidence |
| Product Artifact Candidate | full | exact source + candidate artifact | artifact/package/install compatibility evidence |
| Published Release | release-only | published artifact/result | publish, install, launcher, smoke, readback |

| 入口 | 责任 |
| --- | --- |
| `test:fast` | Unit、Component和低成本Static |
| `test:changed` | affected；unknown path/owner gap执行前失败 |
| `test:focus` | 指定primary owner定位和计时 |
| `test:daily-full` | 52-step完整日常证据，不承担Candidate/Release专属旅程 |
| `test:core` | 兼容入口；转发到相同daily-full runner与内部`core` profile |
| `test:candidate` | 66-step Product Artifact Candidate与唯一tarball |
| Candidate CI | 平台分片、Windows/Host Node和closed aggregate |
| Release | 冻结source、publication、readback和Git convergence |

affected解决任务相关性，Context解决已选测试的重复环境成本，Host grant解决安全并行。三者互补。

changed/affected只选择`Development`、`Acceptance`或`Static Conformance` owner；`Delivery / Release` owner由Candidate/Release显式承担。只命中Release owner的路径会delegated给`product.candidate-release`，不会在普通Task中隐式生成tarball、安装package或运行Launcher/release smoke。Candidate CI中`core-*`只是平台shard命名，不是daily-full membership。使用`npm run test:audit:verification -- --base <base> --head <head>`可只读查看direct owner、依赖扩张、Full reason、目标工作量、数学下限与primary evidence map；完整审计见[Product 日常验证证据与选择审计](../../../docs/verification-evidence-audit.md)。

`test:changed -- --json` 的 `selectionAudit.stepSelections` 直接投影同一plan，不重新实现选择算法。每个step列出`selectionKinds`与对应trigger：`direct-owner`关联触发path，`dependency`关联引入它的parent step，`full-scope`关联稳定Full authority reason，profile/admission/explicit分别说明公共入口选择；同时列出execution boundary、primary evidence owner、public outcome和target duration。Full pattern、code和说明只在`ownership.mjs`维护，planner不按文件名另建reason authority。当前稳定code包括execution graph、selection、ownership、runtime、environment、package execution metadata和其他执行基础变化；无法安全局部判断的关键authority保持Full，unknown/unowned高风险production path阻断。

2026-08-24的三个近期`product.delivery`可回放样本中，两个为affected，一个因registry变更以`execution-graph-change`合法Full；before/after step集合没有变化。因此本轮不声明性能收益，现场结论是普通Task选择并非当前主要瓶颈，剩余耗时来自被正确选择的真实primary owner。样本量、missing字段和计算口径以审计报告为准。

## 14. Evidence

step timing保存queue、demand/grant、resource wait、process cleanup、phase和diagnostic digest。`node-context-test`额外保存`testContextRuntime`：Host count、create/cache hit、acquire/release、exclusive wait、test body累计时间、provider materialize/cleanup、reset、dirty/evict、destroy和wall-clock。阶段同时提供`createDurationMs`、`acquireDurationMs`、`releaseDurationMs`、`waitDurationMs`、`resetDurationMs`与`destroyDurationMs`，使“测试体慢”与“环境组装/争用/恢复慢”可以分开判断。

outer `contextLifecycle`继续保存跨进程immutable seed的prepare/reuse/materialize/release/cleanup。前者证明Host内Application Context复用，后者证明跨runner seed隔离。事件属于runner-owned transient evidence，不进入Project测试地图或任务验证报告。

## 15. 新测试接入

1. 明确主要待证事实和最低充分边界。
2. 选择唯一primary owner；先处理重复主证据，再优化fixture。
3. 只有昂贵状态不是当前test主要事实时才定义Context。
4. 声明稳定id/version、scope、parallel safety、config/source identity和dependencies。
5. 选择shared、exclusive、transaction、snapshot、sandbox或full lifecycle。
6. 用`contextTest()`声明alias/config，不在body手工create/cleanup同一Context。
7. 多文件跨文件复用时，把owner executor登记为`node-context-test`。
8. 声明真实resource demand，确保Host数只消费outer grant。
9. 增加配置变化、exclusive wait、dirty eviction、cleanup failure、Host failure和direct-file反例。
10. 先跑direct file/focus，再跑affected/Core，并验证Candidate/Release membership。
11. 记录多轮wall-clock、create/hit、body/materialize/reset和残余长尾。

## 16. 常见错误

- 只换Vitest/Jest，不改变Workspace/Git/SQLite创建方式；
- 把所有测试放进一个`isolation=none`进程；
- 让worker Context依赖test Context；
- 把可变Workspace作为shared value；
- 用数据库rollback恢复Git、文件或其他连接；
- 为命中cache固定错误的source identity；
- dirty后静默重建并把当前test记为passed；
- 因Core变快删除Candidate/Release主证据。

## 17. 性能验收方法与当前基线

已退役模块的旧性能样本不再代表当前verification registry，也不再用于affected/Candidate选择。当前性能结论必须从现有step集合和实际timing summary重新观察。

该历史轮次的结论是180秒低于当时244秒数学下限，不能作为当时52-step集合的可达目标；它建立了Context技术框架，但不是当前预算事实。2026-08-24的current daily-full数学下限已现场复核为259秒，预算360秒。若要进一步下降，必须减少选择放大、消除重复primary evidence或优化真实生命周期body/cleanup；Product Artifact Candidate与Published Release证据不能为追求daily-full数字而下放或删除。

后续跨层证据审计以27个target duration至少15秒的日常Integration/System owner建立了registry派生map。历史普通Finish提交回放证明，过宽Release artifact ownership曾让每次affected额外承担45秒目标工作量；收窄后四个样本分别从12→9、10→8、11→9、6→4 steps。该历史树为52 steps、976秒工作量与244秒下限；当前树以本节开头的现场plan-only为准。剩余成本仍需分别审计selection amplification与真实Finish、Workspace、Worktree、进程等owner body/cleanup，详见[审计报告](../../../docs/verification-evidence-audit.md)。

## 18. 当前能力与下一边界

已经实现：公共definition/runtime/npm入口、configuration identity、dependency graph、worker/suite/test scope、shared/exclusive/isolated lease、reset、dirty/evict、逆序destroy、direct-file adapter、多持久Host runner、outer grant约束、Host失败汇总、Buildr Application/Workspace provider、timing summary和package inventory验证。

当前限制：Context只在单Host内共享；Buildr Application provider因port覆盖而exclusive；尚无通用SQLite transaction/snapshot、Git COW或Vitest adapter。后续根据测试runner自身timing和实际瓶颈决定是否增加优化，不建立通用Task Execution Record。

## 19. 维护不变量

- 公共Runtime在`src/infrastructure/testing/context-runtime/`，不依赖Buildr领域；Buildr provider在`test/context/providers/`。
- `test/context/runtime.mjs`只拥有Buildr immutable filesystem seed adapter，不是第二套通用Runtime。
- Context复用不改变execution boundary或primary evidence owner。
- shared seed只读，mutation发生在lease-owned state/sandbox。
- outer scheduler是Host/resource budget authority，inner runner只消费grant。
- unknown owner、无效Context、不可满足资源、污染和失真预算都在安全边界失败。
- daily-full性能目标不能削弱Product Artifact Candidate、Windows、Host Node、Launcher、npm integrity、tarball或Published Release readback/convergence证据。

相关入口：`test-context.mjs`、`src/infrastructure/testing/context-runtime/`、`test/context/`、`test/verification/registry.mjs`、`test/verification/planner.mjs`、`test/verification/dag-scheduler.mjs`、`test/verification/executor.mjs`。
