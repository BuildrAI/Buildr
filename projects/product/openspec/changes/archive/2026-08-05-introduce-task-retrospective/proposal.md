## Why

Buildr 当前的 `task-asset-review` 要求 Agent 在任务过程中持续观察、维护 observation，并在 Development handoff 前完成资产审查；这增加了 Agent 的执行步骤、时间与 token 消耗，却没有直接解决当前最迫切的执行效率问题。第一版需要回到最小闭环：任务结束后由 Agent 基于当前可见证据生成一份执行效率复盘，并让用户在 Local App 中直接查看。

## What Changes

- 新增 Task Retrospective：只允许对 terminal Task 写入一份 `agent-execution-efficiency` 当前复盘，内容为自由 Markdown 报告，重复执行时完整替换。
- 新增 Workspace SQLite current slot、唯一 Task Retrospective Application 和内部 driver；不提供公共 CLI、历史版本、评分、全局索引或跨任务聚合。
- 新增 `task-retrospective` Skill，由 Agent 基于当前可见的执行步骤、耗时和 token 证据推理高成本点与优化建议；无法取得精确数据时必须明确数据缺口，不读取隐藏推理或完整轨迹。
- Local App Task 详情新增只读“复盘”Tab；没有记录时显示“尚未复盘”，不提供编辑、触发或门禁动作。
- **BREAKING** 删除 `task-asset-review` Skill、capability contracts、binding、helper、模板、当前产品路由、consumer dependency 和对应验证；既有 `.buildr/asset-review/` 数据保持原样且不再读取、迁移或删除。
- Task Retrospective 不进入 Development、Finish、cleanup 或 Task terminal transition 的门禁。

## Capabilities

### New Capabilities

- `task-retrospectives`: 定义终态 Task 的单一当前执行效率复盘、SQLite 所有权、Skill 写入边界和 Local App 只读投影。

### Modified Capabilities

- `agent-task-workflows`: 移除 Task Development 对资产 observation/finalize 的 optional dependency 与 handoff gate。
- `product-agent-skills`: 用显式 Task Retrospective 路由替代旧资产观察、finalize 与 accept/reject 路由。
- `buildr-package-assets`: 原子交付 Task Retrospective contract/provider，并完整退役当前 `task-asset-review` package 资产。
- `task-asset-promotion`: 删除旧资产观察、审查、人工决定与后续任务交接能力。
- `task-asset-observation-lifecycle`: 删除 `.buildr/asset-review/` observation lifecycle 的当前产品要求，但不授权清理既有数据。
- `openspec-upgrade-integration`: 从需保持有效的 capability 列表中移除已退役的 `task-asset-review`。

## Impact

- Product specs、Task lifecycle/current knowledge 与产品说明。
- `product/buildr` domain、application composition、Workspace SQLite migration/repository、内部 interface。
- Local App Task API、Task detail UI 与相关测试。
- workspace package manifest、capability contracts、内置 Skills、runtime bindings、静态校验和 package parity。
- 这是 capability 退役与替换，不会读取或改写用户现存 `.buildr/asset-review/` 内容。
