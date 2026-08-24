# Product 日常验证证据与选择审计

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

该入口只读，不运行 verifier，不把 target budget 当作实测。实际 queue、resource wait、prepare/body/cleanup 与 wall-clock 仍以 Execution Record 为准。

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
| `integration-task-execution-records` | 20s | body/metadata/recovery/retention不一致必须失败 | SQLite与filesystem body store |
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
