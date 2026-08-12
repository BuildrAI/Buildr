## Context

P0.1、P0.2、P0.3 已分别建立 Task Record、Task Environment 与 Task Review Result。现有 Task Verification 则仍是 `buildr.task-verification/v2`：Project `verification.yml` 同时表达能力成熟度、三层 assurance、DAG、资源政策与 Finish gate，production runner 产生包含 stdout/stderr、Candidate identity 和 cleanup lifecycle 的 transient summary，Finish 直接消费该 summary。它没有 Task-scoped、portable、Git-tracked 的 current Result，也没有 Local App Task 投影。

P0.4 只能建立 Verification Capability Declaration 与 Task Verification Execution + Result；Task Development、Candidate generation、Metadata Publication、风险 proceed/blocked 和新的 Finish 状态机均属于后续批次。

### Authority 审查

| 现有能力 | 结论 | P0.4 处理 |
| --- | --- | --- |
| Project `verification.yml` | simplify | 升级为 v2 最小声明，不再承载成熟度、层级、门禁模式或声明级 DAG。 |
| process executor 与完整输出/耗时 | keep | 只作为 transient Execution Evidence；不复制到 portable Result。 |
| evidence lifecycle/cleanup | keep | 继续清理单次 transient execution，不再被当成 current Result。 |
| resource coordinator | simplify | 仅服务显式声明且真实使用的 coordinated/external claim；Product 当前只保留 browser claim。 |
| DAG scheduler | migrate | 从 production 删除；仅把 Buildr Product 自身真实使用的 scheduler 迁到 `test/verification/`，Project declaration execution 改为显式 capability 集合。 |
| Candidate identity、三级 assurance、transition/retry | delete | 从 declaration、contract、Skill、CLI、Finish consumer、spec/docs/tests 中删除。 |
| Finish verification summary consumer | migrate | 改为 inspect current Result；缺失或 stale 时最多执行一次 required-for-delivery capability 集合并通过同一 Application record。 |
| Local App | migrate | Task 详情新增只读 current Result 与 Agent action，不暴露直接 writer。 |

## Goals / Non-Goals

**Goals:**

- 一个 Task 一个 current Verification Result，只有 Task Verification Application 可以持久化或读取其领域语义。
- Result 绑定明确 target identity 和 Task scope 内每个 Project 的 declaration identity；reader 基于当前输入和当前声明派生 `current|stale|unknown`。
- 完整 Result 使用原子整值替换；完整语义结果形成前、中断或写入失败保留原 current。
- CLI、Skill、Local App、Finish adapter 使用同一 Application；execution summary 始终 transient。
- 直接切换 v3 contract/v2 declaration，不保留双 writer、双 schema 或长期兼容 reader。

**Non-Goals:**

- Result history、revision、CAS、局部 merge 或多 writer 协议。
- 新测试框架、通用 DAG、调度器、资源平台或自动开发缺失测试。
- Task Development、Candidate generation、Task 顶层推进、风险接受或新的 Finish 状态机。
- 替代 Task Review、Task Environment、业务验收或人工决定。

## Decisions

### 1. Result 使用一个固定 current slot

路径为 `.buildr/tasks/<task-id>/verification.yml`，schema 为 `buildr.task-verification-result/v1`：

```yaml
schemaVersion: buildr.task-verification-result/v1
taskId: task-id
target:
  identity: opaque-stable-identity
  summary: 被验证目标的可移植说明
declarations:
  - project: product
    path: projects/product/verification.yml
    identity: sha256-...
capabilities:
  - project: product
    capability: product.fast
    outcome: passed
    facts:
      - 相关单元与契约测试通过
coverageGaps: []
conclusion:
  outcome: passed
  summary: 当前目标已完成声明范围内的验证
completedAt: 2026-08-02T00:00:00.000Z
```

Application 从 Task scope 和当前 Project registry 读取 declaration bytes 并生成 identities，调用方不得提交 declaration identity。声明缺失以稳定的 `absent` identity 绑定并要求对应 coverage gap；声明随后出现时自动 stale。选择这一方案是为了让 policy freshness 由确定性产品逻辑证明，而不是信任 Agent 复制 digest。

声明本身属于当前目标但尚未集成 retained Workspace 时，CLI 可以提供 `--declaration-root <task-environment-root>`；Application 只接受该 Task 当前 matching ready Environment 的精确根，并只用它观察 registry/declaration bytes。本机根路径不进入 Result。这样 Task Verification Skill 与临时 Finish adapter 使用同一 declaration observation authority，不需要 Finish 私有 writer。

未采用 Result history/revision/CAS：P0.4 只有单一 current writer，整值替换足以表达当前事实，额外并发协议没有现实 consumer。

### 2. Applicability 只派生，不持久化

`inspect` 可接收当前 `targetIdentity`。Application 每次重读 Task scope 内声明并分别派生：

- target：未提供为 `unknown`，相等为 `current`，否则为 `stale`；
- declarations：全部 identity 相等为 `current`，任一缺失、出现、内容变化、registry/path 变化或声明无效为 `stale`；
- overall：任一轴 stale 即 `stale`；target unknown 且 policy current 为 `unknown`；两轴 current 才为 `current`。

Result 不保存 `applicability`、`resultDigest`、本机绝对路径或 Environment Receipt。选择 reader 派生是为了避免 stale 标记本身成为第二个 writer。

### 3. Project declaration v2 只描述既有能力

`buildr.project-verification/v2` 的 capability 只包含：

- `id`、可选 `title`；
- `scope.project` 与 `scope.services`；
- `invocation.kind: command|agent` 及对应 argv/cwd 或 bounded instructions；
- `applicability.paths|conditions`；
- 非空 `proves`；
- `requiredForDelivery` boolean；
- 可选 `environment`、`effects`、`resourceClaims`。

删除 `mode`、`maturity`、`stages`、`enforcement`、`coverage.kind`、`sources`、`dependsOn` 与 `supersedes`。测试不存在时由 Result 报告 coverage gap；Verification 不修改声明、不生成测试，也不提升所谓成熟度。

### 4. Execution 与 Result 分离但共用一个领域入口

`buildr verification run` 是 transient execution adapter，要求显式 `--project`、一个或多个 `--capability` 与 `--target-identity`。它只执行 `invocation.kind: command`，保存完整输出、耗时、资源等待、执行上下文和 target stability 到 `buildr.verification-execution/v1`，并保留现有 cleanup 操作。

`buildr task verification record` 接受已经完整形成的 portable facts，并通过 Task Verification Application 原子替换 current；Agent invocation 也使用该入口。run 中断或没有形成完整事实时不调用 record。这样既支持确定性命令，也不把有界 Agent 操作硬塞进命令 runner。

未采用 `run` 自动写 Result：单个 run 只覆盖一个 Project 的命令能力，无法代表多 Project、Agent operation 或 coverage gap 的完整 Task 结论。

### 5. 原子替换复用 P0.3 的安全模式

Repository 先完成 closed-schema normalization 和 serialization round-trip，再以同目录独占临时文件写入、重读校验和 atomic rename 替换 current。rename 后若 post-read 失败则恢复旧 bytes；任何阶段失败都返回 stage/rollback 诊断。静态 verifier 要求 persistence writer 只有 Application 一个调用方，并禁止 CLI、Local App、Task Record 与 Task Environment 直接读写 Result 文件。

### 6. Finish 是临时 reader/补齐 adapter

现有五阶段 Finish 不新增状态。verify 阶段对 frozen delivery tree 形成一个不叫 Candidate generation 的 opaque target identity，先调用同一 Application inspect：current 且结论 passed 时复用；否则从 Project v2 declaration 选择 applicable `requiredForDelivery` command capabilities，执行一次、提炼 portable facts、通过同一 Application record，再读取 Result 做自身 fail-closed 决定。

Result 不保存 proceed/blocked；Finish 因 `not-passed` 停止是 consumer 自身交付门禁，不回写 Verification lifecycle 状态。P0.5 建立 Development/Candidate 后可替换这个 adapter，而无需迁移 Result schema。

### 7. Contract 与 projection 直接切换

`buildr.task-verification/v2` 被 v3 直接替换，Project v1 declaration 同步升级为 v2；manifest、baseline、Skill reference/template、Buildr product routing、docs 与 tests 在同一 candidate 中切换，不保留兼容 reader。原因是旧 schema 还未成为长期持久用户数据 authority，保留双版本会造成双 policy。

## Risks / Trade-offs

- [已有 Workspace 的 Project v1 声明会立即 invalid] → package/template/docs 同步迁移，doctor 给出明确 v2 修复诊断；本次不维护双 reader。
- [Local App 通常没有当前 target identity] → 仍自动检查 declaration freshness，target 轴显示 `unknown`，不伪造 current。
- [Finish 自动 applicability 只能处理声明式 scope/paths] → 临时 adapter 不解释自然语言 `conditions`，也不据此跳过；scope/path 命中时保守执行 `requiredForDelivery` command capabilities。需要语义排除、多 Project 或 Agent capability 时，先由 Skill 形成正式 current Result。
- [保留 scheduler 可能被误认为 Task DAG] → spec/docs 明确它只属于 Buildr 产品内部测试实现，Project v2 与 Result 均无 dependency 字段。
- [自举候选升级 Skill/contract 后 retained runtime assembler 与候选期望不同] → retained Environment controller 继续独占 Receipt 与 prepare，但候选 render 后由同一候选 CLI 执行只读 `runtime check` 并返回 projection identity；候选仍不能认领或清理 Environment。
- [原子 rename 后 rollback 也可能失败] → 返回精确 rollback failure 并停止；不继续覆盖或写 sibling store。

## Migration Plan

1. 在 Change 内先落 v3/v2 delta specs、Result schema 与 authority tests。
2. 新增 domain/repository/Application/CLI/Local App，再迁移 runner declaration parser 与 public execution JSON。
3. 将 Finish consumer 切到 Application；删除 assurance/summary 参数、旧 fixtures 与 static contract assertions。
4. 迁移 Product `verification.yml`、Skill/contract/reference/template、manifest、docs、current knowledge 和 Roadmap。
5. 运行 focused、affected 与最终 Product Candidate 验证；主动完成 Planning/Completion Task Review。
6. Task Finish 收敛、同步 canonical specs、归档 Change、集成并验证 retained runtime projection；P0.4 之后只保留 v3/v2 authority。

回滚以整个 Change candidate 为单位；不在一个 retained runtime 中混用新旧 contract/schema。

## Open Questions

无。新的 semantic boundary 已由 P0.4 输入明确，P0.5 的 Development/Candidate 决策不在本 Change 提前确定。
