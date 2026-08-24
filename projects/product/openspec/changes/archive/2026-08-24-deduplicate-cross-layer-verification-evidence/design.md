## Context

Buildr 已有单一 verification registry、分离的 changed ownership authority、Core/Candidate/Release profiles、Test Context disposition 和逐 step timing。当前缺口不是缺少另一套执行框架，而是 registry 中的 `proves` 与 `primaryEvidenceOwner` 尚未形成可执行的跨层审计：维护者无法直接看到一个慢 owner 的公共结果、反例、证据角色及其为何不能由低层 owner 替代。另一方面，changed planner 虽输出结构化 reason，却没有把代表性普通变更的 changed paths、直接 owner、依赖扩张、step 总数和 Full 原因汇总为同一份成本诊断。

本 Change 涉及测试控制面、执行面和长期验证文档。约束是保留至少一条真实 CLI/Git/进程/完整生命周期路径，保持 affected/full/Candidate/Release 正交，并且不得缓存被测结果、扩大全局并发或削弱 Candidate/Release authority。

术语沿用现有 canonical 语义：`primary evidence owner` 是对某项公共事实承担最低充分主证据的唯一 verification owner；其他 owner 只能承担组合或边界辅助证据。`Core` 指日常完整 Product 验证 profile，不指 Candidate CI 中名为 `core-*` 的平台 shard。

## Goals / Non-Goals

**Goals:**

- 让日常 Core 中慢 Integration/System owner 的主证据关系可由代码审计并 fail closed。
- 将 selection amplification 与真实 owner execution cost 分开测量，回答日常验证慢的主要来源。
- 用反例约束跨层去重；只有替代 owner 确实能发现公共行为错误时才转移主证据或收窄 Core。
- 证明 Release-only owner 不属于普通 Core，同时保持 Candidate/Release 集合不下降。
- 给后续黄金执行路径优化提供残余 owner、分阶段成本和数学下限。

**Non-Goals:**

- 不新增第二套 Test Context Runtime、测试 registry 或 Candidate workflow。
- 不按目录、测试名称或执行层级机械删除、降级测试。
- 不共享可写 Workspace、Git worktree、SQLite connection、用户 profile 或跨 case 进程状态。
- 不在本阶段承诺 Core 的目标墙钟，也不优化黄金 journey 内部实现。

## Decisions

### 1. 证据地图从唯一 registry 派生

在现有 testing classification 中补充稳定的公共结果与反例描述，继续复用 `primaryEvidenceOwner`。证据角色由 `step.id === primaryEvidenceOwner` 派生为 primary，否则为 supporting；不建立独立手写 evidence registry。审计器要求所有日常 Core 中达到慢 owner 阈值的 Integration/System step 都有闭合元数据，且其 primary owner 存在、属于相同公共事实并且唯一。

备选方案是在 Markdown 中手工维护 evidence map。它更易阅读，但会与 registry 漂移且不能在执行前失败关闭，因此仅保留由代码事实支撑的解释性审计报告。

### 2. 选择审计与执行计时分开

新增只读审计入口，复用 changed planner 和 Git changed-path 收集能力，对显式 base/head 或记录的代表性样本输出：changed paths、直接 ownership reason、依赖扩张、最终 steps、scope mode、Full reason code 与目标工作量。它不执行 verifier，也不把 planning 目标预算冒充实测。真实 step wall-clock 和 prepare/body/wait/cleanup 继续来自 Execution Record。

这样可分别计算：

- selection amplification = 最终重型 step 数 / 直接命中的 primary owner 数；
- owner cost = 被选 owner 的目标与实测 wall-clock；
- Core 数学下限 = 总工作量、依赖关键路径和资源容量下限的最大值。

备选方案是只比较整轮 Core 墙钟。该数字混合了选择、排队和 owner 自身成本，无法回答本 Contribution 的问题。

### 3. 去重必须由反例与覆盖闭合共同授权

每项候选去重先确定公共结果和故障注入反例。低成本 Unit/Component/Integration owner 必须在反例下失败，才可成为该事实的 primary owner；重型 System 仍可保留组合一致性，但不得继续声称同一事实的主证据。任何 Core membership 或 ownership 收窄必须同时证明 Candidate 文件并集、唯一文件 owner、changed 代表路径和 Release exclusions 未退化。

若审计发现 System 的主证据是 CLI、Git、进程、初始化、迁移、Finish、自举或 cleanup 的真实边界，则保留该 owner，并记录低层测试不能替代的原因。没有替代 primary owner 时不删除证据。

### 4. Release-only 排除使用闭合集合验证

继续以 `VERIFICATION_DAILY_CORE_EXCLUSIONS` 为 authority，但 contract 将反向检查所有 tarball、安装、Launcher、package parity、发布 smoke 与 readback 类 step 均声明为排除项且不含 `core` profile。Candidate/Host Node/Release membership 由既有 authority 继续拥有；`CORE_MACOS_STEP_IDS` 只代表 Candidate CI 的 macOS shard，不得被解释为日常 Core。

### 5. Node 与 Java 的比较归结为可测成本，而非技术栈判断

本 Change 不把 Node 进程模型视为固有慢因。Node 的纯逻辑与同进程 Component 应保持低成本；高成本假设集中在重复 Git/Workspace/SQLite/CLI 子进程、进程冷启动、轮询等待和 cleanup。只有选择审计与 phase timing 能证明该假设。最终报告必须明确区分“affected 选宽”“必要 owner 太重”和“环境竞争”三类结论。

## Risks / Trade-offs

- **[元数据完整但表述不准确]** → contract 只验证结构，Completion Review 还需以测试文件与反例逐 owner 审查语义。
- **[近期 Git 样本随历史变化]** → 审计入口接受显式 immutable base/head；长期 contract 使用稳定 synthetic changed paths，报告记录实际 commit identity。
- **[错误收窄导致漏测]** → 任何 ownership/Core 调整先验证低成本反例，再证明 Candidate union 和唯一 owner；无法证明时保留现状。
- **[把 Candidate shard 的 core 命名误当日常 Core]** → 输出同时展示 profile membership 与 shard membership，并在文档中固定区分。
- **[性能样本受竞争污染]** → 本 Contribution 只形成基线和残余清单；正式多轮无竞争/竞争验收留给 Parent 后续 Contribution 与最终 Verification。

## Migration Plan

1. 扩展 registry evidence metadata 与 contract，不改变执行集合。
2. 建立选择/证据审计入口并对当前 tree 和近期普通变更取样。
3. 逐项加入反例；仅对已证明的重复证据调整 ownership 或 Core membership。
4. 运行 focused、affected 和 Candidate membership contract，形成残余黄金 owner 基线。
5. 若任何 coverage/selection 证明失败，回滚对应 membership/ownership 调整，保留只读审计能力。

## Open Questions

- 近期普通任务中，多少次 Full 来自 execution graph authority，多少次来自缺失或过宽 ownership？需由实际样本回答。
- 日常 Core 的长尾主要由 Finish/Workspace/Worktree/进程 owner 自身成本还是资源等待构成？本 Contribution 只建立 owner 清单，精确 phase timing 由后续 Contribution 实测。
- 审计后是否存在可安全移除的重复重型 primary evidence？若不存在，应正式记录保留理由，而不是为了数字目标强制删除。

