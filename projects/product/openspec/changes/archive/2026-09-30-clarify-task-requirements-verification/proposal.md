# clarify-task-requirements-verification

## Why

上一任务验收发现三处信息架构缺陷：任务详情页「任务需求」中 intent 与关联变更的 `brief.md` 内容重复平铺（头部展示 intent、目录内再给"任务目标"），intent 本身也缺少长度约束；验证报告登记只能在任务 `active` 时写入，`completed` 后槽位永久锁死（本次任务先完成再补登被拒为 `task_verification_task_terminal`），登记时点未被 agent 入口明确指引；收尾页「用户确认」目录项在全部任务中几乎恒为空。现在统一修正：intent 回归一句话目标，brief 正名为"任务说明"并作说明页正文，验证登记时点写入 apply 贡献与收尾指引，「用户确认」按需显示。

## What Changes

- `task-manager` Skill 明确 intent 写法：一句话目标与入口，不复述完整需求、不写步骤清单；正式需求内容由关联变更的 `brief.md` 承载。
- Buildr Web 任务详情「任务需求」：有 brief 时以其为正文（UI 术语"需求说明"更名为"需求"），intent 作为短目标小节不重复；无 brief 时如实显示 intent 正文或空态。「用户确认」目录项只在存在 acceptance 待办或历史答复时出现。
- `openspec-apply-change` sidebar 贡献：实现完成阶段明确"已执行检查在任务 `active` 时经 task-verification 登记正式报告，completed 后不可补登"；`task-finish` 补登条款给出同样顺序语义。
- 术语：`brief.md` 的产品语义从"概要/简报"正名为"需求"（文件名、CLI 与既有读取兼容不变）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `buildr-web-client`: 任务详情说明节点的默认正文、intent/brief 的展示关系、术语和「用户确认」目录项的出现条件。
- `human-readable-change-brief`: brief 语义正名为需求并保持既有权威边界与归档兼容。
- `product-agent-skills`: `openspec-apply-change` 贡献与 `task-finish` 指引中验证报告登记时点的明确表述。
- `task-verification`: 登记窗口约束（active 方可写入）与 implementation 阶段登记时点的对齐说明。

## Impact

- 前端：`services/buildr-web/src/features/task/components/`（`taskWorkContent.ts`、`TaskNodeContent.tsx`、`TaskReadingPane.tsx`）与相关展示测试。
- 资源文本：`services/buildr/resources/` 下 `task-manager` Skill、`openspec-apply-change` sidebar 贡献、`task-finish` 指引的对应条款。
- 文档：`knowledge/` 中术语引用按需校准。
- 测试：前端单测与现有 `buildr-web-client` 相关断言更新；不新增验证能力，沿用既有检查。
