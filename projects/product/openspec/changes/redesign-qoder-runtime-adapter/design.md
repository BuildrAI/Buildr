## Context

约束条件（动机见 `proposal.md`，规范性行为见本次两份 delta spec）：

- Skills trait 当前只允许一个写根：`adapter-contract.ts:17` 把 `skills.kind` 限定为 `agents-compatible | vendor-root`，`adapter-contract.ts:165` 进一步要求 `agents-compatible` 的 root 恰为 `.agents`；`normalizeSkillDestinations` 把 `destinations.workspace.root` 与 `destinations.user.root` 各自建模为单个 root。`projection.ts:433` 的 satisfaction evidence 路径也直接取 `traits.skills.root`。
- 所有权回执按 `<agent>` 目录下的 `<skillId>.json` 存放（`.buildr/agent-runtime/workspace/<agent>/skill-projection-ownership-receipts/`），因此同一 agent 的两个写根若共用文件名会互相覆盖。
- 探测能力按单一 installation probe + 单一 version probe 建模（`validateEnvironmentProbe`），而 `trae-work`/`workbuddy` 已用 `selectPlatformEnvironmentProbe` 表达"macOS 自动、其他平台 manual"。环境探测缺席目前无条件成为行动项：`check-runtime.ts:45` 设置 `userActionRequired: true`，经 `result-model.ts:58` 计入 `actionableCount` 并置 `ready=false`。
- Qoder 侧真实事实：桌面 App 主进程开启 `.agents/skills` 发现，CLI 文档承诺 `.qoder/skills` 与 `~/.qoder/skills`，且用户级同名 Skill 覆盖项目级；`qoder --version` 只对独立安装的 Qoder CLI 成立。

## Goals / Non-Goals

**Goals:**

- 让一个 adapter 在保持 descriptor 单一事实的前提下声明多个 workspace 写根，并让投射、preflight、回执、reconcile、check 五处对每个根独立可判定。
- 让安装形态探测表达"同一 runtime 的多种安装形态"，并把无法自动确认的形态降级为事实型诊断。
- 保持 `.qoder/skills` 的既有承诺与所有其他 adapter 的行为不变。

**Non-Goals:**

- 不改变 Rules 投射：`.qoder/rules/buildr/*.md` 与 `trigger: always_on` / `trigger: glob` 映射经核对正确。
- 不引入真实 Agent 会话加载证明，也不新增 session marker smoke；文件一致性与 activation guidance 的边界沿用既有要求。
- 不调整 user destination 的写入策略（`~/.qoder/skills` 由宿主与其他工具管理，本轮 Buildr 不写入）。
- 不改动其它 runtime 的 Skills 根或 probe 结果。

## Decisions

**D1：把 workspace destination 从单 root 扩展为有序 roots，而不是为 qoder 写特例。**
`destinations.workspace` 接受 `roots: ['.qoder/skills', '.agents/skills']`（首项是文档承诺主根，其余是镜像根），trait 校验改为"每个 root 必须是安全相对路径且 kind 与主根一致"。曾考虑：为 qoder 增加布尔开关（否决：descriptor 之外出现第二事实源，且 `runtime list` 的 trait catalog 无法表达）；只投 `.agents`（否决：违背 CLI 文档承诺）。镜像根复用同一 implementation `filesystem-skills`，因此投射/清理管线只增加"按根迭代"，不新增 planner。

**D2：主根回执保持 `<skillId>.json`，镜像根回执用同目录内的 `<skillId>--root-<slug>.json`，并在镜像回执中记录 `runtimeRoot`。**
回执仍按 `destination + adapter + runtimePath + root` 唯一定位，因此单根 adapter 的既有回执逐字节不变、不需要 schema 迁移；orphan 枚举按 descriptor 声明的 roots 反查各自期望路径，遇到未声明根的回执直接停止。曾考虑：单个回执内部按根分段并 bump schema（否决：现有写入方与诊断方都假定"一份回执对应一份 runtime 目录"，分段会给所有 adapter 引入一次无收益的迁移，并让 stale 定位与并发保护复杂化）。

**D3：探测改为 surface 作用域的 probe 集合。**
`checker` 允许每个已声明 surface 各自给出 `command`、`macOS defaults`（bundle identifier）或 `manual` probe，runtime check 聚合为"命中哪些安装形态 + 各自证据"。Qoder 声明：桌面 App 与 IDE 用 bundle identifier 探测、CLI 用 `qoder --version`、非 macOS 且无 bundle 可查时该 surface 为 `manual`。这与 `trae-work`/`workbuddy` 既有平台化探测同构，因此复用 `selectPlatformEnvironmentProbe` 而不新造机制。

**D4：行动性判定按"是否能否定已成立事实"划分。**
环境探测未确认不再单独置 `userActionRequired: true`；投射缺失/过期/冲突继续要求行动。实现落点是 `check-runtime.ts` 的 `environmentFindings`，其结论交由 doctor 既有的"聚合全部非行动型 runtime warnings"规则处理，因此 `ready` 语义只在该场景放宽，其他 runtime finding 不变。选择该点而非修改 `result-model.ts`：readiness 计算规则本身没有变化，变化的只是单条 finding 的行动性属性。

## Risks / Trade-offs

- 两个根内容漂移 → 投射由同一 plan 一次生成，check 与 doctor 对每个根独立出具 identity，任一根过期仍是 actionable `stale`。
- `.agents/skills` 是 `cursor`/`trae` 的共享根，同一 Skill 可能被多个 adapter 写入 → 以 asset identity 等价合并；identity 不等价时按既有名称冲突 preflight 保持整次零写入并报告来源，不静默覆盖。
- 桌面 App 的 `.agents` 发现依赖未文档化开关，未来版本可能变化 → 保留文档承诺根 `.qoder/skills` 作为主根，`runtime list` 明示两种根各自的发现依据，Activation guidance 继续声明"文件写入不等于当前会话已加载"。
- 放宽环境探测行动性可能误放行真实问题 → contract test 固定两组用例：投射一致 + 形态未确认 ⇒ `ready=true`；投射过期 ⇒ 即使形态未确认也 `ready=false`。
- 回滚 → 恢复旧 descriptor 后，`.agents/skills` 下由 qoder 回执拥有的文件在下次 reconcile 被精确删除；`.qoder/skills` 内容从未减少，因此无数据丢失面。

## Migration Plan

1. 先扩展 trait 校验与投射/reconcile/回执的按根迭代，保持现有单根 adapter 行为逐字节不变（回归用例锁定）。
2. 再把 qoder descriptor 切到双根 + surface 作用域 probes + `cli` surface。
3. 最后调整 `environmentFindings` 的行动性判定，并补 doctor 用例。
4. 已安装 workspace 无需手工动作：下一次 `sync qoder`（正式自举激活内部执行）补齐 `.agents/skills` 并写入双根回执。

## Open Questions

- Qoder IDE（`com.qoder.ide`）是否同样开启 `.agents/skills` 发现，本机尚未对该版本做真实加载观察；两种根都已投射，因此该问题的答案不改变本变更的规范与任务拆分。
