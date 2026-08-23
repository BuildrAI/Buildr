# Buildr Product Verification Framework

本文描述 Buildr 当前真实使用的验证架构，以及公共 Node.js Test Context Runtime 的设计、API、执行宿主和接入方式。目标不是只让 Buildr 某一组测试变快，而是建立一套后续 Node.js 项目也能沿用的测试执行基础：测试声明所需 Context，Runtime 按配置身份缓存应用组装，Runner 在多个持久 Worker Host 中并行执行，provider 负责隔离、reset 和污染失效。

本文不替代 Project `verification.yml`、Task Verification Result 或正式 Release authority；它说明这些控制面最终如何选择并执行 Product tests。

## 1. 总体架构

```text
changed / focus / core / candidate
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

Context Runtime 不读取 changed paths、Core/Candidate profile 或 Buildr Workspace；Verification planner 也不创建 Application Context。

## 2. 目录与发布边界

### 2.1 公共 Runtime

```text
src/infrastructure/testing/context-runtime/
├── definition.mjs          defineTestContext、配置规范化与identity
├── runtime.mjs             cache、scope、dependency、lease、reset、dirty/evict
├── node-test.mjs           node:test注册adapter与direct-file lifecycle
├── node-runner.mjs         多持久Worker Host编排
├── node-runner-cli.mjs     verification executor入口
└── index.mjs               内部公共API聚合

test-context.mjs            package顶层稳定facade
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

该入口进入唯一 `@buildr-ai/buildr` npm tarball，不创建第二个Candidate、tarball或Release transaction。公共模块只依赖Node.js标准库，不依赖Buildr CLI、Workspace、Git或SQLite。出现第二个真实消费者或独立版本需求后，可以把同一API提取到独立包；当前先用真实接入证明抽象。

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

## 10. Buildr首个provider组合

Task Development Application集合注册两个Context：

### `buildr.task-application/v1`

- worker scope，每Host只执行一次`createRuntime()`；
- exclusive，因为测试会临时覆盖Environment resolver、Change resolver和repository reader；
- release后恢复Application Runtime的完整property descriptors；
- inspect拒绝未恢复的属性漂移。

### `buildr.task-workspace/v1`

- worker scope、isolated；
- state持有Buildr `task-lifecycle/v1` immutable seed Pool；
- outer plan投影存在时复用同一seed identity，直接单文件时本地prepare；
- 每test取得独立sandbox lease，release删除case-owned sandbox；
- marker、tree digest、realpath containment和alias检查继续失败关闭。

4个Task Development shard现在是Context Host消费者：Host内多个case复用Application state和seed pool。真实SQLite repository、Git contribution、CLI、Task Environment、Finish、自举、Workspace init/cleanup仍保留Integration/System主证据。Candidate/Release仍保留唯一tarball、Launcher、Host Node、Windows、npm integrity和readback/convergence。

## 11. Verification Control Plane

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

## 13. affected、Core、Candidate与Release

| 入口 | 责任 |
| --- | --- |
| `test:fast` | Unit、Component和低成本Static |
| `test:changed` | affected；unknown path/owner gap执行前失败 |
| `test:focus` | 指定primary owner定位和计时 |
| `test:core` | 52-step日常核心Full，不承担Release专属旅程 |
| `test:candidate` | 66-step完整Product Candidate与唯一tarball |
| Candidate CI | 平台分片、Windows/Host Node和closed aggregate |
| Release | 冻结source、publication、readback和Git convergence |

affected解决任务相关性，Context解决已选测试的重复环境成本，Host grant解决安全并行。三者互补。

## 14. Evidence

step timing保存queue、demand/grant、resource wait、process cleanup、phase和diagnostic digest。`node-context-test`额外保存`testContextRuntime`：Host count、create/cache hit、acquire/release、exclusive wait、test body累计时间、provider materialize/cleanup、reset、dirty和destroy。

outer `contextLifecycle`继续保存跨进程immutable seed的prepare/reuse/materialize/release/cleanup。前者证明Host内Application Context复用，后者证明跨runner seed隔离。事件属于runner-owned transient evidence，不进入Project declaration或Task Verification Result。

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

## 17. 本轮性能证据

Task Development owner的历史基线约为71.9秒；第一阶段只做seed与手工shard后约40.8秒。迁移到公共Runtime后的独立focus为31.670秒：4个Host、8次Context创建、22次cache hit、15次隔离lease，累计test body为69.202秒，而Workspace materialize/cleanup合计只有0.931秒。

相同最终实现树的两轮完整Core全部52/52通过：

| 样本 | Core墙钟 | Task Development | 最慢step |
| --- | ---: | ---: | --- |
| Core 1 | 321.437s | 42.455s | `system-task-finish` 107.035s |
| Core 2 | 319.937s | 44.037s | `system-task-finish` 106.021s |
| 中位 | 320.687s | 43.246s | 约106.5s |

因此本轮有两条同时成立的结论：

- 公共Runtime确实消除了首个owner的重复Application组装和手写生命周期责任，独立墙钟相对71.9秒基线下降约56%；
- 整体Core仍约5分20秒，尚未达到180秒目标，关键路径已经转移到完整Finish、Workspace/System、execution record、coordination、runtime parity和Acceptance；不能把首个owner收益外推成整体达标。

Core竞争下Task Development比独立focus慢约34%–39%，说明跨step资源竞争仍显著。下一轮应优先让更多“初始化不是主证据”的Application/SQLite/Git owner注册Context provider，同时继续优化唯一完整Finish/System旅程本身；affected仍负责避免无关测试，但不是唯一性能手段。

## 18. 当前能力与下一边界

已经实现：公共definition/runtime/npm入口、configuration identity、dependency graph、worker/suite/test scope、shared/exclusive/isolated lease、reset、dirty/evict、逆序destroy、direct-file adapter、多持久Host runner、outer grant约束、Host失败汇总、Buildr Application/Workspace provider、timing summary和package inventory验证。

当前限制：Context只在单Host内共享；Buildr Application provider因port覆盖而exclusive；尚无通用SQLite transaction/snapshot、Git COW或Vitest adapter；未迁移owner仍每文件process isolation。下一步应优先为重复成本高且初始化不是主证据的owner增加SQLite snapshot或Git/source seed provider。完整Finish、自举和cleanup黄金旅程应优化产品/fixture内部实现，不用预建Context跳过。

## 19. 维护不变量

- 公共Runtime在`src/infrastructure/testing/context-runtime/`，不依赖Buildr领域；Buildr provider在`test/context/providers/`。
- `test/context/runtime.mjs`只拥有Buildr immutable filesystem seed adapter，不是第二套通用Runtime。
- Context复用不改变execution boundary或primary evidence owner。
- shared seed只读，mutation发生在lease-owned state/sandbox。
- outer scheduler是Host/resource budget authority，inner runner只消费grant。
- unknown owner、无效Context、不可满足资源、污染和失真预算都在安全边界失败。
- Core性能目标不能削弱Candidate、Windows、Host Node、Launcher、npm integrity、tarball或Release readback/convergence证据。

相关入口：`test-context.mjs`、`src/infrastructure/testing/context-runtime/`、`test/context/`、`test/verification/registry.mjs`、`test/verification/planner.mjs`、`test/verification/dag-scheduler.mjs`、`test/verification/executor.mjs`。
