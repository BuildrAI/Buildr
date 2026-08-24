## Context

Buildr 已有两层基础设施：发布源码中的 runner-independent Node Test Context Runtime，以及 `test/context/` 中的 Buildr immutable-seed Pool。首个 `integration-task-development` owner 通过持久 `node:test` Worker Host、worker-scoped Application Runtime 和逐测试 Workspace sandbox 获得明显收益，但公共 Runtime 仍是 `.mjs`、无 `.d.ts`，正式 release staging 也尚未把公共 subpath 放入唯一 tarball。registry 只有 `contexts`、`isolationMode` 等执行字段，没有覆盖全部 owner 的“为何接入或不接入”审计事实。

当前核心 Full 仍约 320–350 秒。剩余长尾同时包含两类成本：可复用的 Application/seed 组装，以及必须保留的 Git、Workspace、Finish、自举和 Release 黄金生命周期。本设计必须提高前一类的复用率，但不能用缓存跳过后一类 primary evidence。

## Goals / Non-Goals

**Goals:**

- 让公共 Runtime 以 TypeScript 为唯一权威源码，确定性生成标准 ESM JavaScript 与 `.d.ts`，checkout 和正式 npm tarball 都只通过稳定 facade 消费生成物。
- 为 Context definition、request、dependency、lease value、Node adapter callback、runner result和event提供可推断的公共泛型类型，并以真实外部 TypeScript consumer验证。
- 为全部 verification owner 保存 closed、可审计的 Context disposition，新增 owner 未分类时在 registry contract 阶段失败。
- 完成所有当前可安全复用 Application、SQLite snapshot或immutable Workspace seed 的重型 owner迁移，并记录逐owner Runtime/Pool timing。
- 保留黄金生命周期和 Release evidence，使用同 tree 多轮结果判断实际收益与180秒目标是否可达。

**Non-Goals:**

- 不替换 `node:test`、不引入 Vitest/Jest，不让 Runtime 拥有 assertion、changed selection、profile 或 Candidate 语义。
- 不共享可变 SQLite connection、Git worktree/index/refs、Workspace、process global、用户 profile 或跨进程对象。
- 不把所有测试强行注册到 Context，也不把 registration count 当性能或覆盖 KPI。
- 不改变 Buildr CLI Application Payload 的单一 CommonJS bundle；公共 Test Context 是独立、显式声明的 ESM library subpath。

## Decisions

### 1. TypeScript 源码与发布产物分离

`src/infrastructure/testing/context-runtime/*.ts` 成为唯一手写 authority。独立 `tsconfig.test-context.json` 使用 `NodeNext`、`strict`、`declaration` 和 `outDir=package/targets/test-context` 生成 `.js`/`.d.ts`；生成目录是 tracked projection，由 `test-context:generate` 更新、`test-context:check` 在临时目录重建并逐字节检查 drift。根 `typecheck` 继续 no-emit 检查源码。

顶层 `test-context.mjs` 只重导出生成 ESM，package `exports` 同时声明 `types` 与 `import/default`。正式 Candidate builder只把 facade与生成目录复制进release staging；raw Runtime `.ts`、Buildr providers、fixtures与verification registry不进入正式tarball。这样 development、package consumer和release artifact使用同一JS bytes，不要求type stripping。

备选方案是发布 raw TypeScript 或仅提供手写 `.d.ts`。前者把Node实验性行为变成消费者要求，后者会形成独立且易漂移的第二契约，均不采用。

### 2. 公共类型围绕 definition/request/value 形成闭合泛型

公共 API 以 `TestContextDefinition<Value, Config, Acquired>`、`TestContextRequest`、`ContextValues<Requests>`、`TestContextLease` 和 typed `contextTest` callback 为核心。hook参数只暴露稳定runtime facts；error code/details、event与runner summary保持结构化。实现不使用 decorator、enum或运行时类型元数据，生成JS只依赖Node标准库。

类型验证同时覆盖正例推断和 `@ts-expect-error` 反例，防止所有值退化为 `any`。运行契约仍由Runtime fail closed校验，TypeScript不替代非法JSON、dependency cycle、dirty或containment检查。

### 3. owner disposition 是单独审计 authority

新增 `test/context/dispositions.mjs`，以closed集合为每个registry step保存：

- `context-runtime`：owner 的可复用前置与逐case隔离由公共Runtime/Buildr provider完整拥有；
- `hybrid`：复用不可变seed、Application或snapshot，但主要CLI/Git/process边界仍真实执行；
- `full-lifecycle`：owner保留自己的完整执行边界，原因可以是stateless无需Context、跨进程不可安全reset，或生命周期/Release本身就是primary evidence。

每项还保存稳定`reasonCode`和说明。registry只引用该authority并校验与steps精确一一对应；新增、删除或重命名owner必须同时作出明确分类，不能靠字段默认值静默通过。

### 4. 迁移按最低充分技术边界进行

先迁移已有数据表明昂贵且不以初始化本身为证据的owner：Task read models、coordination、execution records、Finish Application core、Environment repository/Application边界与Runtime/Application composition。测试通过统一Buildr `contextTest` adapter声明Application-only或Application+Workspace Context，不在文件内再次组装同一Runtime/seed。

- 同进程Domain/Application：复用worker-scoped Application assembly；若测试会临时替换runtime property，则使用exclusive lease并在release恢复descriptor。
- SQLite单进程：每case在sandbox中使用独立数据库；不共享connection。适合时由不可变Workspace seed提供预建schema，跨连接语义仍真实执行。
- Git/Workspace：共享只读seed identity，每case复制到独立sandbox；Git index、refs、`.buildr`与cleanup互不共享。
- process/CLI：只对前置seed使用Context，命令仍在case sandbox中真实启动，归类为`hybrid`。

System Finish、自举、Task Environment create/cleanup、Worktree lifecycle、onboarding/init和Release owners保持`full-lifecycle`。若某文件同时包含可复用Application case与黄金case，先按primary evidence拆owner或保持hybrid，不通过隐藏分支跳过真实生命周期。

### 5. 并行由outer grant、Host和Context safety共同约束

`node-context-test`继续从executor接收exact worker grant并稳定分配文件；Host数量不超过grant。单Host内使用`node:test --test-isolation=none`保持cache，但Context的`shared|exclusive|isolated` lease决定body能否重叠。outer registry的workers/processes/git/workspaceIo demand仍是容量authority，Runtime不得自增并发。

Execution Record聚合Runtime event和Buildr Pool event，区分create/cache-hit/wait/acquire/release/reset/dirty/evict/destroy、seed prepare/materialize/cleanup和test body；没有event的`full-lifecycle` owner仍保留普通phase/queue/resource timing。

### 6. 性能验收不覆盖正确性

每个迁移owner先跑focused多轮，再跑至少三轮无外部竞争Core并记录中位数/波动，最后运行一次Core/affected竞争。对比绑定同一tree和registry identity，同时检查Core/Candidate union、唯一primary owner、Release exclusions与黄金旅程未减少。

180秒仍是Parent目标，不是硬编码测试timeout。如果必要owner的实测中位数和可证明下限仍高于目标，本Child交付真实residual与预算建议，由Parent final acceptance显式reconcile。

## Risks / Trade-offs

- [生成物与源码漂移] → tracked projection必须由独立check逐字节重建，Fast/Core/Candidate与release artifact前均检查。
- [共享Application被测试污染] → exclusive lease、descriptor恢复、inspect、dirty eviction；无法完整reset的case不接入或使用isolated state。
- [Context串行化抵消收益] → outer多个Host保留并行；focused/Core timing同时观察wait与body，净负收益owner回退为hybrid/full-lifecycle并保留理由。
- [seed掩盖初始化缺陷] →初始化、迁移、Environment/Worktree/Finish/cleanup与Release黄金owner禁止用预建状态替代主要边界。
- [正式tarball扩大错误表面] →只加入公共facade、生成JS和`.d.ts`，inventory拒绝raw TS、test provider、fixture/registry；外部安装目录执行runtime与type consumer契约。
- [一次迁移范围过大] →以owner为纵向单位迁移并逐个focused验证；registry disposition先覆盖全部owner，但只有证据充分的owner标为`context-runtime|hybrid`。

## Migration Plan

1. 建立TS authority、生成/check pipeline、类型contract和正式tarball facade，确认旧JS API运行兼容。
2. 建立全部owner disposition authority和coverage contract，先按现状分类。
3. 逐owner接入公共adapter/Buildr provider并更新分类；每次完成focused正确性与timing。
4. 运行Fast、affected、Core多轮、Core/affected竞争与Candidate/Release membership/inventory验证。
5. 更新完整架构文档和current knowledge，形成最终性能residual；随后由单一OpenSpec convergence事务同步并归档。

回滚以owner为单位：保留TS/public facade契约，出现污染或净负收益的owner可退回`hybrid|full-lifecycle`并记录理由；不得保留标称接入但实际仍自建环境的假迁移。

## Open Questions

无。owner是否eligible由其primary evidence与可复核副作用决定，不在实现前预设注册数量。
