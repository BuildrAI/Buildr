## Why

Task Finish v2 已经交付窄五阶段 adapter、Delivery Adaptation 和 target-race exact resume，但 current workflow、Roadmap 与 CLI help 仍保留“目标前进或 Git conflict 必须返回 Development”“新 Task Finish 使用 OpenSpec converge”“target branch 来自 worktree start point”等旧边界。这些残留会让 Agent 绕开当前 Development Handoff、Delivery Carrier 与 retained target authority，造成重复 Candidate/Verification 或错误恢复。

## What Changes

- 收敛 Task Finish 的唯一正式边界：只消费 current Development Handoff，在 run-owned Delivery Carrier 上完成 preparation、equivalence、delivery、retained activation 与 Environment cleanup。
- 删除 current workflow、Roadmap、CLI help 和验证中仍可被新任务理解为有效入口的旧 target-advance、Git conflict、OpenSpec convergence 与 worktree start-point 路由。
- 明确只有 Task Development Application 报告 source/context/policy/gate/handoff 真实 stale 时才返回 Development；Delivery Adaptation、target-race、retained 与 cleanup 阻塞继续使用同一 run 的产品生成 exact token。
- 保持当前单一 Buildr Product/Git adapter 直接接线，不预建 adapter registry、插件体系、第二 capability graph，也不新增 non-Git、multi-repo、task-branch、PR、release 或 deploy 路径。
- 补充 residual verification，防止旧 authority 文案、参数、binding、router 或 mutation route 重新进入 current package/runtime。
- 本 Change 不改变现有 run/result schema、Candidate bytes、generation、Formal Verification、Review、风险决定或 Task Environment cleanup authority；没有运行时协议破坏性变更。

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `task-finish-execution`: 固定当前单一 adapter 的最小通用交付边界、唯一恢复动作与禁止预建选择框架的要求。
- `agent-task-workflows`: 删除 Git conflict/target advancement 必然返回 Development 的旧 workflow，统一为 Development stale 与 Delivery Adaptation/target-race 的现行分流。
- `cli-product-surface`: 让 Task Finish/OpenSpec help 与 retained target、current handoff 和无 convergence authority 的真实入口一致。
- `buildr-package-assets`: 增加 Task Finish 旧 routing/mutation/binding 文案残留的 package/runtime negative gate。

## Impact

- Canonical specs：`task-finish-execution`、`agent-task-workflows`、`cli-product-surface`、`buildr-package-assets`。
- Current knowledge 与 Roadmap：Task Finish、技术架构、OpenSpec lifecycle 和 P0.8 交付跟踪表述。
- Product surface：CLI help、package Skill/contract 与 capability/routing verification；不新增公共命令或 schema。
- 实现：优先删除或修正文案/registration/test residual；只有审计证明存在重复判断时才做保持行为不变的窄重构。
- 验证：focused contract/integration/system、affected verification、完整 Product Candidate 与真实 Task Finish journey。
