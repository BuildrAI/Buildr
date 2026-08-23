## Context

第一阶段的 `test/context/` 已证明不可变 Workspace seed 可以跨 owner 投射，并让 sandbox 隔离、污染与资源 grant 可观察；但它仍是 Buildr 私有的 filesystem Pool。测试文件自行调用 `node:test`、自行创建 `createRuntime()`，而 `node:test` 默认按文件启动子进程，因此内存中的 Application Context 不能跨文件复用。Task Development 通过分片和 seed 迁移从约 72 秒降至约 41 秒，说明并行和 fixture 复用有效，也说明继续复制 helper 不会自然形成统一测试架构。

Spring TestContext 的关键不是 JUnit 语法，而是同一 JVM 内的配置签名缓存、依赖组装、测试级隔离/reset 和污染失效。Node.js 具备 runner、worker 和 fixture 零件，但默认没有把它们组合起来的应用 Context authority。本设计在现有 Buildr npm 包中交付通用内核，以 Buildr tests 作为第一个 adapter；未来可以在收益和独立发布需求成立后再提取为单独 npm 包。

约束：

- 不创建第二套 Buildr Candidate、tarball 或 Release transaction。
- 不让通用 Runtime 依赖 Buildr Workspace、Git、SQLite 或 Verification registry。
- Node.js 单进程只有一个事件循环；CPU 并行必须来自多个持久 Worker Host，Context 缓存只在对应 Host 内成立。
- 可变 Git worktree、跨进程 SQLite、CLI、Finish 与 cleanup 不能靠同一连接的 transaction 回滚；它们必须使用 sandbox/snapshot/full lifecycle provider。
- 真实生命周期本身是主证据时不得复用已经完成该生命周期的 Context。

## Goals / Non-Goals

**Goals:**

- 提供可导入的 `defineTestContext()`、`createTestContextRuntime()` 与测试注册 API。
- 按 provider、版本、规范化配置和依赖身份生成稳定 cache key，在同一 Worker Host 内只创建一次匹配 Context。
- 支持 `worker`、`suite`、`test` 三层 scope、Context 依赖图、并发安全策略、lease、reset、dirty/evict 和 destroy。
- 提供 `node:test` adapter 与持久 Worker Host runner，使多个测试文件可以在受控 Host 中共享 Application Context，同时保留多 Host 并行。
- 让 Buildr Task Application 测试通过公共 API 注册并复用 worker-scoped `createRuntime()`、不可变 Workspace seed与test-scoped sandbox。
- 让外层 Verification scheduler 的 worker grant成为 Host数量上限，并记录Context命中、创建、等待、reset、失效与销毁证据。

**Non-Goals:**

- 不重写 assertion、mock、reporter、coverage或测试发现；这些继续由`node:test`承担。
- 不承诺所有测试共享一个全局可变 Workspace/SQLite/Git环境。
- 不在本次把全部Buildr测试迁移到注册API；只完成Task Application纵切和公共契约。
- 不引入Vitest/Jest；未来适配器必须复用同一个Context Runtime。
- 不在本次创建独立`@buildr-ai/test-context`发布流程。

## Decisions

### 1. 通用内核进入发布包，Buildr provider留在测试边界

公共实现位于`src/infrastructure/testing/context-runtime/`，由package顶层`test-context.mjs` facade通过`@buildr-ai/buildr/test-context`子路径导出。实现目录只能依赖Node.js标准库，API、cache key和生命周期均不出现Buildr术语。`test/context/providers/`定义Task/Workspace等Buildr adapter，原`test/context/runtime.mjs`只保留Buildr immutable filesystem seed authority。

选择同一包子路径而不是立即新增npm包，是为了先复用唯一Candidate/tarball/发布事务并取得真实消费者证据。公共入口与内部目录分离，后续提取包时可以保持API。把实现继续留在`test/`会使其他Node.js项目无法消费，因此不采纳。

### 2. Context definition同时描述缓存状态和每次测试lease

`defineTestContext()`接收稳定`id/version`、`scope`、依赖、配置规范化、`create`、可选`acquire/release/reset/inspect/destroy`及`parallelSafety`。`create`的state可跨测试缓存；`acquire`返回当前test实际使用的value，例如Application runtime本身、从seed克隆的sandbox或事务session。

这样既支持Spring式Application Context复用，也支持Buildr的“共享不可变seed、每test独立sandbox”。只提供`beforeEach/afterEach`fixture无法表达跨文件缓存和配置失效，因此不采纳。

### 3. cache key由定义、规范化配置与依赖身份共同决定

Runtime使用稳定JSON规范化和SHA-256生成`context:<id>/v<version>:<digest>`。函数、symbol、循环对象和未声明的非确定值拒绝进入配置；provider可以显式提供source identity。依赖Context的identity进入上层签名，避免下层配置变化却复用旧Application Context。

同key的`worker` state每Host创建一次；`suite`追加suite identity；`test`追加test identity。配置或依赖identity改变会自然miss，显式dirty或inspect失败会evict现有entry。

### 4. Node适配器注册测试，Runner维护多个持久Host

测试使用`contextTest(name, { contexts, concurrency, timeout }, callback)`注册，callback接收Node TestContext和按别名解析的Context values。直接执行单文件时使用进程本地默认Runtime；Context仍按文件内多个case复用并在进程结束销毁。

Context-aware runner按稳定轮转把文件分配到不超过grant的Host。每个Host使用Node CLI的`node --test --test-isolation=none --test-concurrency=1 <files...>`执行一组文件，因此文件间不再启动新子进程，且Host内Context cache持续存在；多个Host进程提供CPU/IO并行。Host崩溃只丢失自己的cache，父runner报告该组失败，不把它重试为passed。

直接把整个Core改成`--test-isolation=none`会把所有全局状态放进一个进程并失去CPU并行，因此不采纳。默认`node --test`则每文件重建Context，也不满足目标。

### 5. 并发安全属于Context definition，不由测试猜测

`parallelSafety`支持：

- `shared`：相同state可被并发lease；每个lease仍可返回隔离value。
- `exclusive`：同cache entry一次只允许一个lease，其余等待并记录wait。
- `isolated`：state可共享，但`acquire`必须返回独立value，Runtime禁止value与state同一对象。

`reset`在release后、下一lease前按definition执行；`test`scope直接destroy。测试可显式`markDirty(reason)`，`inspect`也可返回dirty。dirty entry在所有active leases归还后销毁，后续case重新create；unexpected inspect dirty同时使当前case失败关闭。

### 6. Buildr首个纵切组合Application与Workspace Context

Buildr定义：

- `buildr.task-application/v1`：worker scope，每Host创建一次`createRuntime()`；因测试会临时覆盖Application ports而声明`parallelSafety: exclusive`，release恢复原始property descriptors，inspect检测漂移。
- `buildr.task-workspace/v1`：worker scope缓存不可变Task seed；每次acquire materialize独立sandbox，`parallelSafety: isolated`，release清理case-owned sandbox。

Task Application注册测试依赖两者，fixture不再逐case创建Application Runtime或自行决定cleanup。真正证明Workspace init、SQLite多连接、Git/CLI、Finish、自举的owners不接入会跳过主证据的预建Context。

### 7. Verification控制面只授予容量，不拥有Context实现

registry可声明某owner使用Context-aware Node runner及`contexts`；scheduler向executor发放worker/process容量。Runner的Host数量不得超过grant，并把Context事件汇入Execution Record。affected选择、Core/Candidate/Release membership仍由Verification控制面负责；Context Runtime不读取changed paths或Product profile。

## Risks / Trade-offs

- **[无隔离模式隐藏全局污染]** → 只让显式注册的文件进入Host；provider inspect、dirty/evict和全局状态契约失败关闭；未迁移文件继续process isolation。
- **[Context API通用但收益只停留在Runtime组装]** → Buildr纵切必须同时复用Application和Workspace seed，并分别记录create/materialize/body/reset；不以API存在代替性能证据。
- **[单Host事件循环限制CPU并行]** → runner维护多个持久Host，Host数由outer grant限制；同配置只保证Host内复用，不虚构跨进程对象共享。
- **[可变状态并发污染]** → definition必须声明parallel safety；exclusive排队，isolated要求独立value，真实Git/SQLite多进程使用sandbox/snapshot。
- **[公开入口过早绑定Buildr包]** → API不依赖Buildr，实现与入口分离；未来独立包只迁移入口，Buildr adapter不进入公共内核。
- **[新增`exports`影响历史deep import]** → 保留兼容wildcard subpath并用pack/launcher契约验证；不改变CLI bin和tarball authority。

## Migration Plan

1. 建立公共definition/runtime/registry和生命周期契约测试。
2. 建立`node:test` adapter、Host runner与多文件缓存/失败隔离测试。
3. 把旧filesystem Pool移到公共lease模型或用兼容adapter委托，避免双runtime authority。
4. 接入Buildr Task Application和Workspace providers，移除手写分片/逐case Runtime创建中的重复责任。
5. 让verification executor按owner选择Context runner并传递Host grant，保留未迁移owner原process-isolated入口。
6. 运行focused、直接单文件、多Host、affected/Core与Candidate membership验证；以真实数据校准收益和残余。
7. 更新完整架构文档、current knowledge和OpenSpec canonical specs后归档补充Change。

回滚时可让Buildr owner回到原`node --test`执行，但公共Runtime契约和历史性能证据保留；不得同时保留两套对同一Context key有不同缓存/dirty语义的authority。

## Open Questions

- 独立`@buildr-ai/test-context`包只有在第二个真实Node.js消费者或独立版本需求出现后评估，本次不提前建立发布治理。
- SQLite transaction adapter需要Buildr production port支持同一session注入后才可能覆盖更多Application测试；当前跨连接行为继续使用database snapshot/sandbox。
