## Context

当前Task Retrospective已经允许Agent基于可见证据自由复盘，并在处理阶段把有效方向交给Task承接；Application只保存单一Markdown Result与处置状态。缺口在provider方法：没有明确要求把重复执行过程提升为“可否确定化”的候选，也没有要求处理多份复盘时对候选做哲学边界审查和共同确认。

该变化只涉及Agent工作方法与最小capability guarantee。Retrospective Application、Task Record关系、Result schema、SQLite与Buildr Web已经能保存报告、授权写入和承接来源，不需要新的结构化平台。

## Goals / Non-Goals

**Goals:**

- 让Agent从任务执行事实与已有复盘中主动探索确定性流程候选。
- 给候选提供可证伪的准入条件和Core哲学护栏。
- 让单份/多份复盘处理阶段把候选聚类后交给一人或多人共同确认。
- 保持候选、确认与后续Task effects可读、可恢复、非自动化。

**Non-Goals:**

- 不创建workflow registry、候选表、审批流、事件、history或评分平台。
- 不自动从Markdown解析候选，不由Buildr选择业务流程或资产落点。
- 不自动创建/激活Task、修改Rule/Skill/workflow或改变复盘处置。
- 不让Task Retrospective成为Task Development、Finish、cleanup或其他生命周期门禁。

## Decisions

### 1. 执行事实图只保留在Agent当前上下文

Agent按需读取Task Record时点、Development/Review/Verification current摘要、相关Execution Record/Finish timing、工具结果和existing report；只取与成本、重复、等待或恢复有关的最小事实。该有界source map不写入Result以外的store，也不要求读取每个owner、完整日志或隐藏推理。

替代方案是让Application聚合全生命周期事实；这会建立第二套分析authority并扩大读取成本，因此不采用。

### 2. 候选使用语义准入而非固定分类器

可信候选需要满足：存在重复或单次高成本/高风险证据；输入、Owner、停止条件和结果证据可closed；机械部分可幂等恢复；不依赖业务判断；不扩大authority。报告同时说明仍由人和Agent保留的目标、风险取舍与授权。

Skill不强制固定Markdown标题或候选数组。这样既要求Agent主动探索，也保留自由推理和不同任务的表达空间；contract tests只保护关键语义。

### 3. Core哲学是候选过滤器，不是新gate

候选若要求普通工作必须经过Buildr、把建议变唯一合法路径、建立通用许可/生命周期门禁或让状态机替代专业判断，Agent直接丢弃并说明原因。该判断只约束“是否建议固化”，不阻塞当前复盘、Task处置或Agent直接执行。

### 4. 共同确认复用现有讨论与精确mutation授权

处理单份或多份复盘时，Agent语义聚类候选、重新检查当前事实，然后展示证据、边界、收益、风险、建议落点和完整拟Task effects。一人或多人可以在对话或团队协作中给出明确确认；产品不保存新的reviewer/approval对象。只有既有exact mutation授权成立且facts未漂移后，才写Task关系与disposition。

### 5. 落点选择保持Agent判断

价值观/权威边界进入Rule，Agent判断方法进入Skill，固定机械顺序进入Application/CLI workflow，不变量和跨版本约束进入checker/test。候选只提出建议，后续正式Task再按当前事实决定真实Change和实现范围。

### 6. Capability保持v2兼容

增强只增加provider生成/处理报告时的最低语义保证，不改变Result、Effects、Authorization、Decision Points或consumer调用方式，因此保持`buildr.task-retrospective/v2`、provider、binding和Application不变。

## Risks / Trade-offs

- [候选报告变长] → 只在有可信证据时展开；没有候选时允许一句明确结论，不强制模板。
- [Agent把任何建议都称为workflow] → contract与Skill要求closed输入/Owner/停止/证据/恢复及哲学过滤。
- [多人确认被误建模为审批系统] → 只复用现有明确授权语义，不保存reviewer、票数或approval状态。
- [多份复盘聚类扩大读取成本] → 先用bounded list摘要收窄，再对候选来源逐项inspect；不自动全量读取正文。

## Migration Plan

1. 同一Product版本更新v2 contract、builtin Skill、tests与current knowledge。
2. Self-bootstrap验证Product source、workspace projection和Codex runtime一致。
3. 用户Workspace在新版Buildr发布并正常update/sync后取得新guidance；旧Result、disposition与Task关系无需迁移。
4. 回滚只需恢复Skill/contract guidance；没有数据库或持久候选需要清理。

## Open Questions

无。首个来源复盘保持pending，待本Task完成后由用户与Agent按新机制讨论。
