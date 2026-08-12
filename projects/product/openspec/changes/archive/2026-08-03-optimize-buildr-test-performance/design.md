## Context

冻结 `dev` 基线的 Full 回归为 193.161 秒。外层 DAG 全局并发为 4，但历史 `integration-fast` 会再启动多路 `node:test` worker，OpenSpec runner 还会按 case 并发，其他 step 也各自启动多个 CLI/Git 子进程，真实并发远高于 4。独立运行表明：legacy System 65.5 秒、capability CLI 13.0 秒、runtime parity 约 29 秒、双 Task acceptance 68.9 秒；它们在 Candidate 中分别膨胀为 95.5、45.2、40.6、82.3 秒。

同时存在两类可删除工作：两个 OpenSpec step 实际都执行完整 15-case runner；CLI package parity 又用 checkout 与 tarball 各跑 Task/Review/Verification 和双 Environment，重复其他 primary owner。Product Project retained tree 还会合法保留受管 `CLAUDE.md` bridge，但 source-layout verifier 把它视为未知源码。

Candidate timing timeline 还显示，`openspec-convergence-recovery`、`runtime-adapter-parity`、`concurrent-task-acceptance` 与 builtin recovery 共用容量为 1 的 `workspace-saturating` 资源。四者使用不同临时目录，却被强制串行；其 48.1、40.6、82.3、22.1 秒几乎直接组成 193.2 秒关键路径。当前 profile 还出现本地/普通 CI 容量 1、名为 `ci-workspace-limited` 的受限 profile 容量反为 2 的配置倒置。

## Goals / Non-Goals

**Goals:**

- 让测试名称、执行边界、环境成本和 primary owner 一致。
- 删除重复 evidence，减少环境准备和清理次数，并保留每项主要风险的唯一证据。
- 让双 Task acceptance 测试真正覆盖并发准备，并输出可定位阶段成本。
- 以同一冻结候选的 Full timing 对比优化前后，不用调高预算掩盖问题。
- 在自举文档中完整记录当前测试、环境依赖和并发边界。

**Non-Goals:**

- 不增加 Task Verification schema、Result 字段或新 capability。
- 不建设通用权重 scheduler、fixture 服务、daemon、容器平台或测试历史数据库。
- 不删除 concurrent Task、runtime adapter、release tarball、recovery 等独立风险证据。
- 不以一次机器计时建立强制性能门禁；预算继续作为非阻断观察值。

## Decisions

### 1. 用 `system` 替代历史 `integration-fast`

22 个历史文件实际穿过完整 CLI、Git、Workspace、Local App 或 Task 生命周期，统一迁移到 `test/system`，入口改为 `test:system`，registry step 改为 `system`。不保留 `test:integration:fast` alias，因为 alias 会继续把 60 秒以上 System 套件误导为 Quick/Integration authority。

备选是只改展示名称。它会保留规范冲突，因此不采用。迁移后再按真实 I/O 型负载校准 `node:test` 文件并发：4 路为 71.9 秒、默认约 10 路为 65.5 秒、14 路为 50.0 秒、16 路为 50.2 秒、22 路回升到 52.2 秒，所以首版显式使用压力更低且略快的 14 路。高并发还暴露出资源协调 fixture 在文件刚出现时读取半写 JSON 的竞态；测试改为等待完整 JSON，产品资源协议不变。Candidate 的 System 改用窄 `system.mjs` runner，显式报告文件数、exit code 与 signal；此前经 npm 聚合偶发出现的“7 秒退出且没有 TAP/stderr”不再成为不可定位失败。

曾尝试把 `task-record-product` 与 `worktree-create` 再拆成四个文件，以缩短文件内同步 CLI 串行链；目标子集并行通过，但完整 System 从 50.2 秒升到约 55 秒、总 CPU 增加约 9%，原因是重复 baseline 初始化。因此回退该实验，不为文件数好看保留负优化。

### 2. OpenSpec fixtures 按 case 唯一分区

同一 runner 增加 `contract`、`recovery`、`all` 三种 suite：Candidate 的两个 step 分别调用互斥的 `contract` 与 `recovery` 集合；显式本地诊断仍可用 `all`。每个 suite 可以独立准备隔离基线，但同一 named case 在一个 Candidate 中只执行一次。

不引入跨进程共享 fixture cache：当前重复准备只有数秒，缓存 ownership、失效和 cleanup 协议的复杂度高于收益。

### 3. Package parity 只持有代表性一致性

保留同一 tarball 安装、代表 help/JSON/失败输出比较，以及一次 checkout/package `init` mutation 后的归一化树比较。删除 Task Record、Review Result、Verification Result、双 Task Environment 和资源协调矩阵；它们分别由 source lifecycle tests 与 `concurrent-task-acceptance` 持有。安装后 `sync/doctor/uninstall` 继续只由 release tarball smoke 持有。

### 4. 双 Task acceptance 并发准备并记录阶段耗时

先创建两个 Task Record，再并发调用两个独立 `task environment prepare`。后续 verification、Result record 和 preview 继续并发；两个 Result 必须具有不同 path/digest 且 applicability 为 current。`record` 已返回唯一 Application read model，因此不再重复执行两个 `task verification inspect`；inspect 的完整协议由 `task-verification-product` System owner 持有。

删除重复的 Task-scoped Change Resolver 三态 Journey；它已经由 `task-record-product` System owner 完整持有，且不属于并发验收 canonical 要求。Preview 错误 owner 和动态登记失败各保留一个方向；active cleanup authorization guard 已由 System/Integration owner 持有，不在 acceptance 再跑。Task invocation、Preview stop 与 Task abandon 对两个独立 Task 并发，Environment cleanup 保持顺序，以继续证明清理一个 Task 不影响另一个。独立实测从带 Result 的 42.7 秒降到 33.4 秒；其中 prepare 3.7 秒、Result 4.2 秒、preview 7.5 秒、cleanup 10.8 秒，证明环境清理是重要成本但不是 Full 的唯一根因。

### 5. 校准隔离重型 verifier 的有界并发

本地与普通 CI 的 `workspace-saturating` 容量从 1 校准为 2；`ci-workspace-limited` 保持单路。资源标签继续表达进程与文件系统压力，而不是共享状态锁；System 套件与其他使用独立 temp root 的重型 verifier 受该上限约束。System 的调度成本按独立约 65 秒校准，实际 9.5 秒的 `runtime-reconciliation` 从错误的 5 秒尾部估算修正为 10 秒。

把 concurrent acceptance 从 20 秒改为 55 秒、与 System 同时启动的对照实验使 acceptance 膨胀到 89.7 秒，Full 仅从 138.323 秒降到 137.732 秒，因此撤回。把 capability CLI 也纳入饱和资源上限时，自身恢复到 12.9 秒，但 Full 上升到 138.968 秒，等待链只是转移给 OpenSpec recovery；同样撤回。Result-aware Full 曾在 132.741 秒和 143.323 秒全绿；最终文档冻结前的干净候选 Quick 为 6.4 秒，38-step Changed 为 148.543 秒，37-step Candidate 为 147.819 秒且全部通过。System 会从独立 50.2 秒膨胀到 71.5–93.8 秒，OpenSpec recovery 从独立 23.9 秒膨胀到 35.6–44.1 秒。这证明两路外层 capacity 明显优于基线单路长串行，但当前嵌套 fan-out 仍不能可靠满足 120 秒观察预算。首版保留两路与受限单路 profile，并把“inner fan-out contract”列为下一轮问题，不扩大为通用权重 scheduler。

### 6. Source layout 接受受管 runtime bridge

`CLAUDE.md` 是 canonical runtime spec 要求的同目录投影，不是 Product 源码 owner。source-layout allowlist 明确接受它，同时继续拒绝未知 root entry、旧 package root 和实现目录漂移。

### 7. CLI help 分离穷举契约与真实进程边界

原 `cli-compatibility` 对 55 个 topic 分别运行 `<topic> --help` 和 `help <topic>`，约 109 次完整 CLI 冷启动，Candidate 中耗时约 18.6 秒。现在仍由同一 primary owner 穷举全部 55 个 topic，但路由与 Usage 内容直接调用 help component；真实 CLI 只保留 root、init、App Preview、Task Environment、Task Verification、Task Finish 和 runtime-dependent Rules 七类代表入口，并继续验证两种 help form、stdout、exit 和临时 cwd 零写入。独立耗时降到 7.3 秒，没有删除任何公开 topic。

## Risks / Trade-offs

- [Risk] 删除旧脚本名影响维护者本地习惯 → 同步 package contract、registry、文档和所有引用；`test:changed`/`test:candidate` 仍是主要入口。
- [Risk] 收窄 package parity 漏掉 packaged lifecycle 回归 → release tarball smoke 保留真实安装后生命周期，package static/open-source gate 保留 inventory，parity 仍比较代表输出和 mutation。
- [Risk] 并发 Environment prepare 暴露 Git lock 竞态 → 这正是双 Task acceptance 应验证的产品事实；失败时保留明确诊断，不回退为静默串行。
- [Risk] 两个重型 verifier 同时运行造成 CPU/磁盘争用 → 上限只从 1 调为 2，并保留单路受限 profile；用 Full timeline 与独立基线比较实际膨胀。
- [Risk] 同进程 help contract 漏掉 CLI dispatch 边界 → 七类代表 topic 继续经过真实 `bin/buildr.mjs`，未知输入、version/JSON 与 Workspace mutation 也仍是真实进程。
- [Risk] 单次 Full 计时受机器负载影响 → 同时报告逐 step 和独立基线，不仅比较总时间；不以单次超预算作为正确性失败。
- [Trade-off] legacy System 仍是较大套件 → 第一版只修正名称、重复 owner 和最明显环境成本；若最终仍主导关键路径，再按领域 owner 拆分，而不是先增加调度平台。
