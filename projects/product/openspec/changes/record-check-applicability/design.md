# 设计：审查与验证适用性显式留痕

## 归属选择
三项检查是否适用属于任务流程事实而非专业结果。现有 Task Review（`planning`/`completion` 槽位）与 Task Verification（单槽位）模型只保存已形成的真实结果，把它们扩展一个"不适用"值会让"没有执行"与"已审查无需修改"共享同一模型，污染结论语义。工作摘要（Work Context）已承载 stage、attention 等流程事实并有 compare-and-set 原子更新，是归属适用性结论的自然位置；专业应用继续不感知该字段，符合"约束局部化"。

## 契约形状
`TaskWorkContext` 增加可选 `checks`：按固定检查名（`planning-review`、`implementation-review`、`verification`）最多三条，`status` 限定 `needed`（已判断需要、尚未有结果）或 `not-applicable`（明确不适用），`reason` 必填且随本次事实变化；不记录 `performed`——已有真实结果时区块直接显示结果，避免第二事实源。闭合 schema，字段仅存当前结论，不保存历史。

## 写入面
- `task work-context record` 已支持 stage/attention 原子更新；CLI 新增 `buildr task checks record <task-id> --check <key> --status <status> --reason <text> --expected-context <digest>`（或在现有 record 上加 `--check`），保持 CAS 语义；任务非 `active` 时拒绝写入。
- HTTP 在工作摘要端点扩展同等输入，前端刷新周期沿用现有 work-context 读取，不新增轮询。

## 呈现
`TaskNodeContent` 目录项现状：无记录显示"暂无记录"。改为三级：有真实结果→按现有结果渲染；无结果但 `checks` 记为 not-applicable→显示"不适用"并在详情区展示理由；无结果且无结论→显示"未执行"。三个区块（方案设计-方案审查、开发实现-实现审查与开发验证）一致处理。已完成任务仍可读取历史结论。

## 指引更新
- `task-triage`：交接字段中三项默认判断为需要；不适用必须给出与事实相符的理由并建议留痕。
- `openspec-*` 增强指引与 `task-finish`：收尾核对扩展到"登记适用性结论或说明"，不新增门禁；completed 后槽位锁死规则不变。
