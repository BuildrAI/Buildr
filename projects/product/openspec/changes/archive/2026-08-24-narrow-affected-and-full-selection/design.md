## Context

当前 planner 已能输出 `scope.reasons`，并具有初步的 `createVerificationSelectionAudit()`，但 `test:changed -- --json` 没有公开该审计投影；step 的字符串 `reasons` 也把 direct owner、Full profile expansion 与 dependency closure 混在一起。Full 触发边界仍由 `VERIFICATION_FULL_SCOPE_INPUTS` 字符串数组和 planner 内的少量路径特判共同决定，导致 reason code 的 authority 不集中、解释粒度不足。与此同时，近期正式 daily-full 从约 321–346 秒上升到 427.8 秒，不能先假定 affected 选择就是主要瓶颈。

约束包括：selection 规则必须 fail closed；registry、ownership、planner 各自保持单一职责；不能 mock 选择算法自证；Candidate/Release-only 证据与唯一 tarball/Launcher/readback authority 不得改变；性能预算只能由真实 Execution Record 重算。

## Goals / Non-Goals

**Goals:**

- 让一次 changed plan 用结构化字段解释 changed path → owner → selected step → dependency closure。
- 让 Full 升级由 ownership authority 中的稳定 reason code、触发 pattern、path 和说明驱动。
- 保持普通局部路径为窄 affected，关键选择 authority 继续 Full，unknown/unowned 继续阻断。
- 用近期普通 Task 与新正式执行形成 before/after 指标，并区分 selection amplification 与 owner cost。
- 保持 daily-full、Product Artifact Candidate 与 Release contract/smoke 的证据边界和覆盖。

**Non-Goals:**

- 不重写 registry、scheduler、Test Context Runtime 或 Execution Record store。
- 不按目录、层级或测试名称机械删除重型 owner。
- 不改变全局并发、缓存被测结果或共享可写 Workspace/Git/SQLite/process state。
- 不为达到预设耗时或 Full 升级率而 fail open。

## Decisions

### 1. Full authority 由 ownership 提供结构化声明

把 Full 边界表达为结构化 `pattern + code + explanation` authority，并由既有 `VERIFICATION_FULL_SCOPE_INPUTS` 兼容投影保留旧消费者。planner 只匹配 authority 并投影稳定 reason，不再按具体文件名临时猜 code。

备选是继续在 planner 中追加路径条件；它会让 ownership 与 reason authority 分裂，拒绝采用。

### 2. Selection audit 复用真实 plan，不建立第二套选择器

`changed --json` 在同一权威 plan 上调用 `createVerificationSelectionAudit()`，输出 direct mappings、dependency closure、selected steps、重型 owner、分层计数和逐 step selection trace。审计只解释结果，不重新选择、mock 或缓存结果。

备选是离线读取 registry 再重算；这会形成第二套 planner，拒绝采用。

### 3. 直接选择、Full 展开和依赖闭包分开记录

每个 selected step 的 trace 明确 `direct-owner | full-scope | dependency | explicit/profile/group | admission`，保留现有字符串 reasons 兼容人类输出。direct trace 必须关联触发 path 与 owner pattern；dependency trace 必须关联引入它的 parent step；每项还投影 execution boundary、primary evidence owner 和 public outcome。

### 4. 指标以可复核样本和 Execution Record 为 authority

选择指标来自代表性 Task 的 frozen changed paths 与真实 planner JSON；墙钟来自 sealed Execution Record。before/after 使用同一组路径样本，记录样本选择标准、Full reason 分布、中位/P90 和最常选择的重型 owner。样本不足或旧记录缺少字段时明确标记 missing，不估算。

### 5. 验收分为选择反例与对象证据

affected/Full 反例直接运行真实 planner；daily-full 和 Product Artifact Candidate 使用正式或等价完整执行；Release 只运行不产生真实外部发布的 contract/smoke。Candidate/Release coverage 检查必须证明日常 plan 未吸收 Release-only owner。

## Risks / Trade-offs

- [风险] 结构化 trace 增加 JSON 体积并影响消费者。→ 只新增字段、保留既有 schema 字段与人类 reasons；增加兼容契约。
- [风险] 收窄 Full pattern 会静默漏测。→ 先用真实样本和反例证明，再修改；关键 authority 与 unknown/unowned 保持 Full 或阻断。
- [风险] 历史 Execution Record 不含完整 selection audit。→ 只报告可验证字段，缺失项标记 missing，并用同路径当前 planner 重放选择而不伪造历史输出。
- [风险] Candidate 执行昂贵且可能受机器波动影响。→ 保留 capacity-one、记录 queue/executor wall clock，不用单次性能决定削弱覆盖。

## Migration Plan

1. 先在不改变选择结果的前提下增加结构化 Full authority 与 audit/trace 投影，并以兼容测试锁定 before 结果。
2. 对代表性路径运行真实审计；仅对证明过宽的 mapping 做最小调整，否则只形成正式结论。
3. 运行 affected/Full 反例、daily-full、Product Artifact Candidate 与 Release contract/smoke，更新当前认知和实测预算。
4. 保留旧 `VERIFICATION_FULL_SCOPE_INPUTS` 与字符串 reasons；后续消费者迁移完成前不删除。

回滚时可移除新增 audit 字段并恢复结构化 authority 的兼容投影，registry evidence set 和 Candidate/Release authority不需要回滚迁移。

## Open Questions

- 已解决：三个 retained `product.delivery` record具有可用changed paths和正式墙钟，但不含历史step-level trace；审计用同路径当前planner回放选择，并把缺少changed paths的record标记missing。
- 已解决：三个普通样本before/after scope和step集合不变，没有证明可收窄的mapping。唯一修正是让ownership authority自身Full，并让未知高风险production path阻断；二者提高fail-closed安全性，不声明性能收益。
