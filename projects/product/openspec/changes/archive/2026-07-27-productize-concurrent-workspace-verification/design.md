## Context

Buildr 当前有三层相关实现：`verification.yml` 与 task-verification contract 定义 Project 政策；`test/verification` 拥有成熟的 planner、DAG scheduler、executor 和跨 run resource coordinator；task environment、preview 与 Task Finish 提供任务隔离和收尾。它们尚未形成一个可安装的产品切片：普通 Workspace 没有正式执行入口，Task Finish formal-assurance 仍依赖 Agent provider，双任务验收 fixture 又遗漏了新要求的 `evidenceIdentity`。此外 preview stop 只凭实例 secret，worktree cleanup 也默认上游已停止未知进程，无法独立证明安全删除。

约束包括：Buildr 不负责调度 Agent 或 task；验证能力不得依赖 worktree，但有 task context 时必须严格绑定；npm package 只交付 `src/` 与明确资产；并发资源状态必须跨 task 可见且不能进入源码 checkout；公开 JSON 必须兼容演进。

## Goals / Non-Goals

**Goals:**

- 让任意 Buildr Workspace 能通过正式 CLI 执行 Project 声明的 affected/Candidate 验证。
- 复用并产品化已有 DAG、资源协调与 evidence 语义，消除 test-only 架构倒置。
- 完成 task-owned preview/process 从启动、停止到 worktree cleanup 的所有权闭环。
- 恢复 Candidate gate，并用普通 Workspace、双 task、npm tarball 证明能力可交付。

**Non-Goals:**

- 不创建、调度或协调 Agent 任务；调用方负责决定何时并发启动两个 task/run。
- 不把 Buildr Product 的 Candidate registry 当作所有项目的默认 policy。
- 不在本变更中引入远程分布式调度、云端 artifact store 或通用容器沙箱。
- 不改变既有 `verification.yml` 中未涉及并发/资源字段的兼容语义。

## Decisions

### 1. 建立 `src/application/verification` 正式产品切片

把通用 policy normalization、selector、planner、DAG scheduler、process executor、resource coordinator 和 evidence builder 放入 `src/`，由 compose runtime 注入文件系统、进程、时钟和 Git context。`test/verification` 中 Product 专用 registry、fixture 与 Candidate 组合脚本保留为测试消费者；通用模块改为调用生产实现。

选择该方案而不是把 `test/` 加入 npm package，因为测试目录具有 checkout-only 生命周期，公开命令依赖它会破坏 runtime inventory。也不复制两套实现，避免 Candidate 与普通 Workspace 语义继续漂移。

### 2. 公开入口采用 `buildr verification run`

命令以 Workspace root 为 `--target`，以 `--project` 解析 registry 和 `verification.yml`，以 `--level` 请求 affected 或 candidate；可选 environment receipt/context 将执行绑定到 canonical task environment。命令输出人类摘要或单一 `buildr.verification-run/v1` JSON，并允许调用方指定 caller-managed evidence 路径，否则使用有界 transient evidence。

选择独立 `verification` domain，因为 task-verification 能力明确不依赖 task environment；放入 `worktree` 会错误收窄适用范围，放入 `task finish` 会把执行入口与 consumer workflow 耦合。

### 3. Planner 只消费 Project policy，不猜测技术栈

执行器从登记 Project 的 `verification.yml` 构造规范化 DAG：先按 level、maturity、scope、environment、authorization 选能力，再校验依赖环和未知引用，最后应用显式 supersedes。Candidate 必须保留所有 required gate；affected 使用声明的 selector/context，无法确认政策时返回 incomplete。

Product Candidate registry 继续是 Buildr 自身 policy 的适配层，而不是全局默认。legacy policy discovery 仍由 task-verification provider 负责，但没有可机器执行声明时不会被 CLI 猜成命令。

### 4. 同 run 并行与跨 run lease 分层

DAG scheduler 负责单 run 内 readiness 与并行；resource coordinator 负责跨进程/跨 task 的 shared capacity。`isolated` 不共享状态，`namespaced` 从 environment/run identity 派生命名空间，`coordinated` 在 Git common-dir 的 Buildr runtime state 中取得 lease，`external` 只核对声明的外部就绪/授权，不冒充隔离。

Lease 使用原子创建/替换，记录 workspace、project、resource、task、environment、run、token、pid、heartbeat 和 expiry；释放必须精确匹配 token，过期接管保留审计事件。选择 Git common-dir 而非 checkout 内目录，使同一 repository 的 task worktree 共享协调事实，同时避免污染候选 tree。

### 5. Evidence identity 由规范化输入与候选共同决定

`evidenceIdentity` 对 schema major、Project policy fingerprint、level、environment binding、repository candidate set、plan 和最终检查状态做稳定摘要；summary 同时记录进程外单调 wall-clock、每个 worker 终态、资源事件与 cleanup lifecycle。worker 输出写入有界 diagnostics/reference，JSON stdout 只输出 envelope。

Task Finish provider 优先 inspect 现有 evidence；候选或 policy 未变化时复用，变化或 evidence 不完整时调用同一 production executor。这样修复 fixture 时不是伪造字段，而是让验收消费真实 evidence builder。

### 6. Runtime cleanup 使用共同 ownership registry

Preview 启动状态增加 task、environment、owner、receipt identity 和受管 pid。task preview stop 必须由 receipt-bound invocation 提供并匹配这些字段与 secret；retained standalone preview 保持实例级兼容。worktree cleanup 在任何 Git 删除前查询同一 runtime registry和验证 lease store：存活资源、归属不明或 token 不匹配即整体失败。

选择 cleanup preflight 而不是让 `worktree cleanup` 自动杀进程，因为自动终止会扩大命令副作用并掩盖 owner 错误。Task Finish 仍负责按顺序停止资源，worktree cleanup 作为最后一道独立门禁。

### 7. 分层验收以普通 Workspace 为权威外部消费者

单元测试覆盖 parser、DAG、lease、evidence identity 与 ownership matcher；集成测试覆盖 CLI、Task Finish provider、preview stop 和 cleanup preflight；双任务组合验收覆盖目标竞态和错误 owner；tarball E2E 在无开发 checkout 的普通 Workspace 中运行两个 task 的验证计划，证明发布闭包与并发语义。

## Risks / Trade-offs

- [将 test-only 模块迁入生产代码可能改变 Product Candidate 行为] → 先建立 characterization tests，再让旧测试入口薄适配生产模块，保持 registry 与 gate identity 不变。
- [跨进程 lease 遇到崩溃会残留] → 使用 heartbeat、expiry、pid/owner 诊断与 token 精确接管；任何不确定状态 fail closed。
- [通用 CLI 无法覆盖 legacy 文档中的任意测试习惯] → 正式执行只对机器可执行 `verification.yml` 保证 turnkey；legacy discovery 继续由 provider 报告 incomplete，不猜命令。
- [preview metadata 升级影响既有 retained 实例] → 只对声明 task environment binding 的 preview 强制新字段，独立实例保留兼容路径；旧 task preview 归属不完整时要求人工停止并保留环境。
- [并发测试可能因时间断言不稳定] → 用事件区间/lease 顺序证明重叠与串行，宽松 wall-clock 仅作辅助，不用固定 sleep 阈值作为唯一证据。

## Migration Plan

1. 先添加 production verification 模块与 characterization tests，让现有 Product verifier 改用生产原语。
2. 接入 `verification run`、公开 JSON/帮助和 Task Finish provider，再完成 package inventory/parity。
3. 扩展 preview ownership metadata 与 stop 校验，随后为 worktree cleanup 增加 runtime preflight。
4. 更新双任务 Candidate fixture，使其消费真实 evidence identity，并加入所有权负向场景。
5. 运行单元、集成、普通 Workspace tarball E2E、双任务组合验收和完整 Candidate；失败时可回滚到旧测试 adapter，新增 CLI 尚未发布无需数据迁移。

## Open Questions

- `verification.yml` 现有资源字段若无法完整表达 namespace template 或 lease TTL，实施时优先做向后兼容的可选字段扩展，并在 delta/current knowledge 中记录最终 schema；不得以 Product registry 私有字段替代正式声明。
- Task Finish 首期是直接组合 production application API，还是通过 capability provider wrapper 调用，由现有 provider 注入边界决定；无论实现方式，公开 evidence 与 executor invocation count 必须一致。
