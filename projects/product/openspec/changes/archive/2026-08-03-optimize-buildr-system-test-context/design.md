## Context

上一轮已把完整 CLI、Workspace 与生命周期测试从 Quick 移到 System，并证明机械拆分文件会因重复 baseline 使总 CPU 增加约 9%。当前 `task-record-product` 已在单文件内复用一次基线，但 `task-review-product`、`task-verification-product` 和 `verification-run-cli` 仍为每个 case 重跑 `buildr init` 与 `project create`；四个文件合计有 24 次基线 CLI，完整 System 本机基线为 56.64 秒。

这些测试验证的是 Task/Verification 公共行为，不是 Workspace 初始化本身。可以复用初始化结果，但 Node test runner 会让不同文件运行在独立 worker，且 14 路文件并发要求任何共享状态都不能成为可写 Workspace。

## Goals / Non-Goals

**Goals:**

- 同一 `test:system` invocation 只准备一次首批测试所需的 Task 生命周期基线。
- 每个 test case 继续获得独立可写目录，支持并发且不泄漏状态。
- 单文件直接运行保持自足，失败和清理可定位。
- 用准备次数、墙钟和现有行为测试证明收益与正确性，再决定是否扩展。

**Non-Goals:**

- 不建设跨 invocation 持久缓存、daemon、fixture 服务、通用调度器或资源平台。
- 不共享可写 Workspace，不在 test case 之间回滚同一个目录。
- 不把验证 `init`、Project/Service 创建、Git/Task Environment、安装、迁移或 Task Finish 全生命周期的测试迁入共享上下文。
- 不修改测试分类、registry step、`verification.yml` 或 Task Verification Result。

## Decisions

### 1. 采用 run-scoped Task lifecycle context

`test/verification/system.mjs` 在启动 `node --test` 前，通过一个专用 helper 建立 `task-lifecycle/v1` 基线，并用环境变量把明确的 context root 交给所有 worker。基线只包含首批消费者共同需要且不是其被测目标的事实：已初始化 Workspace、`demo`/`other` Project、`demo/api` Service 和少量 OpenSpec fixture。helper 直接调用既有 Application 完成这 4 项 fixture 操作，不为非被测前置启动公共 CLI；真实 CLI 边界仍由各 System owner 的代表命令证明。

首版不预建 Git repository。当前迁移对象的共同昂贵前置并不需要 Git；需要真实 Git、worktree 或 remote 的测试继续自行准备。这样按真实使用保留最小 context，而不是为了模仿 Spring 预建未使用环境。

备选方案是每个文件各自缓存。它能减少同文件重复，但跨 worker 仍重复准备。跨 invocation 持久缓存则需要失效、并发 owner 和异常清理协议，首版收益不足，因此都不采用。

### 2. 基线不可写，每个 case 复制独立 sandbox

helper 为基线生成固定 schema marker 和内容 identity。每次 fixture 创建前先校验 marker、路径边界与 identity，再把 Workspace 复制到新的临时目录；test case 只收到副本路径。副本由 `t.after` 精确清理，suite 在 child runner 结束后清理基线，并再次校验基线没有被修改。

不使用一个共享可写 Workspace 加 reset/rollback。Buildr 测试会写 `.buildr`、Project assets、Local App state 和 Git metadata，文件系统 rollback 无法像数据库事务一样完整证明隔离；复制小型不可变基线更简单且并发安全。

### 3. suite owner 与单文件 fallback 使用同一 helper

完整 System 由 runner 创建唯一共享 context。直接执行迁移后的单个 test file 时，helper 在该 worker 内惰性创建一次等价 context，并在进程结束前清理；显式提供但损坏、越界或 identity 不匹配的 suite context 必须报错，不得静默重建后掩盖 runner 缺陷。

测试文件不直接理解 marker 或环境变量，只调用 `copyTaskLifecycleWorkspace(t, name)`。这让 context authority 保持单一，同时不把它扩展成用户侧测试框架。

### 4. 首批迁移四类消费者，并只拆分最大串行 owner

迁移 `task-record-product`、`task-review-product`、`task-verification-product` 与 `verification-run-cli`。前后三者覆盖正式 Task 生命周期 authority，后者有五个相同 Workspace/Project fixture，都是高重复且不以初始化为被测事实的消费者。

复用本身只减少总 CPU；原初始化可以在 worker 内与其他文件重叠，把 setup 前移到 runner 后第一次完整 System 从 56.64 秒变为 62.53 秒。真正的关键路径是单文件串行的 `task-record-product`。在共享基线下，将其按持久化/CLI、Change Resolver、Local App/target boundary 拆为三个文件的无写入实验为 18.344 秒，三组全部通过；因此本 Change 只增加这一次有证据的 owner 拆分。上轮拆分负优化的根因是每个 worker 重建 baseline，本设计已消除该条件。

`workspace-product`、`project-product`、`service-product`、`public-json-contracts`、`task-environment-migration`、`worktree-create`、安装与 Task Finish Journey 保持现状。后续只有在实测显示 setup 次数和墙钟明显下降、并且 owner/隔离边界相同时才扩展。

### 5. 性能证据是观察值，不是新门禁

runner 输出 context setup duration、Application 操作数和 cleanup 状态；迁移前后在同一 checkout、同一并发参数下比较完整 System 墙钟与 CPU。首版不设置硬性秒数阈值，因为机器负载会波动；正确性仍由现有 System 行为、静态边界契约和基线 identity/cleanup 检查门禁。

### 6. System 只保留代表 CLI 边界，状态矩阵复用既有 Application owner

Task Review 与 Task Verification 的双槽位/current Result、applicability、terminal、原子写入失败等矩阵已经由各自 Integration repository 完整证明；Task Record 的大部分失败矩阵也直接调用 Application。System 不再为同一事实重复启动完整 CLI：每个公共命令保留至少一个代表 JSON 成功/失败入口，Local App、Git ignore、canonical target 和 Change Resolver 仍由 System owner 持有；同一 Journey 内的其余状态转换直接复用 Application。

备选方案是继续把每个状态都走 CLI。它不会增加 dispatch 层的新证据，只放大 Node 启动和 Workspace probe 成本，因此不采用。不得删除某个命令唯一的参数解析、stdout/exit 或公共入口证据。

### 7. 只做 runner 内的粗粒度长 owner 前置

System 继续使用固定 14 路文件并发，但不再完全按文件名字母序启动。runner 先启动已实测形成尾部关键路径的 Task Environment、Task lifecycle、public JSON 等长 owner，其余文件保持确定性字母序；成功输出使用保留失败详情的 Node dot reporter，避免 112 条逐项成功日志成为额外开销。相同候选的受控 A/B 中，默认顺序约 56.5–56.8 秒，前置顺序两次为 53.32 和 54.01 秒。

这不是通用权重调度器：不记录机器相关动态耗时，不调整测试语义，不跨 verification step 调度，也不改变 14 路容量。名单只在完整 System A/B 证明收益时调整。

## Risks / Trade-offs

- [Risk] test case 意外写入基线并影响后续 worker → test 只接收副本；复制前和 suite cleanup 前校验基线 identity，发现污染即失败。
- [Risk] 复制 Workspace 自身变成新成本 → 基线保持轻量，不包含依赖目录或 Git repository；以完整 System 墙钟决定是否保留。
- [Risk] 单文件 fallback 与 suite 路径行为不一致 → 两者调用同一个 prepare/validate/copy helper，只改变 context owner。
- [Risk] 共享 context 扩张后掩盖初始化回归 → 只有初始化不是主要被测事实的文件可接入，边界由契约测试列出首批消费者与明确保留项。
- [Risk] Task Record 拆分增加 worker fan-out → 只拆一个已实测的最大串行 owner，继续受 `--test-concurrency=14` 限制；完整 System 没有正收益则整体回退。
- [Risk] CLI 收窄遗漏参数 wiring → 为 create/inspect/record 等公开 family 保留代表真实进程，并由 CLI compatibility 与 JSON schema registry 继续覆盖通用 dispatch/envelope。
- [Risk] 固定启动顺序随测试成本漂移 → 保持粗粒度短名单和字母序 fallback，只按完整 System A/B 证据调整，不引入动态调度状态。
- [Trade-off] runner 增加一次固定前置，即使只关心其他 System 文件也会执行 → `test:system` 固定包含首批消费者；单文件诊断不经过 runner，并只准备自身一次。

## Migration Plan

先落地 helper 与 runner owner，再逐个迁移四类消费者并运行直接文件测试；确认共享 baseline 后只拆 Task Record 最大串行 owner，随后运行完整 System 对比 56.64 秒基线。若隔离、清理或墙钟没有正收益，回退消费者、拆分与 runner 接入，不保留无收益框架。

## Open Questions

无。是否扩展到其他 fixture 由本轮实测后的独立任务决定。
