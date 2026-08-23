# Buildr 测试框架与 Task Verification 实践

本文记录 Buildr 当前怎样开发、分层和编排测试，Task Verification 怎样声明并使用这些测试能力，以及每轮性能优化的事实与结论。

通用指导以 [project-testing Skill](../services/buildr/resources/workspace/skills/buildr/project-testing/SKILL.md) 和 [testing model](../services/buildr/resources/workspace/skills/buildr/project-testing/references/testing-model-v1.md) 为准；正式能力与结果 authority 以 [verification.yml](../verification.yml)、[Task Verification spec](../openspec/specs/task-verification/spec.md) 和 [task-verification Skill](../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md) 为准。本文只记录 Buildr 自举实践，不创建第二套 Result 或生命周期 authority。

## 1. 测试模型

Buildr 不把所有验证强行塞进 Unit、Component、Integration。每个 registry step 分别记录三类事实：

| 维度 | 当前分类 | 回答的问题 |
| --- | --- | --- |
| 测试意图 | Development、Acceptance、Static Conformance、Delivery / Release | 为什么验证 |
| 执行边界 | Static、Unit、Component、Integration、System | 穿过了什么技术边界 |
| 选择与目标 | Quick；focus / affected / full；Candidate / Release | 什么时候、按多大范围、验证哪个目标 |

`System` 不等于 Acceptance，`Static` 不是 Unit，`Candidate` 也不是测试类型。Service 主要拥有自身代码、公开技术契约和独立交付物事实；Project 主要拥有跨 Service 行为、治理资产、用户 Journey 和组合交付事实。多个测试可以提供辅助证据，但每项事实只有一个 primary owner。

## 2. 直接测试层

Buildr Service 使用 Node.js ESM 与内置 `node:test`。截至 2026-08-15，稳定直接入口如下：

| 层次 | 入口与规模 | 主要内容 | 环境 | 并发 |
| --- | --- | --- | --- | --- |
| Unit | `test:unit`；`test/unit` 49 个文件 | 同进程纯逻辑，协作者替换；任何实现变化都可完整运行 | Node；不启动真实 CLI、Git、npm 或 Workspace | `node:test` 文件并发；外层 `cpu-heavy=2` |
| Component | `test:component`；`test/component` 1 个文件 | 单一有界 Application 组装，使用 fake/受控轻环境 | Node、内存 fake，不穿过真实 filesystem 或进程边界 | `node:test`；外层 `cpu-heavy=2` |
| Contract | `test:contract`；`test/contract` 32 个文件 | schema、manifest、Skill、文档、源码结构和稳定入口 declaration 一致性 | 只读 Product tree；不创建可变 fixture，不启动真实 CLI/Git/网络 | `node:test` 文件并发；外层 `cpu-heavy=2` |
| Integration | `test:integration`；`test/integration` 66 个文件 | 真实 filesystem、Git、子进程和模块边界，不运行完整用户生命周期 | 隔离临时目录、本机 Git、Node 子进程；包含从 Contract 迁出的环境测试；无浏览器 | 60 个文件由 14 个领域 primary slice 持有，2 个由外部 primary owner 持有，general 只剩 4 个跨领域文件并以 4 worker 运行 |
| Domain Integration | 声明、OpenSpec、verification、runtime、release、data store、Task Environment、self-bootstrap，以及 7 个 Task 领域 slice | 修改哪个领域就运行哪个真实 repository/Application 边界；general 不再替所有领域陪跑 | 独立临时 filesystem/Git/CLI；只有具有完整 Workspace lifecycle footprint 的压力 owner 才使用 `workspace-saturating` | 每个文件只属于一个 primary owner；general exclusions 完全从统一 slice registry 派生 |
| System | `test:system`；`test/system` 28 个文件 | 完整 CLI、Workspace、Buildr Web runtime、Task/Environment/Development/Review/Verification/Finish 与 worktree Journey | 隔离 Workspace、Git、CLI 子进程，部分使用 loopback HTTP；无真实浏览器 | 按 13 个 primary owner 执行；verification admission 的 2 个入口文件约 5 秒，Workspace、Task、Worktree 和 Finish CLI/Product Journey 各自独立 |
| Recovery | `test:integration:candidate:recovery` 1 个文件；Release 专项 2 个文件 | builtin 迁移/恢复与 Git release convergence | 多轮临时 Workspace/Git | `workspace-saturating`；默认最多 2 路，受限 CI 1 路 |
| Browser System | `test:browser:smoke` 1 个文件、6 个 selector | Buildr Web shell、Task、Project、Service、Change 的真实浏览器 Journey | 本机 Chrome/Chromium、Playwright Core、loopback server、临时 Workspace | 不进入 Product Full；`verification.yml` 的 `browser` 协调资源容量为 1 |

历史 `test:integration:fast` 已退休。它实际需要 60 秒以上并穿过完整 CLI/Git/Workspace，不是 fast，也不是普通技术 Integration；同一集合现在只有 `test:system` 一个入口。

每个 registry step 另外声明 `environment.footprints`、`environment.isolation` 与 `resetBurden`。Component 必须是空足迹、无隔离环境、无重置；Quick 拒绝重复 cleanup、完整 lifecycle 和共享可变环境。Integration 只有在目标耗时有界、环境可测且独立、无 reset burden，并且不穿过 Git、网络或 Workspace lifecycle 时才允许作为例外进入 Quick。Planner 与 `testing-boundaries` contract 在启动 verifier 前共同 fail closed，不按名称或一次 timing 推断资格。

## 3. 完整 registry inventory

Product registry 当前有 73 个 executable primary owners；`test:candidate` 选择 66 个主步骤。Integration 的 15 个领域 slice、4 个 general 文件与 2 个外部 primary owner 互斥持有全部 73 个文件，13 个 System owner 也各自唯一持有其 28 个核心文件；Release Git convergence、clean-checkout onboarding 与 Windows platform owner 保留为显式专项。

| 分组 | step IDs | 主要事实 | 主要环境与并发 |
| --- | --- | --- | --- |
| 直接层 | `unit`、`component`、`contract`、`integration` | 纯逻辑、有界组装、仓库契约与普通技术边界 | 见上一节；重型 owner 会产生较多 CLI/Git 子进程 |
| affected slice | `integration-declarations`、`integration-openspec`、`integration-verification`、`integration-runtime`、`integration-release`、`integration-data-store`、`integration-task-environment`、`integration-self-bootstrap` 与 6 个 Task 领域 slice；13 个 `system-*` owner | 领域真实边界、CLI/Workspace 生命周期与公共 Journey | changed plan 使用直接 owner；Candidate 保留全部 primary owner，但 general/System 聚合不再重复领域文件 |
| admission | `unit`、`component`、`contract`、`cli-architecture`、`openspec-spec-quality`、`openspec-strict`；验证框架适用时再加 `system-verification-admission` | 低成本逻辑/静态门禁，以及 changed-path 与 verification run CLI 的真实入口契约 | 本地 changed/full 合成到同一 DAG；任何重型 step 都等待 admission 通过，单次 execution 不重复 step |
| Quick 静态门禁 | `cli-architecture`、`openspec-spec-quality`、`openspec-strict` | CLI 模块结构、canonical spec 质量、OpenSpec strict | Product tree、bundled OpenSpec；只读运行，可与其他低成本 step 并行 |
| 恢复与验收 | `integration-candidate-recovery`、`concurrent-task-acceptance`、`openspec-contract-fixtures`、`openspec-convergence-recovery` | builtin 恢复、双 Task 组合验收、OpenSpec contract、convergence/recovery | 临时 Git/Workspace；OpenSpec contract 10 case、recovery 5 case，集合互斥；重型步骤受 `workspace-saturating` 限制 |
| Candidate 静态事实 | `open-source-candidate`、`openspec-candidate-audit`、`managed-mutations`、`package-static`、`docs-quality` | 公共发布材料、Change contract、mutation owner、package inventory、文档质量 | Product tree 或已生成 tarball；无浏览器 |
| Package 组装与集成 | `candidate-tarball`、`package-workspace`、`package-commands`、`package-rules`、`package-skills`、`package-runtime` | tarball 可组装，六类受管资产结构与安装行为正确 | 本地 `npm pack`、临时目录、开发 CLI；不访问 npm registry |
| Package/Release Journey | `cli-package-parity`、`release-tarball-smoke` | checkout 与同一 tarball 的代表输出/一次 init mutation 一致；安装版 init/sync/doctor/uninstall 可用 | 共享 Candidate tarball、临时 npm prefix/Workspace；三个 consumer 依赖 `candidate-tarball`，可在产物生成后并行 |
| CLI 与 capability | `capability-cli-integration`、`commands-cli-integration`、`cli-compatibility`、`service-branch-contract`、`remote-skill-timeout` | capability/Commands 资产、公开 CLI 兼容、Service branch、远程读取超时 | 临时 Workspace/Git/CLI；55 项 help 同进程穷举、7 项代表 help 走真实 CLI；timeout 只使用 loopback HTTP |
| Runtime 与 Workspace E2E | `runtime-adapter-contract`、`runtime-adapter-parity`、`workspace-lifecycle`、`ownership-recovery`、`runtime-reconciliation`、`init-onboarding`、`managed-data-integrity` | adapter descriptor 与多轮临时投射、7 个 adapter inventory/Doctor、5 个实现族生命周期、Workspace 生命周期/恢复/投射、init、原子 mutation 与 nested repo 保留 | `runtime-adapter-contract` 的全部投射归属一个 run-unique 临时根并在进程退出时清理；其余为多轮临时 Workspace、CLI、Git，runtime parity 是 `workspace-saturating` |
| 独立专项 | `integration-candidate-release`、`repository-onboarding` | dev/main release convergence；干净 checkout 通过显式 Project bridge 完成同步与诊断且不改变 PATH 默认 CLI | 本地临时 Git；不属于核心 Full，按 Release 或 affected/focus 选择 |

`concurrent-task-acceptance` 是唯一组合 Acceptance owner：它创建本地多仓 Workspace 和两个正式 Task，并发 prepare 两个 Environment，并发运行 Project verification、记录两份独立 current Result，并启动两个 Preview；它验证共享资源容量、owner guard、异常诊断，再顺序 cleanup Environment 以证明清理一个 Task 不影响另一个。完整浏览器业务验收由独立 Browser capability 持有，不混入这个步骤。

## 4. 环境与并发模型

Candidate DAG 的默认并发不是“测试进程总数”，只约束外层 step：

| execution profile | global | `cpu-heavy` | `workspace-heavy` | `network` | `exclusive` | `workspace-saturating` | `task-lifecycle-heavy` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `local` | 4 | 2 | 3 | 2 | 1 | 2 | 1 |
| `ci` | 4 | 2 | 3 | 2 | 1 | 2 | 1 |
| `ci-workspace-limited` | 4 | 2 | 2 | 2 | 1 | 1 | 1 |

还要同时考虑内层并发：

- 外层 profile 是唯一预算 authority：`local`/`ci` 将普通 Integration、System、OpenSpec contract/recovery 分别限制为 4、8、4、3 个内部 worker；`ci-workspace-limited` 对应为 3、2（每个 System owner 上限）、2、2。预算只在 Candidate、changed 与 focus 的 registry execution 中注入；直接定位命令保留各自安全默认值；
- `node:test` 会按文件启动 worker；`test:system` 的直接默认是最多 14 路，经过 registry 运行时使用 profile 注入的 8 路；
- Candidate 中 `integration` 使用 general suite，排除 Task Development 与 Task Finish 专属文件；Task Development 专项保持单文件顺序执行并占用真实 `workspace-saturating` 压力容量；
- `task-lifecycle-heavy` 只由 System 与 Task Development Integration 共同声明，容量为 1。它是已测得的 CPU/process/filesystem 压力节流，不是共享状态锁；OpenSpec recovery、runtime parity 等其他饱和型 owner 仍可在独立临时根上并行；
- 每个资源 claim 必须命中资源契约要求的 footprint、`unique-temporary-root` 隔离与 lifecycle cleanup，否则 planner 在启动前拒绝。只使用独立临时 Git/CLI fixture 的 Task Environment Integration、Task Finish delivery Integration 与 Release convergence 不再占用 `workspace-saturating`；
- Candidate DAG 默认按成功样本校准后的粗粒度成本优先启动长 owner；资源或 class 容量不足的 step 不会阻止其他 ready step 填充空闲容量。`critical-path` 模式按“自身调度成本 + 最长后续依赖链成本”排序，同分时优先 fan-out producer；它与 `declaration` 模式只用于受控对照诊断。timing evidence记录实际模式与每步优先级；
- `system-fresh-build` 使用独立临时 Workspace 和prepared controller，不再占用全局`exclusive`，而是显式声明`workspace-saturating`与`task-lifecycle-heavy`资源。近期成功样本约23–25s，调度成本取25s；Task Finish delivery、System Task Finish、Task Development、execution-record与self-bootstrap等长尾 owner按多次成功样本中位数向上取整，成本仅影响启动顺序，不替代target duration或超时；
- `test:system` 为 Task Record/Review/Verification 与 Verification CLI 准备一次 `task-lifecycle/v1` 不可变基线，每个 case 复制独立 sandbox；初始化、Git/Task Environment、安装、迁移和 Finish 测试仍自行准备完整环境；
- `runtime-adapter-parity` 只初始化一次只读 seed，再为每个 adapter 与安全场景复制独立 sandbox，内部最多 3 路；同一 sandbox 内的 mutation、runtime check 和 Doctor 保持串行；
- System runner 只粗粒度前置已知长 owner，其余保持字母序，并用 dot reporter 压缩成功日志；这不是动态调度器；
- OpenSpec contract/recovery runner 在各自 suite 内按 case 并发；直接诊断最多 12 路，registry execution 使用 profile 注入的 4/3 路；
- 多个 verifier 会再启动 Buildr CLI、Git、npm 或短生命周期 Node 子进程；
- 双 Task acceptance 内部只在事实本身要求并发时启动两路 prepare、invocation、verification、Result record、preview stop 和 Task abandon；只有必须证明 peer preservation 的 Environment cleanup 保持顺序；
- Browser 通过 Project declaration 的协调资源容量 1 串行，避免多个 Chrome fixture 互相争用。

跨 Task 的 coordinated resource 使用共享 root 中的 owner-bound waiting ticket 排队。ticket 只表达等待资格，lease 继续表达执行容量；可用 slot 只授予容量范围内最早的有效 ticket。ticket 通过 heartbeat 续期，成功、取消和 timeout 只删除匹配 owner/token 的 ticket，崩溃或过期 ticket 可由后续 waiter 有界回收。排队、ticket、lease 和 timing 都是 transient execution evidence，不进入 `verification.yml` 或 current Task Verification Result，也不扩展为通用 scheduler 或优先级平台。

因此外层 `global=4` 不等于全机只有 4 个进程。`workspace-saturating` 是压力节流，不是共享状态锁：只有使用不同临时 execution root、并真实穿过完整 Workspace lifecycle 的 verifier 才声明该资源并允许两路并行；受限 CI 可显式选单路 profile。所有 Product tests 默认使用本机隔离临时目录，不要求 Docker、数据库、云服务或真实网络；Browser 例外地要求本机 Chrome/Chromium。

## 5. 编排入口

| 入口 | 定位 | 选择规则 |
| --- | --- | --- |
| `npm test` / `test:fast` | Quick | 完整 Unit、Component、静态 Contract、CLI architecture、OpenSpec spec quality/strict；不含真实投射、重复 cleanup、System、npm pack、浏览器或恢复矩阵 |
| `test:changed` | affected 或必要 full | 按 Git diff/显式 Product paths 匹配直接 owner；生产 Application/Infrastructure 源码必须命中领域 owner 或闭合 allowlist；未映射/owner gap fail closed；非空 plan 在同一 DAG 先运行 Quick，命中验证框架执行权威时扩展 full 并加入 canary |
| `test:focus -- <step|group>` | 故障定位 | 只选择指定 primary owner 与真实 artifact dependency，不附加完整 Quick |
| `test:candidate` | 显式 Product Full | 只选择 Candidate profile 的全部 required owners；不读取 Git diff 或 changed paths；同一 DAG 先运行 Quick + verification admission canary，再启动重型步骤，输出一份 transient timing/diagnostics |
| `test:release` 与 Release focus | 发布专项 | release convergence、tarball 安装与发布物行为；不把发布 Git 流程塞进每个 Candidate |
| `test:browser:smoke` | 条件化 Browser System | Buildr Web 变化时由独立 capability 选择；可用 selector 定位，不在 Product Full 重复五次 |

### 选择权威与执行权威

Changed selection 现在由两个物理分离的 authority 组成：

- `test/verification/ownership.mjs` 保存路径到 primary owner 的 inputs/exclusions、ignore、delegation、production allowlist 和 Full 输入分类。只增加、迁移或重命名 owner 时走 affected，并选择 registry contract、verification admission 与命中的直接 owner；它本身不再无条件触发 Candidate。
- `test/verification/registry.mjs` 保存 command、profile、dependency、resource、timeout、target budget 和 Candidate membership。修改执行图，或修改 planner、scheduler、executor、resource coordination、Candidate entry 与实际执行基础时仍进入 Full。

`verification.yml`、`package.json` 和 lockfile 由 Git diff 的语义分类器处理：纯展示字段、`proves`/说明条件或 version-only 变化走 affected；command、environment、scripts、engines、dependency 等执行语义变化仍进入 Full。`test/verification/timing/**` 的预算、证据与报告维护走对应 affected owner；只有 parallel runner 等调度/执行语义进入 Full。

任一 unknown path 或 direct production owner gap 都会在 admission 和业务 verifier 启动前返回 `status=blocked`、`verification-owner-gap`、完整 gap 列表与补 owner 的 next action。完整 Candidate 不再作为 unknown ownership 的替代证明。

Changed Full 与 Candidate 计划会在执行前输出 step 数、目标工作量、全局容量下限、依赖关键路径、资源容量下限与 `minimumFeasibleDurationMs`。声明总预算低于任何理论下限，或 executable step 缺少 target budget 时，runner fail closed。当前 66-step combined Candidate 的过渡总预算为 600 秒；这是对尚未拆分 Core/Release-heavy 集合的诚实准入值，不代表性能目标已经达成。后续 Contribution 仍以核心 Full 约 180 秒为目标，并把发布重型 Journey 移到 Parent 最终集成、Release 或 CI lane。

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

Task Verification 不登记内部 executable step，也不为用户设计测试。`verification.yml` 只暴露 7 个稳定能力接口：

| capability | 调用与证明范围 | 交付要求 |
| --- | --- | ---: |
| `product.fast` | `npm run test:fast`；低成本开发反馈 | 否 |
| `product.delivery` | `test:changed -- --base origin/dev`；同一 plan 的 affected 或必要 full | 是 |
| `product.full-regression` | `npm run test:candidate`；Candidate profile 的全部 required owners | 否 |
| `product.browser-smoke` | Buildr Web paths 适用时运行真实浏览器 Journey | 适用时是 |
| `product.archive-lifecycle` | Change active/archive 与 Task Development/Finish authority 顺序 | 否 |
| `product.openspec-convergence-journey` | OpenSpec 写入、恢复、归档与并发收敛 Journey | 否 |
| `product.release-artifact-set` | 显式发布准备时核验冻结 payload、npm tarball、Host Node、Launcher 与发布物 readback 边界；普通交付不自动执行 | 否 |

Agent 的正式验证流程是：

```text
Task scope + changed paths + implementation risk
        ↓ 开发期 Quick / changed / focus
Development 稳定 Content Target 并固定 verification policy
        ↓ 执行适用 capability，保存 transient evidence
记录一个绑定 Content Target 与 declaration identities 的 current Result
        ↓ Verification facts 完整后冻结 Task Candidate
```

GitHub hosted验证只承担独立边界：PR到`dev`运行双平台changed/affected Development feedback；`release-<version> → main`受保护PR和手工dispatch运行绑定current release HEAD/tree的完整Candidate；tag workflow验证并发布同一冻结制品。Formal Finish和self-bootstrap successor直接推送`dev`不自动启动`Verify Buildr`：source commit复用current Task Verification与Finish remote readback，successor复用self-bootstrap runner的精确delta、push readback、development identity与最终Doctor。平台高风险修改需要进入`dev`前的hosted Windows evidence时使用PR到`dev`，不把每次正式交付重新变成GitHub验证。

GitHub Candidate不是第二套测试registry，而是同一Candidate profile的闭合分布式投影：低成本`candidate-preflight`先短路；`candidate-artifact`只构建一次tarball；macOS core、Windows runtime/Launcher、Windows Workspace/Task、Windows fresh build和四个Host Node tuple并行；`Candidate gate`聚合全部closed evidence并作为`main`唯一稳定required context。每个shard evidence绑定source SHA、registry identity、适用artifact identity、primary steps、内部阶段timing和workflow attempt。同一SHA只重跑失败job时，新attempt以相同逻辑artifact名覆盖旧evidence并重跑aggregate；新SHA不复用旧结果。

冻结 source SHA `c2a76cde2d39566a2e665dcc7c2a1291c65a89b9` 的三轮 GitHub Candidate（runs `31719158091`、`31719762961`、`31720456534`）全部通过。总墙钟为 394s、468s、441s，中位 441s、范围 74s；runner 总量为 1136s、1156s、1181s，中位 1156s、范围 45s；最长 Windows Workspace/Task shard 为 288s、360s、331s，中位 331s、范围 72s。对照旧拓扑三轮绿色 run 的总墙钟 695s、931s、780s（中位 780s），新拓扑中位下降约 43.5%；runner 总量从旧中位 1274s 降到 1156s，下降约 9.3%。一次真实 runtime shard 失败后仅重跑 failed job 与 aggregate，恢复墙钟 159s、runner 154s，已成功的 artifact、core、Workspace、fresh build 与 Host Node jobs 没有重新执行。`main` branch protection 已在新 gate 绿色回读后保持 `strict: true`，从旧四个 contexts 迁移为唯一 `Candidate gate`（GitHub Actions app id `15368`）。

本地完整 Candidate 在最终实现树上 46/46 通过，墙钟 189.157s，超过 120s 观察预算。该超限同时说明两件事：120s 是 38-step 历史候选形成的优化目标，已不再是当前 46-step 完整集合的现实预期上界；但当前测试本体也仍有可优化热点，不能只提高预算。最慢 owner 是 System Workspace lifecycle 73.852s、System Task Finish 49.260s、technical boundary integration 40.580s、System runtime recovery 37.817s 和 concurrent task acceptance 30.997s。120s 保持 nonblocking optimization warning；GitHub 发布门禁另以总墙钟、最长 shard、runner minutes 与失败重跑成本评估，后续优先优化 Workspace/Task 长尾后再用新基线校准预算。

Project `verification.yml`仍只声明可由Task Verification选择的稳定本地capability。GitHub job/shard是仓库候选运行策略，不新增Project capability，也不把CI内部job写入portable Task Verification Result。

完整 stdout/stderr、临时路径、环境启动和 timing 属于 transient Execution Evidence；Workspace-local current Result 只保留 Content Target、声明、实际能力事实、coverage gap 和整体结论。target 或 declaration 变化后 Result 派生为 stale。Task Development 与 Buildr Web 复用同一个 Result reader；Task Finish 不读取或发起 Verification。

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
| System 缺少文件级诊断、generic journey 重复稳定上下文 | `dot reporter` 只能看到总时长；首次 25 文件诊断中 `task-development-generic-journey` 并发耗时 39.69s，隔离耗时 24.08s。逐阶段确认主要成本是不变 Task Record、declaration、Environment 与 Content Target 被各 lifecycle action 重复准备和 canonical 校验 | System 保留 `dot` 输出，并通过第二 reporter 将 25 个 file completion 按 worker duration 排序写入 stderr transient diagnostics，不进入 current Result。generic journey 复用不可变任务上下文，Review/Verification/Development 持久化仍真实执行；隔离耗时降至 7.87s，完整 System 中该文件降至 17.04s，System 114/114 墙钟约从 51.3s 降至 43.8s |
| Task Development 专项重复读取不变 Task Record | Full 中该 owner 为 85.89s；共享 `init + project create` 只值约 2.82s。单变量对照中只缓存 declaration 仍为 61.78s，只固定 Task Record persistence 为 23.68s | 每个 case 仍独立创建 Workspace/Task，只在 Task 不发生修改的 fixture 生命周期内复用一次真实 Task Record persistence；Content Target、declaration、Review、Verification、Development receipt 继续逐次真实读取。两项隔离 Journey 为 23.68s，最终 Full 中为 35.30s，下降约 59%；Candidate 为 151.31s，关键路径转移到 79.17s 的 System 与后续饱和队列 |
| System 重复 canonical 校验、跨模块 fixture 冷启动与裸 PID cleanup | 最新两轮 Candidate 的 System 为 79.17s / 96.67s；前三热点稳定包含 `worktree-create`、Task Record/Change Resolver 与 `workspace-product`。命令级诊断确认 `git worktree` 本身通常只需 0.2–0.7s，主要成本是 Environment lifecycle、Task repository 嵌套重复 Workspace/Git 身份校验，以及 Application-only case 反复冷启动 `init` CLI。优化树的前两次 Full 又稳定复现 System 启动约 6 秒后收到外部 `SIGTERM`，而同一五 owner focus 全绿，最终定位到 launcher fixture 对无 owner identity 的裸 PID 发信号 | Task Record repository 改为每个公共操作只校验一次 canonical 边界，内部 helper 复用已解析 root；Worktree System 只用 Task Application 准备/结束记录，并删除第二份 Environment inspect，真实 Worktree/Environment CLI 与共享占用恢复仍保留；Workspace System 仅在 `init` CLI owner 使用真实冷启动，其余 case 用 Application 准备隔离 fixture；launcher fixture 改为 1 秒有界自然退出，不再向可能复用的 PID 发送 `SIGTERM`。隔离结果分别为 `worktree-create` 33.85s→23.92s、`task-record-product` 17.31s→7.67s、Change Resolver 14.13s→6.26s、`workspace-product` 30.17s→20.63s。registry 缓存和 Public JSON Application init 实验无稳定收益，均已回退 |
| Public JSON 重复准备完整 Workspace/runtime | 隔离 10.86s；5 个场景分别重复 `init`，Codex/managed runtime 又重复 `sync + Doctor`。把 Doctor 改成同步 Application 调用会破坏现有异步并行，11.76s，无收益 | suite 只准备一次 `plain → codex → codex+claude` 不可变基线；runtime 用与 sync 相同的 Product Skill 投射，但不在 fixture setup 重跑 sync 的最终 Doctor。每个 case 复制独立目录，全部 JSON/Doctor 仍走真实 CLI。隔离 7/7、6.75s，下降约 38%；普通 `render` 缺少 Product Skill 会产生真实 warning，已否定 |
| Full 与 affected 重复启动 registry runner | 同一目标中 affected 仅选 `system/docs-quality`，两者已全部包含于 38-step Full；Task Verification 默认并发执行两个无资源 claim 的 capability。Full 单独为 148.208s，与 affected 并发时为 193.622s，放大 45.414s（约 31%） | Candidate 与 changed owner 分离：`test:candidate` 只执行 Candidate profile；changed owner 由 `product.delivery` 的 `test:changed -- --base origin/dev` 独立负责。显式 Full 交付只选择 `product.full-regression`，不扩展 Verification schema 或建设跨 capability cache |

本轮 Candidate 耗时优化任务将选择边界与执行成本分开：`test:candidate` 只接受 `candidate` profile，不读取 Git diff，也不接受 `--base`；changed-path owner 继续由 `test:changed -- --base origin/dev` 的 `product.delivery` 负责。System 热点同时做了两处测试机制去重：`buildr-web-launcher` 在同一文件内缓存相同平台/通道的只读 bundle，并在文件结束统一清理；`package-capability-retirement` 只通过真实 CLI 初始化一次不可变 Workspace 基线，各用例复制到独立临时根后再执行迁移 mutation。

同一优化 Task worktree 修复契约漂移后的完整 Candidate timing 为 `116.826s`，预算 `120s` 内；System 为 `70.992s`，比本轮改造前的 `88.094s` 降低约 19.4%，相对此前 `170.862s` 基线降低约 31.6%。Candidate 38 steps 全部通过，正式串行执行的 `product.fast`、`product.delivery`、`product.full-regression` 也全部通过；正式 Result 为 passed。

P0.5 合入前、最终文档冻结时的干净候选上，Quick 为 6.4 秒，38-step Changed 为 148.543 秒，37-step Candidate 为 147.819 秒且全部通过；同一优化树另有 132.741 秒和 143.323 秒全绿结果。相对 193.161 秒基线，墙钟下降约 23%–31%。rebase P0.5 后先复测当前 System 为 115/115、67.50 秒；正式 delivery timing 以本次稳定 Content Target 的 transient summary 为准。120 秒仍只是未达成的观察目标，不应通过调高预算或删必要风险证据宣告成功。

### 领域 owner 拆分与预算校准（2026-08-15）

本轮目标是缩短日常 affected 反馈，不改变 Candidate 的事实并集。拆分前普通 Integration 聚合约 25.9 秒；拆分后 general 两次成功采样为 4.073/5.000 秒，中位 4.537 秒、范围 0.927 秒。代表领域 owner 的两轮成功采样如下；完整两轮 owner union 均通过且文件无遗漏、无交集。

| owner | 两轮秒数 | 中位 / 范围 | 适用场景 |
| --- | --- | --- | --- |
| `integration-declarations` | 0.203 / 0.223 | 0.213 / 0.020 | Doctor、Project verification declaration 与 package verification registry |
| `integration-openspec` | 1.048 / 1.246 | 1.147 / 0.198 | Change/OpenSpec Application 与 convergence |
| `integration-verification` | 4.443 / 5.301 | 4.872 / 0.858 | planner、runner、evidence、resource coordinator |
| `integration-runtime` | 3.395 / 4.024 | 3.710 / 0.629 | runtime、Buildr Web、Preview 与 Web dist |
| `integration-task-environment` | 9.163 / 10.436 | 9.800 / 1.273 | Task Environment plan/controller/repository |
| `integration-self-bootstrap` | 29.981 / 36.060 | 33.021 / 6.079 | self-bootstrap closeout；普通产品源码不陪跑 |
| `integration-task-finish-delivery` | 35.151 / 35.516 | 35.334 / 0.365 | Finish remote、retained activation/cleanup、Contribution |
| `system-public-json-contracts` | 19.272 / 20.299 | 19.786 / 1.027 | 公共 JSON closed contract |
| `system-workspace-lifecycle` | 44.724 / 44.750 | 44.737 / 0.026 | Project/Service/catalog 生命周期 |
| `system-task-lifecycle` | 15.649 / 15.778 | 15.714 / 0.129 | Task/Review/Verification/Development Journey |
| `system-worktree-lifecycle` | 24.784 / 24.846 | 24.815 / 0.062 | Git-backed Worktree/Environment Journey |
| `system-task-finish` / `system-task-finish-cli` | 46.066/46.616；7.434/7.548 | 46.341/0.550；7.491/0.114 | Product Journey 与 CLI contract 分开选择 |

任务二的 13 条 budget warning 是本轮校准输入，不是统一放宽预算的理由。结构性长组被拆分；仍代表完整生命周期的 owner 按本轮成功 focus 留出有限波动余量：

| 原 warning | 处置 |
| --- | --- |
| Integration 41.493s | general 拆为 4 个文件，预算 10s；领域 owner 各自独立预算 |
| Task Finish Integration 25.098s | core 预算 20s，delivery Journey 预算 45s |
| Workspace System 75.853s | Project/Service 55s、Task lifecycle 25s、Worktree 45s |
| Task Finish System 62.806s | Product Journey 60s、CLI Journey 15s |
| coordination 5.653s、execution record 16.601s | 保持独立 owner，预算分别校准为 8s、20s |
| acceptance 32.459s | 保留唯一双 Task 组合事实，预算 40s |
| capability CLI 29.372s、commands CLI 11.927s | 保留真实 CLI 边界，预算 35s、15s |
| package workspace 6.822s | 保留 package 安装事实，预算 10s |
| runtime parity 32.008s、CLI parity 15.076s、release smoke 19.246s | 保留 Candidate/Release 独立事实，预算 40s、20s、25s |

代表 affected 计划显示选择更精确：声明约 79s→67s，OpenSpec 125s→96s，Runtime 174s→171s，Task Environment 275s→245s；这里的静态调度成本包含 Quick、canary 与其他真实 owner，不能等同墙钟。数据存储、Worktree、Task Finish、Public JSON 的估计可能持平或上升，因为补上了此前漏选或低估的直接 owner；这属于准确性修正。日常收益应以实际领域文件执行时间判断，而 Candidate 仍聚合全部 64 个主步骤。

## 8. 下一轮优化方案

1. 先观察新 owner 在真实日常 Task 中的 selected set、墙钟与 warning 分布；没有新的重复事实前，不继续机械拆文件。
2. `system-workspace-lifecycle`、`system-task-finish`、`integration-self-bootstrap` 与 Public JSON 仍是独立长尾；只有确认其内部重复 setup 时再优化，不能删除唯一 Journey 或以 fake 替代真实 Workspace/Git/CLI 边界。
3. Browser、性能/压力、安全等扩展测试等到真实需求出现后再设计；Component 层随真实边界补齐，不为层次数量制造测试。

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
| 14. 审计测试残留进程 | 清理 3 个旧 Buildr Web Preview 和 2 个 detached fixture 进程；其 worktree/临时目标均已不存在。当前双 Preview Journey 与 runner descendant cleanup 聚焦测试通过且未产生新残留，因此结论是历史环境污染，不追加当前产品修复或全局进程名清理机制 |
| 15. 收敛 Worktree System Journey | 隔离基线 7 条串行 Journey 为 44.90s，其中三条 Task Environment Journey 占主要成本。共享占用/释放合并为一条公共 Journey，placement mismatch 下沉到 Application Integration，真实 Git create/cleanup 与公共 CLI 仍保留；公共 CLI 操作约从 39 次降到 30 次。背靠背候选为 6/6、30.41s，墙钟约降 32%，user+sys 从 43.15s 降到 30.28s；并发负载下的漂移结果未计入收益 |
| 16. 增加 System 文件诊断并复用稳定任务上下文 | 双 reporter 从 Node file completion 提取 25 个真实 worker duration，摘要只进入 stderr transient diagnostics。首轮数据定位到 generic Task Development Journey；复用不变 Task Record、declaration、Environment 与 Content Target，保留可变 Result/Receipt 的真实持久化。该文件隔离 24.08s→7.87s，完整 System 中 39.69s→17.04s；System 114/114 墙钟约 51.3s→43.8s |
| 17. 优化 Task Development 生命周期集成 | 放弃收益约 3% 的跨 case 共享初始化，改为 case 内复用一次真实且不变的 Task Record persistence。单变量对照：只缓存 declaration 为 61.78s，只固定 Task Record 为 23.68s；因此不缓存 declaration，保留其真实适用性读取。隔离为 23.68s；Full 中从 85.89s 降至 35.30s，37/37 全绿，Candidate 151.31s。总墙钟只下降约 8.2s 是因为关键路径已转移，不代表该 owner 的约 50.6s 降幅失效 |
| 18. 优化 System 热点 | 命令级诊断否定“`git worktree add` 是主因”，并证明 Task repository 嵌套 canonical 校验才是 Task Record/Resolver 的共同放大器。实现改为一次边界校验；Worktree/Workspace fixture 只保留各自公共 owner。四个隔离热点约下降 29%–56%。14 路直接 System 总墙钟比 8 路快约 4 秒，8 路仍用于 Candidate 外层资源共享，因此并发预算不变；无收益的 registry cache 与 Public JSON setup 实验均回退。两次 Full 中 System 均在约 6 秒收到 `SIGTERM`，最小五 owner focus 全绿后确认是 launcher test 的裸 PID cleanup；改为有界自然退出，消除跨 step 误杀而不削弱非等待事实 |
| 19. 复用 Public JSON 分层上下文 | 单次 Doctor 约 0.69s，主要成本并非异常扫描，而是 5 次 Workspace 初始化和重复 runtime sync/Doctor。同步 Application 实验破坏异步并行并回退；最终只共享 `plain/codex/managed` 不可变基线，case 仍独立复制且全部公共命令保持真实 CLI。隔离 10.86s→6.75s，下降约 38% |
| 20. 合并 Full 与 affected 执行计划 | 代码、plan 与实测共同确认两个 capability 会并发启动重叠 runner：独立 Full 148.208s，并发 Full 193.622s。复用既有 planner 的 profile/path union，Candidate `--base` 输出 38 个唯一 owner，`system` 与 `docs-quality` 各一次；最终联合 Full 154.633s、全部通过。显式 Full 通过单一 capability 同时证明 changed owner coverage 与完整回归 |
| 21. Candidate 与 changed owner 解耦 | Candidate 的 `--base` 会把 broad changed-path owner（例如 repository onboarding）带入普通 Candidate，破坏 profile 选择边界；本轮移除 Candidate 的 Git diff、preflight 和 `--base`，Full regression 只调用 `npm run test:candidate`，changed owner 仍由 delivery capability 负责 |
| 22. 去重 System fixture 准备 | `buildr-web-launcher` 重复构建相同 launcher bundle，`package-capability-retirement` 重复 CLI 初始化相同 Workspace；分别改为文件内 bundle cache 与不可变基线复制。两个热点单文件均通过，完整 Candidate timing 从 126.295s 降到 118.890s，首次进入 120s 目标以内 |
| 23. 对齐 Buildr Web read-worker 契约 | Buildr Web 三个只读 Tab 已由 `submitTaskRead` 派发至 `read-worker`，旧 contract/static verifier 仍要求 server 直接出现 `runtime.inspectTaskReviewView/inspectTaskVerification`，导致 Candidate 非代码失败；契约改为检查实际 operation dispatch 与 worker mapping，不恢复 terminal 聚合投影。修复后 Contract、package-static 与 38-step Candidate 全部通过 |
| 24. 对齐 development onboarding 与 npm CLI 隔离 | Windows旧owner在约102.917s准备后才因POSIX `install-buildr-cli` 返回`ENOENT`。实现删除PATH installer lifecycle，以显式Project bridge、双sentinel和共享Git object candidate snapshot保留clean checkout/sync/Launcher/Doctor证据；三次本地成功focus为15.507s、15.659s、15.572s，中位数15.572s、范围0.152s，完整changed资源竞争下为22.115s且185.121s DAG全绿。archive后两次hosted Windows source SHA均执行通过，onboarding实际为45.452s与63.162s，完整plan为769.226s与630.575s；这证明测试本体优化后仍存在真实跨平台与runner波动，25s/20s只按macOS标定不合理，60s也无法覆盖第二个真实样本，因此非阻断target校准为90s、调度成本60s。Candidate jobs在这些PR run中均skipped，完整Candidate仍只属于后续dev到main候选门禁。 |
| 25. 拆分重型领域 owner | 66 个 Integration 文件收敛为 14 个领域 slice、4 个 general 文件和 2 个外部 owner；28 个 System 文件拆为 13 个 owner。两轮 focused union 全绿，general 中位约 4.54s；13 条历史 warning 分别通过结构拆分或生命周期预算校准处置，Candidate 文件并集与 CI phase/artifact/gate/platform 拓扑不变。 |
