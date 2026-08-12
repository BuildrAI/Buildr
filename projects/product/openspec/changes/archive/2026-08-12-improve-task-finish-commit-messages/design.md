## Context

Task Finish 不是把 Task 分支原有 commit 直接推入目标分支，而是根据冻结的 Task Contribution 在最新 Delivery Baseline 上创建新的隔离 Delivery Carrier commit。原提交主题因此不会自然保留，当前 executor 又在 `prepare` 中硬编码 `交付 ${taskId}`，最终 Git 历史只剩内部 Task 标识。

现有边界要求 Task Finish 保持确定性、可恢复，并且只能消费 current Development handoff；它不能从 diff、Change 名称或文件路径推断提交语义，也不应把提交文案写入 Task Record、Development Receipt 或新的独立 store。

## Goals / Non-Goals

**Goals:**

- 让 Agent 在首次 Finish run 前完成语义判断，产品只负责校验、规范化、冻结和机械使用。
- 让同一逻辑 run 的 prepare、Delivery Adaptation 和 resume 始终使用同一提交信息。
- 保持 Task ID 可追踪，但不再让内部标识占据提交主题。
- 通过最小公开证据证明实际 carrier commit 使用了冻结输入。

**Non-Goals:**

- 不由产品根据 diff 自动选择 `feat`、`fix`、scope 或中文主题。
- 不改写已经推送的历史提交。
- 不优化后续 self-bootstrap convergence commit 的独立模板。
- 不新增 commit-message capability、模板 registry、数据库表或跨 Task 缓存。

## Decisions

### 1. 首次 run 接受完整语义 message，resume 只读冻结事实

CLI 为首次 `task finish run` 增加 `--commit-message <text>` 必需参数。输入允许 subject 与可选 body；Agent 负责遵循 Buildr Core、Project、Service 和仓库约定。选择完整 message 而不是分别传 type/scope/subject，是为了避免 Buildr 核心重新实现 Conventional Commits 语义判断。

当 `--run <id> --resume <token>` 恢复已有 run 时，不重新接受或覆盖 message，直接使用 run 中冻结值。相比每次恢复都要求调用方重传，这可以消除 shell 编码差异和重试漂移。

### 2. Task Finish owner 在 run 中保存规范化 message

产品把换行规范化为 LF、移除首尾空白，校验首行非空，并拒绝主题精确等于 `交付 <当前 Task ID>`。随后确定性追加或规范化 `Buildr-Task: <task-id>` trailer。

规范化结果、subject 与 SHA-256 identity 由 `task_finish_current` 的 run payload 保存，属于 Finish 恢复事实；不写入 Task Record、Development Receipt、Environment Receipt 或 Git Operations store。run identity digest 绑定 message identity，确保新 run 的交付输入完整冻结。

选择 trailer 而不是主题中的 Task ID，是为了同时保留机器追踪与人类可读历史。不会拒绝其他合理主题，也不强制正文存在。

### 3. Carrier 创建只消费冻结 message

`prepare` 不再拼装文案，直接把 run-owned message 交给 `createIsolatedGitCarrier`。Git commit 成功后读取实际 `%B`，校验与冻结 message 字节一致，并把 message identity 与 subject 记入 carrier facts。Delivery Adaptation 仍由 Agent 在 run-owned carrier 中处理；如果适配新增 commit，最终采用的 carrier HEAD message 也必须保持冻结信息，否则 resume blocked，避免适配路径绕开约定。

### 4. 公开结果只提供最小审计信息

Task Finish result 输出 `deliveryCommit: { subject, identity }`，不复制完整正文。完整 message 只存在于 Git commit 和 Finish current run owner facts；execution record 可记录 identity/subject，但不保存第二份权威正文。

### 5. 兼容边界采用“已有 run 可恢复，新 run 必须提供”

已有 SQLite run 若没有 `deliveryCommit`，继续以已经持久化的 legacy message 恢复，避免升级后使已发生远端或 carrier 副作用的 run 无法完成。任何新 run 都必须提供语义 message；不为旧 run backfill，不迁移 terminal results，也不长期保留旧模板作为新运行 fallback。

## Risks / Trade-offs

- [Agent 仍可能提供内容空泛但格式合法的主题] → 产品只拒绝已知机械占位，不尝试替 Agent 做语义判断；Skill 明确要求提交前展示 subject/body。
- [完整 message 进入 Finish run payload] → 它是恢复所必需的唯一 owner facts，公开结果只投影 identity 与 subject，不复制到其他 authority。
- [多行 CLI 参数在 shell 中编码不便] → 正文可选；Agent/tool 调用可以把完整文本作为单一 argv，后续如出现真实需求再单独设计 message-file 输入。
- [Delivery Adaptation 可能产生不同提交主题] → resume 校验 carrier HEAD message；不一致时保留 carrier 并返回唯一修复动作。

## Migration Plan

1. 扩展 run normalization 与 SQLite payload validation，兼容读取缺少新字段的 existing run。
2. 扩展 CLI、Skill 与 contract，新 run 强制提供 message。
3. 切换 carrier prepare 与 verify 路径，补充 legacy/new-run/resume/adaptation 测试。
4. 发布后不修改既有 Git 历史；后续正式 Task 自然产生新的语义提交。

回滚代码时，已经由新版本创建的 run 必须先完成或明确处置；不得让旧版本忽略新 run 的冻结交付输入继续执行。

## Open Questions

无。正文是否需要由 Agent 提供按实际改动决定，产品只要求有信息量的 subject。
