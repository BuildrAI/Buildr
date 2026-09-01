# Product日常验证证据与选择审计（历史）

> 本文保留Task Execution Record退役前的历史测量，不描述当前产品接口。当前验证结果直接来自Project测试工具和Task Verification Report。

本文记录 `deduplicate-cross-layer-verification-evidence` 对 Buildr Product 日常验证的可复核结论。机器可读事实来自唯一 registry 与 `npm run test:audit:verification`；本文不创建第二套测试、Candidate 或 Release authority。

## 1. 结论

日常验证慢不是“Node 技术栈做不到 Spring Boot 测试框架能力”。Buildr 的 Unit、Component 和 Static owner 都是秒级；主要成本来自两处：

1. affected 曾把普通 `src/**` 变化同时映射给 `candidate-tarball`、`application-payload-release` 等 Release artifact owner，普通 Finish 修复因此无条件多承担 45 秒目标工作量；
2. 被正确选中的 Finish、Workspace、Worktree、进程与完整 Task lifecycle owner 确实需要真实 Git、CLI、SQLite、Workspace、子进程和 cleanup，单个 owner 本身仍重。

本次已经消除第一类可证明的范围放大，但没有把第二类黄金证据降成 mock、缓存结果或共享可写状态。Core membership保持52 steps，Candidate保持66 steps；因此 Core 的现有数学下限仍为244秒，不能承诺一个低于下限的硬目标。

## 2. 审计入口

```bash
npm run test:audit:verification -- src/task/application/finish/task-finish-run.mjs
npm run test:audit:verification -- --base <commit>^ --head <commit>
```

输出包含：

- changed paths、direct owner、dependency expansion、selected/heavy step count；
- `affected|full|blocked|not-applicable` 与结构化 Full reason；
- total target work、global/dependency/resource lower bounds；
- 日常 Core 慢 owner primary evidence map；
- Release-only owner 与日常 `core` profile 的闭合审计。

该入口只读，不运行verifier，不把target budget当作实测。当前实际耗时以测试runner本身输出为准。

## 3. 近期普通任务选择回放

以下样本均使用 immutable `base=<commit>^, head=<commit>`。改造前后使用相同 changed paths；“工作量”是 registry target 总和，不是墙钟。

| Commit | 变更类型 | scope / Full reason | steps 前→后 | heavy 前→后 | target work 前→后 |
| --- | --- | --- | ---: | ---: | ---: |
| `4ee1fabd` | 验证预算文档与 timing budget | affected | 5→5 | 1→1 | 33s→33s |
| `95c0b4e1` | Finish current row 原子替换 | affected | 12→9 | 6→3 | 251s→181s |
| `fe30074a` | Finish repository topology恢复 | affected | 10→8 | 4→2 | 206s→161s |
| `336306c7` | Finish失败run显式对账 | affected | 11→9 | 5→3 | 226s→181s |
| `6c106466` | Finish多仓部分交付恢复 | affected | 6→4 | 4→2 | 133s→88s |
| `d6130e5d` | Workspace smoke隔离并改registry/package scripts | full；`package-execution-metadata-change`、`execution-graph-change` | 64→54 | 51→43 | 1390s→1158s |
| `50eebc07` | Runtime/System HTTP contracts并改package scripts | full；`package-execution-metadata-change` | 63→54 | 50→43 | 1383s→1158s |
| `2616232f` | Prepared Fixture与Test Context authority | full；`execution-authority-change` | 53→53 | 43→43 | 1156s→1156s |

解释：

- 四个普通 Finish 样本不再选择任何 `Delivery / Release` owner；减少的45秒来自 `candidate-tarball` 15秒与 `application-payload-release` 30秒。
- `95c0b4e1` 另外将 `task-finish-repository.mjs` 从宽泛 `system-task-lifecycle` 转给已有 `integration-task-finish` SQLite/Finish owner，减少一个25秒通用System sibling，同时保留完整 `system-task-finish` Product Journey。
- 三个 Full 样本都有可解释 execution authority；它们不是 unknown path fallback。普通 Full只扩展日常 Core，Release artifact evidence继续由Candidate/Release显式承担。

## 4. 慢 owner primary evidence map

审计阈值为日常 Core 中 target duration ≥15秒且边界为Integration/System。当前27项全部保留自身为唯一primary owner；审计没有发现可在不丢失公共结果的前提下转给低层owner的第二项主证据。这里“保留”不表示实现已经最优，只表示不能删除其公共事实。

| owner | target | 唯一公共事实 / 反例焦点 | 必须保留的真实边界 |
| --- | ---: | --- | --- |
| `integration-task-environment` | 15s | stale controller、preparation或repository handoff必须失败 | filesystem、Git、CLI handoff |
| `integration-self-bootstrap` | 45s | retained checkout或runtime sync漂移必须失败 | retained checkout、Git identity、runtime sync |
| `integration-task-development` | 25s | planning/Candidate/Review/Verification identity漂移必须阻断 | CLI、filesystem、Git、SQLite lifecycle |
| `integration-task-finish` | 20s | bootstrap/readiness/run/diagnostics/SQLite不一致必须阻断 | Finish CLI与SQLite |
| `integration-task-finish-delivery` | 75s | remote、activation、occupancy或cleanup ownership缺口必须失败 | Git remote、retained activation、cleanup |
| `system-verification-contracts` | 15s | 公共run违反scheduling/timing/resource contract必须失败 | public verification/Workspace entrypoint |
| `system-public-json-contracts` | 25s | CLI JSON开放、无版本或不稳定必须失败 | real CLI serialization |
| `system-workspace-lifecycle` | 55s | Project/Service/catalog/capability持久结果丢失必须失败 | Workspace、Project、Service、Git |
| `system-task-lifecycle` | 25s | 公共Task/Change/Development/Review/Verification漂移必须失败 | public Task lifecycle |
| `system-worktree-lifecycle` | 45s | worktree/ref/repository/cleanup ownership错误必须失败 | real Git worktree与Environment |
| `system-runtime-recovery` | 30s | target authority或runtime projection漂移必须失败 | install、filesystem projection、recovery process |
| `system-buildr-web-http` | 15s | session/error/cleanup泄漏必须失败 | loopback HTTP与session cleanup |
| `system-app-process` | 25s | channel/profile/process cleanup泄漏必须失败 | child process、port、profile |
| `system-task-finish` | 60s | 完整Product delivery source/remote/activation/cleanup错误必须失败 | complete Task Finish Product journey |
| `system-task-finish-cli` | 15s | public CLI必须拒绝stale readiness并投影终态 | real Finish CLI process |
| `concurrent-task-acceptance` | 40s | 两个Task互相污染或破坏shared authority必须失败 | concurrent Workspace/Git/SQLite/process |
| `capability-cli-integration` | 35s | capability mutation与package/runtime projection不一致必须失败 | real capability CLI |
| `commands-cli-integration` | 15s | Commands mutation越界或返回stale state必须失败 | real Commands CLI与Workspace assets |
| `openspec-contract-fixtures` | 20s | fixture Application contract/Git状态错误必须失败 | isolated Git/OpenSpec process |
| `openspec-convergence-recovery` | 60s | 中断或漂移事务必须安全恢复/失败 | full convergence/recovery lifecycle |
| `runtime-adapter-parity` | 40s | adapter family行为或inventory不一致必须失败 | real adapter processes/projections |
| `workspace-lifecycle` | 20s | init→Project/Service→assets→sync→Doctor缺项必须失败 | single complete public Workspace journey |
| `ownership-recovery` | 20s | ownership conflict覆盖用户状态必须失败 | real conflict/recovery mutation |
| `runtime-reconciliation` | 30s | projections不能收敛到声明identity必须失败 | real multi-adapter projections |
| `cli-compatibility` | 15s | documented args/exit/result不兼容必须失败 | real CLI process |
| `managed-data-integrity` | 15s | mutation非原子或损伤nested repo必须失败 | filesystem mutation与nested Git |

`integration-task-finish`、`integration-task-finish-delivery` 与 `system-task-finish` 都涉及Finish，但公共事实分别是内部Application/SQLite、远端交付/激活/cleanup、完整Product Journey，不是同一主证据。类似地，`system-workspace-lifecycle`验证多个Product领域Journey，`workspace-lifecycle`保留唯一从init到Doctor的完整公共路径；二者不能仅按名称合并。

## 5. Core、Candidate与Release闭合

| 计划 | steps | target work | 数学下限 | 结论 |
| --- | ---: | ---: | ---: | --- |
| 日常 Core | 52 | 976s | 244s | 不含tarball、package、Launcher、fresh build/onboarding、release smoke |
| Product Candidate | 66 | 1338s | 334.5s | 覆盖未减少，仍生成唯一tarball并执行Release artifact owners |

所有 `primaryIntent = Delivery / Release` owner不再由changed paths直接执行。若路径只由Release owner持有，changed plan明确delegated给`product.candidate-release`；Candidate profile、Release group和正式Release仍可选择这些owner。Candidate CI的`core-*` macOS shard只是Candidate平台分片名称，不等于日常`core` profile。

最近同口径三轮干净Core基线仍为266.434/269.674/267.561秒，中位267.561秒；本 Change没有改变52-step Core membership，因此不把历史结果冒充当前树重跑结果。当前树的三轮干净Core、竞争Core/affected与完整Candidate/Release由Parent后续验收执行。

本 Change 当前实现树以 `origin/dev` 为base执行了一次适用changed验证。由于本次修改触及execution authority，计划可解释地升级为Full：52个Core steps加`host-node-contract`，共53 steps，全部通过，lease等待2ms，总墙钟298.940秒；最慢owner为`system-task-finish` 97.662秒。该轮不是三轮无竞争Core基线，也不替代Parent的Candidate/Release验收，但它确认了Release-only owner没有因Full回流日常Core，并给出了第二个Contribution可复核的当前树起点。

## 6. 后续黄金执行路径清单

第二个 Contribution 应只优化以下仍不可替代的真实执行路径：

- Finish：`integration-task-finish-delivery`、`system-task-finish`、`system-task-finish-cli`；
- Workspace/Worktree：`system-workspace-lifecycle`、`workspace-lifecycle`、`system-worktree-lifecycle`、`ownership-recovery`；
- Candidate/Release：`candidate-tarball`、`application-payload-release`、Launcher、Host Node、release smoke与readback，保持Candidate/Release-only；
- 进程：`system-app-process`、`system-buildr-web-http`、`system-runtime-recovery`；
- 其他资源长尾：`integration-self-bootstrap`、`openspec-convergence-recovery`、`runtime-adapter-parity`、`concurrent-task-acceptance`。

优先实测每个owner的prepare/body/wait/cleanup；如果准备复用反而变慢，应保留独立执行。不能共享可写Workspace、Git worktree、SQLite connection、用户profile或跨case进程状态，也不能提高全局并发来掩盖资源竞争。

## 7. 尚待实测

- 当前实现树三轮无竞争Core的真实墙钟与每owner完整phase timing（已有一次近零lease等待Full实测298.940秒，但尚未拆完prepare/body/wait/cleanup）；
- Core/affected竞争时的resource wait与cleanup放大；
- 完整Candidate/Release在保持66-step与唯一tarball下的当前墙钟；
- Finish、Workspace、Worktree与进程owner内部哪些Git init/clone/fetch、Workspace init、冷启动、状态读取和cleanup可以在同一journey内消除；
- 审计后剩余成本若均为必要primary evidence，继续优化的收益是否足以覆盖复杂度。

## 8. 黄金执行路径优化结论

第二个 Contribution 先选择当前最慢且最有重复准备嫌疑的 `system-task-finish` 做同 owner 实验，没有扩展到第二套 Context Runtime或其他 owner。

### Prepared Fixture 反例

基线三轮墙钟为77.44/75.34/75.79秒，中位75.79秒。将4条单仓journey的非主证据Git初始化替换为现有`GIT_REPOSITORY_CONTEXT_KEY`独立物化后，三轮为77.36/74.05/75.85秒，中位75.85秒。两者等价且候选中位慢0.06秒，因此正式实现已回退该复用；没有为了保留“优化”而增加Context依赖。

该反例仍保留完整真实证据：实验期间每个case都有独立bare remote、checkout、worktree与SQLite，scratch和复杂多仓路径没有被替换。回退后全部journey继续独立执行。

### prepare/body/wait/cleanup

正式独立执行的一轮分段如下；`wait`表示harness级显式资源等待，真实Git/CLI子进程执行仍计入body。

| journey | prepare | body | wait | cleanup | total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Doctor失败后reconcile | 1.589s | 6.085s | 0 | 0.032s | 7.706s |
| code-only五阶段 | 1.638s | 5.145s | 0 | 0.028s | 6.811s |
| stale run与rollover | 0.962s | 10.742s | 0 | 0.022s | 11.726s |
| legacy mismatch恢复 | 0.911s | 6.719s | 0 | 0.025s | 7.655s |
| Delivery Adaptation | 1.393s | 17.602s | 0 | 0.030s | 19.025s |
| 多仓有贡献Service | 1.137s | 7.116s | 0 | 0.031s | 8.284s |
| 多贡献部分交付恢复 | 1.329s | 13.595s | 0 | 0.047s | 14.972s |
| 合计 | 8.959s | 67.004s | 0 | 0.215s | 76.179s |

文件墙钟为76.640秒。主体占分段总量88.0%，prepare占11.8%，cleanup占0.3%；剩余主要成本是必须真实执行的Finish、Git remote/readback、SQLite checkpoint和恢复主证据，不是fixture初始化或cleanup。System reporter现在转发`buildr.golden-journey-timing/v1`，成功和失败run都能保留分段诊断。

### 预算与数学下限

`system-task-finish`的60秒target长期低于当前75–77秒独立中位区间，也低于三轮无外部竞争Core中的113.439/107.242/99.506秒，现按真实日常调度校准为120秒观察预算。三轮Core总墙钟为345.690/326.479/309.143秒，均为52 steps、lease等待不超过3ms并全部通过。Core total target work由976秒变为1036秒，容量4的数学下限由244秒变为259秒；Candidate仍为66 steps，total target work由1338秒变为1398秒，数学下限由334.5秒变为349.5秒。两者当前限制项仍是global capacity，资源容量和Candidate/tarball/Launcher/Release authority均未改变；这里诚实提高预算，不把没有稳定收益的实验当作降本。

本轮正式结论是：继续把该owner的独立准备替换成Prepared Fixture收益不足。后续若要降低主体成本，必须先找到不承担Finish primary evidence的具体Git/SQLite操作反例；在此之前不扩建基础设施、不缓存结果、不提高并发。

实现树affected因`verification/registry.mjs`与runner authority变化可解释地升级为53-step Full并全部通过，lease等待3ms，总墙钟335.066秒。并发执行时`system-task-finish`为111.643秒；prepare/body/cleanup合计约11.2/98.2/0.3秒，说明CPU、磁盘和Git主体竞争会显著放大journey，而cleanup仍不是瓶颈。这一轮不冒充干净Core，也不用于降低预算。

## 9. affected / Full 选择复核（2026-08-24）

本节是退役前历史回放；其中原执行记录已随产品能力删除，不再作为current authority。

### 9.1 近期普通 Task 样本

| Task | 正式 capability | 当前回放 scope / reason | steps 前→后 | 正式墙钟 |
| --- | --- | --- | ---: | ---: |
| `prepare-parent-by-default` | `product.delivery` | affected | 15→15 | 45.687s |
| `reconcile-cleaned-empty-finish-carriers` | `product.delivery` | affected | 10→10 | 88.692s |
| `optimize-golden-lifecycle-execution-paths` | `product.delivery` | full / `execution-graph-change`，由 `test/verification/registry.mjs` 触发 | 53→53 | 320.841s |

此可复核小样本的 Full 升级率为 1/3（33.3%）；selected step 中位数为15、P90为53；正式墙钟中位数为88.692秒、nearest-rank P90为320.841秒。唯一 Full reason 是 `execution-graph-change`。五个最常出现的重型 owner 并列各2次：`integration-self-bootstrap`、`capability-cli-integration`、`commands-cli-integration`、`openspec-convergence-recovery`、`managed-data-integrity`；其中四项来自技能/资源投影样本，`integration-self-bootstrap`来自自举收尾样本，Full 样本自然包含全部日常 owner。

样本量只有3，不能外推长期升级率；`converge-product-golden-lifecycle-verification-cost` 的正式 record 没有 changed paths，明确标记 missing，未纳入分母。`redesign-release-workflow` 的 retained record是显式 `product.full-regression`，不是普通 `product.delivery` 的 affected 选择，也未混入普通样本。

### 9.2 路径反例与选择粒度

| 路径类型 | scope | steps | Static / Unit / Component / Integration / System | 重型 primary owner |
| --- | --- | ---: | --- | --- |
| 普通 Task domain logic | affected | 9 | 5 / 1 / 1 / 1 / 1 | `integration-task-development`、`system-task-lifecycle` |
| Finish application | affected | 9 | 5 / 1 / 1 / 1 / 1 | `integration-task-finish`、`system-task-finish` |
| Git worktree provider | affected | 9 | 5 / 1 / 1 / 0 / 2 | `system-worktree-lifecycle`、`concurrent-task-acceptance` |
| process boundary | affected | 10 | 5 / 1 / 1 / 2 / 1 | `system-app-process`、`host-node-boundaries` |
| planner / registry / ownership authority | full | 52 | 8 / 1 / 1 / 21 / 21 | 完整 daily-full evidence set |
| unknown high-risk application path | blocked | 0 | 0 / 0 / 0 / 0 / 0 | 无 owner 时 fail closed |
| Release contract input | not-applicable | 0 | 0 / 0 / 0 / 0 / 0 | delegated to `product.candidate-release` |

Unit 的实际粒度是：只要计划选择 `unit` step，就运行完整低成本 Unit suite；Component、Integration 与 System 按 path→owner 选择，并通过 `dependency-closure` trace解释附带步骤。每个 `stepSelections` 条目现同时投影触发 path、selection kind、execution boundary、primary evidence owner、public outcome 与目标预算。

### 9.3 本轮 before / after 与结论

三个真实普通 Task 的 scope、step count 与 owner集合均未变化，所以本轮没有可归因的执行时间收益。新增的两个变化是安全修正，不是降本：

- `test/verification/ownership.mjs`：affected 8 steps → full 52 steps，稳定 reason为 `ownership-authority-change`；选择 authority 自身不再逃过完整验证。
- 未知高风险 `src/task/application/**`：affected 7 steps → blocked；通用 Unit/CLI architecture owner不能再掩盖缺失的领域 primary owner。

因此当前正式结论是：在这个近期小样本中，普通 Task 没有无理由进入 Full；唯一升级由 execution graph authority 变更触发。选择规则不是主要瓶颈，剩余成本来自被正确选择的真实 primary owner，尤其是 Finish、self-bootstrap、Workspace/Worktree、进程和 capability/OpenSpec runtime 边界。继续降本必须优化这些 owner 内部的真实准备或主体成本，不能通过放宽 Full、删除证据、缓存被测选择结果或提高全局并发取得。

该轮历史daily-full墙钟为427.822秒；原记录标识与正文已不再属于当前产品。

本Change实现树随后因planner/ownership authority变更运行一次真实changed→Full：52 steps全部通过，总墙钟288.354秒，`product-full-execution`等待2ms，最慢owner为`system-task-finish` 81.083秒。该轮比427.822秒历史正式Full快，但step集合没有变化，且是单次transient开发反馈，不能把差值归因于selection实现；它只证明当前完整daily-full在本轮无竞争机器状态下可执行，并保留了超目标owner的逐项warning。
