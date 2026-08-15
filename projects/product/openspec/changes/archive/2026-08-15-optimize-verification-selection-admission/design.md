## Context

当前 planner 对 `src/**` 至少会选择 Unit、Candidate tarball 与 application payload，但这只能证明路径“被某些步骤覆盖”，不能证明真实领域 Integration/System owner 被选择。现有 142 个 `src/application/**` 与 `src/infrastructure/**` 模块中有 14 个只命中上述通用 owner；其中 Task Entry、Task Retrospective、Parent Coordination、Publication、Task Execution Record 等已经存在 Integration 测试。

另一方面，本地 `test:changed` 和 `test:candidate` 把全部已选步骤直接交给并发 DAG。验证框架变化会扩展为 Full，但低成本 Contract 与约 5.5 秒的 changed-path/run-CLI 契约会和数十秒到数分钟的 Workspace/System owner 同时启动。失败虽然正确，却不能阻止已经启动的重型步骤。GitHub Candidate 已有独立 preflight phase，本设计不改变其拓扑。

## Goals / Non-Goals

**Goals:**

- 让每个生产源码模块具备直接领域 owner，或进入带理由的显式 allowlist；新缺口在 verifier 启动前失败。
- 为已存在 Integration 证据的 Task read model、coordination 与 execution-record 路径建立有界 slice，避免普通改动拉起通用 Integration 全集。
- 把 Quick 与验证框架 canary 组合为本地 affected/full 的 admission wave；失败时不启动重型 DAG。
- 在同一次执行与同一 timing evidence 中，每个 step 最多运行一次。
- 保持 Candidate 行为文件并集、GitHub shard 拓扑、稳定 Project capability 与 Task Verification Result 不变。

**Non-Goals:**

- 不在本 Change 中继续拆分 Workspace lifecycle、Task Finish System 或其他性能长尾。
- 不修改 `verification.yml` schema、capability ID、Release 发布流程或 Browser capability。
- 不建设跨 invocation cache、后台调度器、远程 evidence store 或跨 capability 结果复用。

## Decisions

### 1. 用 planner 可执行契约治理生产源码 owner

对 `src/application/**/*.mjs` 与 `src/infrastructure/**/*.mjs` 计算直接 affected owner；`unit`、`candidate-tarball` 与 `application-payload-release` 的 broad `src/**` 不算领域 owner。每个模块必须命中至少一个 Static、Integration 或 System owner，或出现在带 `owner/reason` 的闭合 allowlist。planner 对本次 changed paths 执行同一检查，Contract/Unit 测试再对仓库完整生产文件集合执行检查。

选择该方式而不是从测试文件名推断源码，是因为一个测试可能覆盖多个模块，文件命名不是 authority。选择闭合 allowlist 而不是默许 Unit-only，是为了让新增模块和 owner 移除可见。

### 2. 只拆直接修复缺口所需的 Integration slice

新增三个 primary slice：

- Task read models：Task Entry、Overview、Planning Identity、Retrospective；
- Task coordination：Parent Coordination、Publication；
- Task execution records：Task/Verification Execution Record 与正文 Store。

通用 Integration runner 从同一 slice registry 派生 exclusions；专属文件不再留在 general suite。现有 Task Development、Task Finish、application payload 与 npm Launcher 专属文件也纳入同一 exclusions 来源，消除 Candidate 中 general 与专属 owner 的重复执行。直接 `test:integration` 仍可运行完整 Integration 文件集合用于层级定位。

相比把 14 个路径全部加入 40 秒左右的 general Integration，这些 slice 将普通领域修改控制在约数秒到十余秒；没有现成领域 Integration 的 Declaration Intake trigger 与 Retrospective prompt 使用显式 allowlist，不为满足层级形式制造新测试。

### 3. 将验证 canary 从 System 聚合中拆为唯一 owner

把 `verification-changed-paths.test.mjs` 与 `verification-run-cli.test.mjs` 从 `system-verification-contracts` 移到独立 `system-verification-admission`。两文件当前串行实测约 5.5 秒，覆盖 changed path 收集、verification run 输入/授权、target drift 与 Workspace Node 入口；剩余 Public JSON、OpenSpec audit、resource coordination、timing 与 Workspace verification 继续由原 System owner 持有。

新 owner 同时加入 Candidate profile 和 GitHub `preflight-macos` shard，因此 System 文件并集不变且每个文件仍恰好一个 primary owner。

### 4. 在 runner 层合成一次执行的 admission DAG

planner 提供纯函数，把原始 affected/candidate plan 与 Fast profile 做去重 union，并将原计划中标记为 admission 的 canary 纳入准入集合。所有非 admission step 增加对全部 admission steps 的执行依赖；原有 artifact/step dependencies 保留。

`changed.mjs` 与本地 `candidate.mjs` 只调用一次 `executePlan`，timing/diagnostics 也只写一份。这样通过的 Fast/canary 结果天然成为同次执行 evidence，不需要 cache key 或第二状态表。GitHub Candidate 继续使用已有 phase/job `needs`，不把本地依赖边复制进 distributed shard registry。

选择依赖边而不是“先运行 Quick，再重新运行完整计划”，是为了消除重复 step 和第二次环境/registry 启动；选择 runner-local composition 而不是改写所有 registry dependencies，是为了避免产生 Candidate CI 跨 shard 依赖。

## Risks / Trade-offs

- [所有重型步骤等待全部 Quick/canary，绿色 Full 可能增加数秒关键路径] → admission 总预算保持在约 10～15 秒，并用失败短路收益与同树 timing 核对；Candidate 覆盖优先于极端追求绿色最短值。
- [allowlist 可能掩盖真实领域缺口] → 每项必须绑定明确 owner 与理由；已有领域 Integration 的路径禁止放入 allowlist，契约测试覆盖代表路径。
- [拆分 Integration 后文件遗漏或重复] → general exclusions 从 slice registry 派生，并对完整 `test/integration` 文件集合检查唯一 primary ownership。
- [本地 admission 依赖误入 distributed Candidate] → Candidate CI shard planner继续使用原始 registry plan；结构契约验证 shard coverage 和 cross-shard dependency 均不变。
- [新 slice 数量增加维护成本] → 本 Change 只创建三个与已有直接证据对应的领域 slice，其他重型 owner 拆分留给独立后续任务。
