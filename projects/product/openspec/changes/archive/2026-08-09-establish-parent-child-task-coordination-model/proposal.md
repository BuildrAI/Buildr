## Why

现有 Parent Task 同时持有完整 OpenSpec delta Change 和 Child 执行清单，而 Child Task 又以自己的窄 Change 独立交付，导致规范 authority、进度 authority 与范围归属重复。现在需要把 Parent 固定为协调 authority、Child 固定为独立交付单元，并让实际交付范围通过专业 handoff 明确保存，避免每个 Child 完成后反复重写 Parent Change 和 Planning Review。

## What Changes

- 新增正式 Parent Plan：只保存 outcome、architecture invariants、Contribution Map、dependencies 与 final acceptance；不保存 Child 状态、完整 Requirement/delta、实现字段或 checkbox 进度。
- 复用 Task Development 的 Workspace SQLite current Receipt 保存可选 Parent Plan，并以 Parent Plan 自身 identity 作为 Parent Planning Review target；不新增 Parent Plan、lifecycle 或 progress 表。
- Child Task 显式绑定 Parent、承担一个或多个 Contribution、持有自己的窄 Change，并在现有 immutable Development handoff 中形成 Contribution Handoff，区分 planned、delivered、extra、residual、superseded 与跨 Contribution 影响。
- 增加显式 Parent reconciliation：只有 outcome、invariants、Contribution Map、dependency graph 或 final acceptance 实质变化才更新 Parent Plan/identity 并使 Planning Review stale；普通 Child 状态、Verification、Change archive 或 Finish 不改变 Parent Plan。
- 增加统一 Parent coordination Application read model：只联接 Task Record 与已保存的 Development/Finish 专业事实，动态返回 Child 状态、Contribution 交付/残余/取代事实和最终验收前置条件；CLI、Local App 与 Agent 使用同一 Application，不直接查询 SQLite、不扫描文件系统、不回填 Parent。
- 保持 Child completed 不传播 Parent completed；Parent 必须显式记录最终集成验收并通过正式完成流程。被其他 Child 完全覆盖的已创建 Child 必须 `abandoned` 并以 superseded reason 结束，不能伪装为 `completed`。
- 采用 forward-compatible、opt-in 兼容：没有 Parent Plan 的历史 Task 保持现有读写、恢复、完成与放弃行为；不 backfill、不扫描或改写历史 Change/`tasks.md`，也不根据历史 Child 状态推断 Contribution。
- 更新 Task、Development、Review、Finish、CLI/public JSON、Local App 与 Agent Skills/contracts 的边界和验证；不恢复 `task_lifecycle_current`，不建立 workflow engine、DAG、scheduler、event/history/audit store 或通用 Result registry。

## Capabilities

### New Capabilities

- `parent-child-task-coordination`: 定义 Parent Plan、Contribution、Contribution Handoff、显式 reconciliation、派生 read model、最终集成验收与历史 opt-in 兼容模型。

### Modified Capabilities

- `task-record`: 明确 Child 与 Parent/Contribution 的创建及 superseded abandon 边界，同时保持顶层状态不传播。
- `task-development`: 在既有 current Receipt 中保存可选 Parent Plan，并在既有 immutable handoff 中保存 Contribution Handoff。
- `task-review-results`: 以 Parent Plan identity 限定 Parent Planning Review applicability，排除普通 Child 状态变化。
- `local-workspace-application`: 通过统一 Application 提供 Parent coordination read/update actions，不在 HTTP GET 扫描或回填。
- `local-app-web-client`: 展示 Parent Plan 与 Child Contribution 派生进度，并通过同一 API 执行显式 reconciliation/最终验收操作。
- `public-json-contracts`: 登记 Parent Plan、Contribution Handoff、coordination read model 与 mutation Result 的 closed JSON identity。
- `agent-task-workflows`: 让 Agent 按 Parent 协调、Child 独立 Change/Development/Finish 和显式 reconciliation 工作。
- `product-agent-skills`: 更新 Task Manager、Triage、Development、Review 与 Finish 的用户意图、边界和结果证据。
- `skill-capability-contracts`: 扩展现有 Task Record/Development/Review/Finish 协作保证，不引入第二套通用 capability authority。
- `buildr-package-assets`: 原子投射更新后的 Skills、contracts、CLI/public JSON registry 与验证资产。

## Impact

- Product Project：canonical specs、Change Brief、技术架构、Task coordination/lifecycle 文档、Service 说明与 glossary。
- `product/buildr`：Task Development closed Receipt、Parent coordination Domain/Application、Task Record/Review/Finish 接线、SQLite repository read model、CLI、HTTP、public JSON registry、package assets 与 Unit/Integration/System tests。
- `product/buildr-web`：Task 详情中的 Parent Plan、Contribution 和 Child delivery 状态展示及受控 reconciliation/final acceptance 交互。
- 数据：继续使用现有 `tasks.parent_task_id`、`task_development_current` 与 `task_finish_completions`；新 Receipt major 对旧 Receipt 提供 absent-compatible reader，不新增表、不 backfill 历史 Task。
- 自举 runtime：更新 Workspace source Skills/contracts 后按 Buildr sync/render 规则投射，并通过 Doctor 验证。
