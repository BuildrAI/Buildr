## Context

上一变更把"一个 adapter 可有多个 workspace destination root"实现为通用能力，并让 `qoder` 使用它。实机激活证明该能力当前没有任何真实使用者：`qoder` 不需要镜像根就能被三个安装形态发现，而共享 `.agents` 根的其他 adapter（`codex`/`cursor`/`trae`）本来就以同一根协作。因此本变更同时是范围收敛：撤掉 `qoder` 的声明，也撤掉随之无人使用的机制，而不是留一套"以后可能用到"的抽象。

## Goals / Non-Goals

- Goal：`qoder` 的 Skills 投射、回执、inventory、orphan 清理与诊断回到单根语义，正式自举工作空间的 `doctor --agent qoder` 恢复 `ready`。
- Goal：保留 `.agents` 作为**共享发现根**的披露，以及"其他 adapter 的回执即归属证明"的清理规则。
- Non-Goal：不改安装形态探测、`cli` surface、activation guidance 与 readiness 行动性判定。
- Non-Goal：不改 Rules 投射、用户级 `~/.qoder/skills`、其他 adapter 的 root 声明。

## Decisions

**D1：撤掉 `mirrorRoots` 字段与按根回执命名，保留 destination 的 `roots` 数组形状。**
`adapter-contract.ts` 去掉 `mirrorRoots` 校验与 `skillWorkspaceRoots(root, mirrorRoots)` 的镜像拼接，`destinations.workspace.roots` 退化为 `[root]`；`projection-files.ts` 去掉 `RECEIPT_ROOT_SEPARATOR`、`skillProjectionReceiptRootSlug`、回执的 `runtimeRoot` 字段与按根定位参数，回执恢复 `<skillId>.json`。曾考虑：保留机制只撤 `qoder` 的声明（否决：撤掉唯一声明者之后，按根 slug、按根迭代与"未声明根即停止"的校验都成为无人走通的分支，属于为假设需求保留的抽象；而 `roots` 数组本身是 destination 的现有形状，所有读取方都按它迭代，保留它不算预留）。

**D2：按根迭代的调用点保留，但只迭代单元素。**
`render-plan.ts`、`inventory.ts`、`components.ts` 继续以 `destinations.workspace.roots` 为唯一来源生成目标、读取回执与枚举清理，只是不再存在多于一项的输入。曾考虑：退回 `traits.skills.root` 单值读取（否决：那会把刚统一的 destination 语义再次分裂成两套，且共享根归属规则需要"该 adapter 声明了哪些根"这一表达）。

**D3：共享根归属规则归入 `.agents` 共享场景。**
`managedRuntimeSkillOrphans` 的 `claimedBySiblingReceipt` 跳过保留：`codex`/`cursor`/`trae` 今天就在同一 `.agents` 根各自持有回执，本 adapter 无回执但他人有回执的目录既不该删也不该判冲突。规范承诺从"Qoder 双根"场景移到"共享 `.agents` Skills 投射"场景，与实现的实际服务对象一致。

**D4：`qoder` discovery metadata 保留 `.agents` 条目但改变语义。**
`discovery.roots` 继续列出 `.agents`（basis `shared-agents-root`、hostConfigured `skills.loadFromAgentsDirectory`），因为它确实是桌面 App 的一个发现来源；变化只在它不再出现在 `destinations.workspace.roots` 与 `runtimeTargets` 中。`evidence` 记录同步为"官方文档 + 本机安装形态观察，共享根只作发现披露"。

**D5：规范按"保留场景名 + 改写为禁止性承诺"表达，而不是删除场景。**
OpenSpec 的 MODIFIED 要求块必须继续携带主 spec 已有的每个场景名（`openspec validate` 与 `openspec archive` 使用同一比较，且同一 requirement 不能同时出现在 ADDED 与 REMOVED）。因此 `Qoder 双 Skills root 投射` 场景名保留，正文改写为"不得把 `.agents/skills` 作为 `qoder` 的第二个写入根"，另加 `Qoder 单一 Skills root 投射` 表达正向规则。曾考虑：REMOVED 后同名 ADDED 重建（否决：validator 直接报 "Requirement present in both ADDED and REMOVED"）。

## Risks / Trade-offs

- 只装 Qoder 桌面 App、未装任何 `.agents` adapter 的工作空间，其 `.agents/skills` 不再由 Buildr 填充 → 桌面 App 仍从 `.qoder/skills` 发现同一批技能，可见性不降；披露的 discovery 语义仍说明该根存在。
- 移除按根回执命名会让上一变更刚写入的镜像回执（若任何工作空间存在）成为孤儿控制状态 → 本次实机确认没有任何工作空间成功写出镜像回执（`reconcile` 全部拒写），因此不需要迁移路径。
