# Buildr 测试框架与 Task Verification 实践

本文记录 Buildr 当前怎样开发、分层和编排测试，Task Verification 怎样声明并使用这些测试能力，以及每轮性能优化的事实与结论。

通用指导以 [project-testing Skill](../services/buildr/package/targets/workspace/skills/buildr/project-testing/SKILL.md) 和 [testing model](../services/buildr/package/targets/workspace/skills/buildr/project-testing/references/testing-model-v1.md) 为准；正式能力与结果 authority 以 [verification.yml](../verification.yml)、[Task Verification spec](../openspec/specs/task-verification/spec.md) 和 [task-verification Skill](../services/buildr/package/targets/workspace/skills/buildr/task-verification/SKILL.md) 为准。本文只记录 Buildr 自举实践，不创建第二套 Result 或生命周期 authority。

## 1. 测试模型

Buildr 不把所有验证强行塞进 Unit、Component、Integration。每个 registry step 分别记录三类事实：

| 维度 | 当前分类 | 回答的问题 |
| --- | --- | --- |
| 测试意图 | Development、Acceptance、Static Conformance、Delivery / Release | 为什么验证 |
| 执行边界 | Static、Unit、Component、Integration、System | 穿过了什么技术边界 |
| 选择与目标 | Quick；focus / affected / full；Candidate / Release | 什么时候、按多大范围、验证哪个目标 |

`System` 不等于 Acceptance，`Static` 不是 Unit，`Candidate` 也不是测试类型。Service 主要拥有自身代码、公开技术契约和独立交付物事实；Project 主要拥有跨 Service 行为、治理资产、用户 Journey 和组合交付事实。多个测试可以提供辅助证据，但每项事实只有一个 primary owner。

## 2. 直接测试层

Buildr Service 使用 Node.js ESM 与内置 `node:test`。截至 2026-08-04，稳定直接入口如下：

| 层次 | 入口与规模 | 主要内容 | 环境 | 并发 |
| --- | --- | --- | --- | --- |
| Unit | `test:unit`；`test/unit` 21 个文件 | 同进程纯逻辑，协作者替换；任何实现变化都可完整运行 | Node；不启动真实 CLI、Git、npm 或 Workspace | `node:test` 文件并发；外层 `cpu-heavy=2` |
| Component | `test:component`；`test/component` 1 个文件 | 单一有界 Application 组装，使用 fake/受控轻环境 | Node、内存 fake，不穿过真实 filesystem 或进程边界 | `node:test`；外层 `cpu-heavy=2` |
| Contract | `test:contract`；`test/contract` 19 个文件 | schema、manifest、Skill、文档、源码结构和稳定入口 declaration 一致性 | 只读 Product tree；不创建可变 fixture，不启动真实 CLI/Git/网络 | `node:test` 文件并发；外层 `cpu-heavy=2` |
| Integration | `test:integration`；`test/integration` 34 个文件 | 真实 filesystem、Git、子进程和模块边界，不运行完整用户生命周期 | 隔离临时目录、本机 Git、Node 子进程；包含从 Contract 迁出的环境测试；无浏览器 | 直接入口保留全部文件以便定位；Candidate 中普通聚合排除专属 lifecycle slice，并以 6 worker 运行 |
| Task Development Integration | `integration-task-development`；`task-development-application.test.mjs` 1 个文件、2 个用例 | Task Development 贯穿真实 CLI、filesystem 和 Application 的生命周期事实 | 独立临时 Workspace、CLI、Git；无浏览器 | `workspace-heavy` + `workspace-saturating`；文件内顺序执行，避免与普通 Integration 混在一起 |
| System | `test:system`；`test/system` 25 个文件 | 完整 CLI、Workspace、Local App runtime、Task/Environment/Development/Review/Verification/Finish 与 worktree Journey | 隔离 Workspace、Git、CLI 子进程，部分使用 loopback HTTP；无真实浏览器 | `node:test` 固定最多 14 个文件 worker；外层同时受 `workspace-heavy` 与 `workspace-saturating` 限制 |
| Recovery | `test:integration:candidate:recovery` 1 个文件；Release 专项 2 个文件 | builtin 迁移/恢复与 Git release convergence | 多轮临时 Workspace/Git | `workspace-saturating`；默认最多 2 路，受限 CI 1 路 |
| Browser System | `test:browser:smoke` 1 个文件、6 个 selector | Local App shell、Task、Project、Service、Change 的真实浏览器 Journey | 本机 Chrome/Chromium、Playwright Core、loopback server、临时 Workspace | 不进入 Product Full；`verification.yml` 的 `browser` 协调资源容量为 1 |

历史 `test:integration:fast` 已退休。它实际需要 60 秒以上并穿过完整 CLI/Git/Workspace，不是 fast，也不是普通技术 Integration；同一集合现在只有 `test:system` 一个入口。

每个 registry step 另外声明 `environment.footprints`、`environment.isolation` 与 `resetBurden`。Component 必须是空足迹、无隔离环境、无重置；Quick 拒绝重复 cleanup、完整 lifecycle 和共享可变环境。Integration 只有在目标耗时有界、环境可测且独立、无 reset burden，并且不穿过 Git、网络或 Workspace lifecycle 时才允许作为例外进入 Quick。Planner 与 `testing-boundaries` contract 在启动 verifier 前共同 fail closed，不按名称或一次 timing 推断资格。

## 3. 完整 registry inventory

Product registry 当前有 43 个 executable steps、40 个 primary owners；Task Development 与两个 Task Finish slice 分别复用 `integration` 或 `system` 的 primary owner，`runtime-skill-projection` 独立持有 packaged Skill 内容投射证据。`test:candidate` 选择 38 个主步骤：新增 Task Development step 只是从原 `integration` 聚合中拆出既有文件，不减少其他 Candidate 证据。Release Git convergence 与 clean-checkout onboarding 保留为 focus/Release 专项。

| 分组 | step IDs | 主要事实 | 主要环境与并发 |
| --- | --- | --- | --- |
| 直接层 | `unit`、`component`、`contract`、`integration`、`integration-task-development`、`system` | 纯逻辑、有界组装、仓库契约、普通技术边界、Task Development 生命周期、完整公共 Journey | 见上一节；重型 owner 会产生较多 CLI/Git 子进程 |
| affected slice | `integration-task-finish`、`system-task-finish`、`runtime-skill-projection` | Task Finish 直接影响的 3 个 Integration 文件和 2 个 System 文件；变更 Skill 在 7 个 supported adapter 的 source digest、完整投射 inventory 与 receipt | changed plan 使用有界 owner；Candidate 仍运行完整聚合层与 `runtime-adapter-parity` |
| Quick 静态门禁 | `cli-architecture`、`openspec-spec-quality`、`openspec-strict` | CLI 模块结构、canonical spec 质量、OpenSpec strict | Product tree、bundled OpenSpec；只读运行，可与其他低成本 step 并行 |
| 恢复与验收 | `integration-candidate-recovery`、`concurrent-task-acceptance`、`openspec-contract-fixtures`、`openspec-convergence-recovery` | builtin 恢复、双 Task 组合验收、OpenSpec contract、convergence/recovery | 临时 Git/Workspace；OpenSpec contract 10 case、recovery 5 case，集合互斥；重型步骤受 `workspace-saturating` 限制 |
| Candidate 静态事实 | `open-source-candidate`、`openspec-candidate-audit`、`managed-mutations`、`package-static`、`docs-quality` | 公共发布材料、Change contract、mutation owner、package inventory、文档质量 | Product tree 或已生成 tarball；无浏览器 |
| Package 组装与集成 | `candidate-tarball`、`package-workspace`、`package-commands`、`package-rules`、`package-skills`、`package-runtime` | tarball 可组装，六类受管资产结构与安装行为正确 | 本地 `npm pack`、临时目录、开发 CLI；不访问 npm registry |
| Package/Release Journey | `cli-package-parity`、`release-tarball-smoke` | checkout 与同一 tarball 的代表输出/一次 init mutation 一致；安装版 init/sync/doctor/uninstall 可用 | 共享 Candidate tarball、临时 npm prefix/Workspace；三个 consumer 依赖 `candidate-tarball`，可在产物生成后并行 |
| CLI 与 capability | `capability-cli-integration`、`commands-cli-integration`、`cli-compatibility`、`service-branch-contract`、`remote-skill-timeout` | capability/Commands 资产、公开 CLI 兼容、Service branch、远程读取超时 | 临时 Workspace/Git/CLI；55 项 help 同进程穷举、7 项代表 help 走真实 CLI；timeout 只使用 loopback HTTP |
| Runtime 与 Workspace E2E | `runtime-adapter-contract`、`runtime-adapter-parity`、`workspace-lifecycle`、`ownership-recovery`、`runtime-reconciliation`、`init-onboarding`、`managed-data-integrity` | adapter descriptor 与多轮临时投射、7 个 adapter inventory/Doctor、5 个实现族生命周期、Workspace 生命周期/恢复/投射、init、原子 mutation 与 nested repo 保留 | `runtime-adapter-contract` 需要重复临时 filesystem cleanup；其余为多轮临时 Workspace、CLI、Git，runtime parity 是 `workspace-saturating` |
| 独立专项 | `integration-candidate-release`、`repository-onboarding` | dev/main release convergence；干净 checkout 安装开发 CLI | 本地临时 Git；不属于核心 Full，按 Release 或 affected/focus 选择 |

`concurrent-task-acceptance` 是唯一组合 Acceptance owner：它创建本地多仓 Workspace 和两个正式 Task，并发 prepare 两个 Environment，并发运行 Project verification、记录两份独立 current Result，并启动两个 Preview；它验证共享资源容量、owner guard、异常诊断，再顺序 cleanup Environment 以证明清理一个 Task 不影响另一个。完整浏览器业务验收由独立 Browser capability 持有，不混入这个步骤。

## 4. 环境与并发模型

Candidate DAG 的默认并发不是“测试进程总数”，只约束外层 step：

| execution profile | global | `cpu-heavy` | `workspace-heavy` | `network` | `exclusive` | `workspace-saturating` | `task-lifecycle-heavy` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `local` | 4 | 2 | 3 | 2 | 1 | 2 | 1 |
| `ci` | 4 | 2 | 3 | 2 | 1 | 2 | 1 |
| `ci-workspace-limited` | 4 | 2 | 2 | 2 | 1 | 1 | 1 |

还要同时考虑内层并发：

- 外层 profile 是唯一预算 authority：`local`/`ci` 将普通 Integration、System、OpenSpec contract/recovery 分别限制为 6、8、4、3 个内部 worker；`ci-workspace-limited` 对应为 3、6、3、2。预算只在 Candidate、changed 与 focus 的 registry execution 中注入；直接定位命令保留各自安全默认值；
- `node:test` 会按文件启动 worker；`test:system` 的直接默认是最多 14 路，经过 registry 运行时使用 profile 注入的 8 路；
- Candidate 中 `integration` 使用 general suite，排除 Task Development 与 Task Finish 专属文件；Task Development 专项保持单文件顺序执行并占用真实 `workspace-saturating` 压力容量；
- `task-lifecycle-heavy` 只由 System 与 Task Development Integration 共同声明，容量为 1。它是已测得的 CPU/process/filesystem 压力节流，不是共享状态锁；OpenSpec recovery、runtime parity 等其他饱和型 owner 仍可在独立临时根上并行；
- `test:system` 为 Task Record/Review/Verification 与 Verification CLI 准备一次 `task-lifecycle/v1` 不可变基线，每个 case 复制独立 sandbox；初始化、Git/Task Environment、安装、迁移和 Finish 测试仍自行准备完整环境；
- `runtime-adapter-parity` 只初始化一次只读 seed，再为每个 adapter 与安全场景复制独立 sandbox，内部最多 3 路；同一 sandbox 内的 mutation、runtime check 和 Doctor 保持串行；
- System runner 只粗粒度前置已知长 owner，其余保持字母序，并用 dot reporter 压缩成功日志；这不是动态调度器；
- OpenSpec contract/recovery runner 在各自 suite 内按 case 并发；直接诊断最多 12 路，registry execution 使用 profile 注入的 4/3 路；
- 多个 verifier 会再启动 Buildr CLI、Git、npm 或短生命周期 Node 子进程；
- 双 Task acceptance 内部只在事实本身要求并发时启动两路 prepare、invocation、verification、Result record、preview stop 和 Task abandon；只有必须证明 peer preservation 的 Environment cleanup 保持顺序；
- Browser 通过 Project declaration 的协调资源容量 1 串行，避免多个 Chrome fixture 互相争用。

因此外层 `global=4` 不等于全机只有 4 个进程。`workspace-saturating` 是压力节流，不是共享状态锁：只有使用不同临时 execution root 的 verifier 才允许两路并行；受限 CI 可显式选单路 profile。所有 Product tests 默认使用本机隔离临时目录，不要求 Docker、数据库、云服务或真实网络；Browser 例外地要求本机 Chrome/Chromium。

## 5. 编排入口

| 入口 | 定位 | 选择规则 |
| --- | --- | --- |
| `npm test` / `test:fast` | Quick | 完整 Unit、Component、静态 Contract、CLI architecture、OpenSpec spec quality/strict；不含真实投射、重复 cleanup、System、npm pack、浏览器或恢复矩阵 |
| `test:changed` | affected 或必要 full | 按 Git diff/显式 Product paths 匹配直接 owner；聚合层可排除已有专属 slice 的路径；未映射 fail closed；命中 registry/planner/runner/声明/timing 等全局 owner 时确定性扩展 full |
| `test:focus -- <step|group>` | 故障定位 | 只选择指定 primary owner 与真实 artifact dependency，不附加完整 Quick |
| `test:candidate` | 显式 Product Full | 固定选择 38 个 Candidate owners，不按 diff 缩小；输出 transient timing/diagnostics |
| `test:release` 与 Release focus | 发布专项 | release convergence、tarball 安装与发布物行为；不把发布 Git 流程塞进每个 Candidate |
| `test:browser:smoke` | 条件化 Browser System | Local App 变化时由独立 capability 选择；可用 selector 定位，不在 Product Full 重复五次 |

### Quick 准入快照（2026-08-04）

同一 Task worktree 连续三轮 `npm run test:fast` 墙钟为 2.22s、1.84s、1.91s。每轮 runner 只创建并最终删除一个共享 diagnostics 临时根；以下 step 自身的环境初始化与 cleanup 次数均为 0，且都不声明协调资源：

| step | 边界与环境 | reset burden | 三轮耗时 | 隔离与并发 | 保留理由 |
| --- | --- | --- | --- | --- | --- |
| `unit` | Unit；同进程纯逻辑，无真实环境足迹 | `none` | 491 / 450 / 421ms | `cpu-heavy`，最多 2；无共享可变状态 | 完整低成本纯逻辑反馈 |
| `component` | Component；内存 fake，无 filesystem/CLI/Git/网络/Workspace | `none` | 372 / 350 / 317ms | `cpu-heavy`，最多 2；无共享可变状态 | 有界组装且满足 Component 硬边界 |
| `contract` | Static；只读 Product tree | `none` | 539 / 512 / 571ms | `cpu-heavy`，最多 2；文件级并发只读 | 只保留静态 declaration/manifest/Skill/schema 契约 |
| `cli-architecture` | Static；只读源码与入口结构 | `none` | 319 / 296 / 265ms | `default`，全局最多 4；只读 | 低成本架构一致性 |
| `openspec-spec-quality` | Static；只读 canonical OpenSpec | `none` | 204 / 173 / 137ms | `default`，全局最多 4；只读 | canonical spec 质量静态检查 |
| `openspec-strict` | Static Conformance；一次 bundled OpenSpec CLI，只读 Project tree | `none` | 1353 / 1399 / 1512ms | `default`，全局最多 4；无网络或可变 fixture | 单次、可测、只读严格校验，不承担环境重置 |

Quick runner 全局最多并发 4 个 step；`unit`、`component`、`contract` 共用 `cpu-heavy=2` 上限，其他三个 step 使用 `default=4`，但仍受全局上限约束。没有 Quick step 使用 `workspace-heavy`、`workspace-saturating`、network 或 exclusive 资源。

迁出的 `development-entry`、`task-asset-observation`、候选文件系统、Task Manager 临时 capability graph 与 verification CLI process cases 现在由 `integration` 选择；它们包含真实 CLI/Git/filesystem 或 cleanup。`runtime-adapter-contract` 虽单次耗时较低，但会重复创建和清理临时投射目录，因此保留 changed/focus/Candidate identity 并退出 Quick。

Quick 是成本约束，affected/full 是选择范围，Candidate/Release 是验证目标或节点。三者不再作为一条混合层级，也不进入 Task Verification Result schema。

## 6. Task Verification 如何使用项目测试

Task Verification 不登记 41 个内部 executable step，也不为用户设计测试。`verification.yml` 只暴露 6 个稳定能力接口：

| capability | 调用与证明范围 | 交付要求 |
| --- | --- | ---: |
| `product.fast` | `npm run test:fast`；低成本开发反馈 | 否 |
| `product.delivery` | `test:changed -- --base origin/dev`；同一 plan 的 affected 或必要 full | 是 |
| `product.full-regression` | `npm run test:candidate`；显式核心完整回归 | 否 |
| `product.browser-smoke` | Local App paths 适用时运行真实浏览器 Journey | 适用时是 |
| `product.archive-lifecycle` | Change active/archive 与 Task Development/Finish authority 顺序 | 否 |
| `product.openspec-convergence-journey` | OpenSpec 写入、恢复、归档与并发收敛 Journey | 否 |

Agent 的正式验证流程是：

```text
Task scope + changed paths + implementation risk
        ↓ 开发期 Quick / changed / focus
Development 稳定 Content Target 并固定 verification policy
        ↓ 执行适用 capability，保存 transient evidence
记录一个绑定 Content Target 与 declaration identities 的 current Result
        ↓ Verification facts 完整后冻结 Task Candidate
```

完整 stdout/stderr、临时路径、环境启动和 timing 属于 transient Execution Evidence；portable Result 只保留 Content Target、声明、实际能力事实、coverage gap 和整体结论。target 或 declaration 变化后 Result 派生为 stale。Task Development 与 Local App 复用同一个 Result reader；Task Finish 不读取或发起 Verification。

## 7. 当前性能根因与本轮结论

冻结 `dev` 基线 Full 为 193.161 秒，且因受管 `CLAUDE.md` 被 source-layout 错判而失败。问题不是单一的“环境启动慢”，而是重复证据、CLI 冷启动、环境生命周期和嵌套并发共同作用：

| 问题 | 事实 | 本轮处理与结论 |
| --- | --- | --- |
| System 重复前置与队尾关键路径 | P0.5 合入前基线 22 个文件、56.64s、约 230.7 CPU 秒；Task lifecycle 文件反复冷启动相同 Workspace/Project | 同口径隔离树上，24 个 owner 文件、112 项测试共享一次只读基线并保留逐 case sandbox；fixture 用 4 次 Application 操作准备，长 owner 前置。结果为 55.38s、约 217.4 CPU 秒，墙钟约降 2.2%、CPU 约降 5.8%。rebase P0.5 后集合增至 25 个文件、115 项测试，单跑 67.50s、约 250.9 CPU 秒；本轮合并重复 Worktree Journey 后为 25 个文件、114 项测试，Task Development Journey 仍不复用该 context |
| OpenSpec case 重复 | 两个 Candidate owner 都跑全部 15 case | 分为 contract 10 / recovery 5，交集为空；独立约 13.9s / 23.9s |
| Package parity 重复生命周期 | 旧值 65.95s，重跑 Task/Review/Verification、双 Environment 和 release 行为 | 只保留代表输出、一次 init mutation 与 package assets；独立约 8.50s |
| CLI help 冷启动过多 | 55 topic × 两种 form，约 109 次完整 CLI，Candidate 18.6s | 同一 owner 穷举 55 项同进程 contract，7 类代表入口保留真实进程；独立约 7.3s |
| Acceptance 重复 reader/guard 且独立操作串行 | 带 Result 后独立约 42.7s；Result 8.1s、preview 12.6s、cleanup 17.7s | 删除重复双 inspect 和已有其他 owner 的 cleanup guard；并发独立 invocation/stop/abandon；独立 33.4s，其中 prepare 3.7s、Result 4.2s、preview 7.5s、cleanup 10.8s |
| 外层并发看不见内层 fan-out | `global=4` 只限制 outer step；System、OpenSpec、Integration 仍会各自启动 worker 和 CLI/Git 子进程 | profile 向普通 Integration/System/OpenSpec contract/recovery 注入 6/8/4/3 worker budget。相同冻结树中，System 与 Task Development 并行的 Full 为 174.508s，二者分别膨胀到 99.539s/107.066s；只让这两个生命周期 owner 使用容量 1 的压力组后，Full 为 149.979s，分别为 78.111s/71.813s。其他饱和型验证仍可并行；这不是全局串行或共享状态锁 |
| 调度成本为 0 或过时 | 实际 9.5s 的 runtime reconciliation 被按 5s 留在尾部 | 按实测粗粒度前移；成本只用于启动顺序，不成为持久性能事实 |
| Environment 启停 | 双 Task 要创建/删除 4 个 Git worktree，顺序 cleanup 是 peer-preservation 证据 | prepare 不是主瓶颈；cleanup 是 acceptance 最大单阶段但不能删除。下一轮应优化产品 cleanup 实现或局部 fixture，不能把必要证明改成假并发 |
| affected owner 过度扩散 | Task Finish 交付的 25 条 Product path 曾命中 20 个 step：任意 Skill 命中 9 个 owner、任意 OpenSpec 内容命中两个重型 fixture、Task Finish 源码命中完整 Integration/System/并发验收 | 删除非直接 owner，并让 Task Finish 使用 3-file Integration 与 2-file System slice；同一历史路径回放降为 15 个 step。安全内容扫描及其 tarball dependency 保留；两个 slice 实跑 16/16、总墙钟 5.17 秒，完整 affected 回放 37.110 秒，相比原正式运行 135.035 秒；Candidate 的 37 个主步骤不变 |
| Runtime parity 重复环境与覆盖错位 | 同一 `dev` 三轮为 34.44–35.61s，中位 35.34s；6 次 `init`、重复 install/render、串行 Doctor；且代码把 5 个实现族代表误当成全部 supported adapter，遗漏 Trae/Trae Work inventory/Doctor | 一次 seed init、隔离 clone、3 路有界并行；7 个 adapter 全量 inventory/Doctor，5 个实现族保留 install/render/check/idempotency/orphan/uninstall/restore/cleanup。最终内容树两轮 20.59–23.11s，中位 21.85s，下降约 38%；普通 Task Finish Skill 改走 `runtime-skill-projection`，完整 6-step affected 为 13.479s |

P0.5 合入前、最终文档冻结时的干净候选上，Quick 为 6.4 秒，38-step Changed 为 148.543 秒，37-step Candidate 为 147.819 秒且全部通过；同一优化树另有 132.741 秒和 143.323 秒全绿结果。相对 193.161 秒基线，墙钟下降约 23%–31%。rebase P0.5 后先复测当前 System 为 115/115、67.50 秒；正式 delivery timing 以本次稳定 Content Target 的 transient summary 为准。120 秒仍只是未达成的观察目标，不应通过调高预算或删必要风险证据宣告成功。

## 8. 下一轮优化方案

1. 为 System 增加只进入 transient diagnostics 的紧凑文件级耗时摘要；保持 `dot reporter` 的正常输出，不把 timing 写入 portable Verification Result。
2. Browser、性能/压力、安全等扩展测试等到真实需求出现后再设计；Component 层随真实边界补齐，不为层次数量制造测试。

## 9. 迭代记录

| 轮次 | 主要结论 |
| --- | --- |
| 1. 恢复 Fast | 108s Fast 的主要成本是误纳完整生命周期；历史 System 退出 Quick |
| 2. 建立指导 | `project-testing` 指导项目设计测试；`task-verification` 只发现、声明和执行稳定能力 |
| 3. 落实分层 | 建立 Unit/Component/Contract/Integration/System 边界，Quick 收敛到秒级 |
| 4. 修正编排 | 成本、affected 范围与 Candidate/Release 目标分开；Browser、Release 专项去重 |
| 5. 删除重复 | OpenSpec case 唯一 owner、package parity 缩窄、Acceptance 保留唯一组合事实 |
| 6. 优化冷启动 | 55 项 help contract 保留全覆盖，真实 CLI 只跑代表边界；机械拆文件负优化被回退 |
| 7. 冻结复测 | Quick 6.4s；Changed 148.543s；Candidate 147.819s 全绿，剩余关键路径确认是嵌套 fan-out 与重复 CLI/Workspace baseline |
| 8. 复用上下文 | Task lifecycle 共享一次只读基线、逐 case 独立 sandbox；同口径 112/112 为 55.38s、CPU 约降 5.8%；rebase P0.5 后当前 115/115 为 67.50s，下一步分别分析新增 Task Development Journey 与真实 Task Environment/Git Journey |
| 9. 收窄 affected | 用直接 owner 替代“最终可到达”关系；历史 Task Finish 计划从 20 降至 15 step，完整 Integration/System 替换为 3+2 文件 slice，安全内容扫描保留，Full membership 不变；14 路 System 暴露的固定 25ms 进程退出断言改为 1s 有界最终退出，不放宽清理要求 |
| 10. 优化 runtime parity | packaged Skill 内容改走约 2s 的 7-adapter 投射 slice；完整 parity 复用一次 seed 并隔离 clone，补齐 7-adapter inventory/Doctor 与 5-family lifecycle，最终内容树两轮中位数为 21.85s，较 35.34s 基线下降约 38%，Candidate gate 数不变 |
| 11. 预算内层并发 | Task Development 从普通 Integration 聚合中拆出，保留 Integration 边界与全部 Candidate 证据；profile 对重型 runner 注入有限 worker budget。相同冻结树对照证明 System 与 Task Development 并行会相互放大，二者使用单一压力容量后 Full 从 174.508s 降至 149.979s；下一步只优化该专项的不可变 fixture 准备 |
| 12. 验证 Task Development fixture 假设 | 两用例直接运行总计 98.95s；共享方案中的真实 `init + project create` 基线仅约 2.82s，而每例 Development 生命周期仍约 46–61s。约 3% 的潜在收益不足以承担新的共享 fixture 维护成本，因此不保留该 helper；下一步转查 package selector 的重复静态准备 |
| 13. 收敛 package static owner | 五个 package Integration selector 各重复扫描 213 个静态文件；现在仅 `package-static` 执行该扫描，其他 selector 只运行各自 Journey 并明确静态事实由 `static` owner 持有。Candidate owner 与独立诊断不变，公共 `buildr package check` 仍先执行完整 static 再运行 aggregate。受机器负载波动影响，未把单次 package group 墙钟作为收益结论；确定性地消除了每个 Candidate 的五次重复扫描 |
| 14. 审计测试残留进程 | 清理 3 个旧 Local App Preview 和 2 个 detached fixture 进程；其 worktree/临时目标均已不存在。当前双 Preview Journey 与 runner descendant cleanup 聚焦测试通过且未产生新残留，因此结论是历史环境污染，不追加当前产品修复或全局进程名清理机制 |
| 15. 收敛 Worktree System Journey | 隔离基线 7 条串行 Journey 为 44.90s，其中三条 Task Environment Journey 占主要成本。共享占用/释放合并为一条公共 Journey，placement mismatch 下沉到 Application Integration，真实 Git create/cleanup 与公共 CLI 仍保留；公共 CLI 操作约从 39 次降到 30 次。背靠背候选为 6/6、30.41s，墙钟约降 32%，user+sys 从 43.15s 降到 30.28s；并发负载下的漂移结果未计入收益 |
