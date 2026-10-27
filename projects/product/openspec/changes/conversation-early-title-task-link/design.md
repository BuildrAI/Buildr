## Context

现状（见 proposal.md - Why）：`ConversationApplication` 只在首轮 `runtime.send` 结束且 `observe` 完成后调用 `generateAutomaticTitle`，且 `titleDescription` 要求同时存在用户与助手消息；`update` 只接受 `title`/`hidden`，任务引用只能在 `create` 时保存；发送给执行方的 `工作位置与来源` 上下文含 `taskId` 但不含对话标题。界面侧已有任务→对话入口（`TaskConversationEntry`）与草稿任务绑定（`draft.taskId`），缺对话→任务入口。

## Goals / Non-Goals

**Goals:**

- 执行开始即用同一份隔离摘要能力回填标题，完成时原路径兜底；手动改名与原生标题事件继续优先于自动结果。
- 同一 `update` 原子维护任务引用（设置/更换/解除），沿用 `expectedRevision` 版本保护与宿主 `assertTask` 身份校验。
- 对话面板提供关联任务入口，覆盖已建对话与草稿两种形态。

**Non-Goals:**

- 不在 Buildr Web 创建任务；不引入双向关系管理器；不为提前标题新增新的模型通道或改动画题机制。
- 不改变标题长度、清理与手动改名规则；不为历史对话批量生成标题。

## Decisions

- **早期标题复用既有隔离摘要，不新增机制。** 在 `execute` 完成上下文建立、即将派发 `runtime.send` 时并发触发 `titleAtRunStart`：以本次可见用户输入构造 `description`，调用 `runtime.generateTitle`，命中即 `acceptTitle` 置为 `generated`；失败静默。`titleWork` 并发去重、`titleEligible`（`default` 来源且仍为中性名称）与 `acceptTitle` 校验全部沿用。理由：与现行机制同构、零新增凭据面。备选“本地截断首句即时填充”被否——规范禁止把首句截取冒充摘要。
- **早期失败不消耗兜底尝试。** 早期路径不设置 `titleAttempted`；首轮成功后 `generateAutomaticTitle` 仍按原条件走 `readTitle`→`generateTitle`。若早期已成功（`generated`）或用户已改名（`manual`），兜底自然跳过；原生 `title` 事件路径不变。
- **DSH 无 `generateTitle` 时早期为空操作。** 其原生 `session/title` 事件与完成时 `readTitle` 不变，行为不劣化。
- **任务引用经 `update` 的 `taskId` 字段维护。** `string` 设置、`null` 解除；非空走宿主 `assertTask`；`@default` 工作空间按创建侧同规则拒绝。不再新增端点，保持单次原子更新与修订语义。理由：与 `title`/`hidden` 同一通道，界面只需一次 PATCH。备选专用端点被否——表达力相同且多一条契约。
- **发送上下文追加 `conversationTitle`。** 在 `工作位置与来源` JSON 中给出当前标题，供执行中的智能体创建任务时保持一致；不新增回写通道。
- **关联入口复用面板既有“关联任务”呈现位与草稿绑定。** 已建对话在标题信息区与底部位置栏提供入口；弹层列出同工作空间进行中任务供选择、更换或解除；草稿态直接写 `draft.setTaskId`。

## Risks / Trade-offs

- [早期标题只依据用户输入，晚到的助手内容不再参与命名] → 与“执行开始即回填”的目标一致；`generated` 后不再被自动覆盖，用户可改名或显式生成。
- [早期摘要与运行中 turn 共用执行方连接] → 摘要能力本身即隔离调用（独立短上下文/独立 RPC），不注入工作历史；超时与中止沿用 `titleWork`/`AbortController` 边界。
- [取消关联后任务侧清单立即反映] → 列表读取以持久化 `task_id` 为准，`save` 同事务更新，无派生缓存。
- [草稿绑定与已建对话更新走不同存储] → 入口组件按 `chat` 是否存在分派 `draft.setTaskId` 或 PATCH，语义一致。

## Migration Plan

纯增量：持久层 `task_id` 列与 `titleOrigin` 语义不变，旧数据无需迁移；旧客户端不提交 `taskId` 时行为不变。
