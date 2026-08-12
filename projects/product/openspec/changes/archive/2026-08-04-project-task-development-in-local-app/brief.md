# 在 Local App 投影任务研发信息

## 一句话摘要

让用户在任务详情中直接看懂任务是否已形成候选、能否推进及其审查和验证依据，同时保持各专业模块独立、只读和中文优先。

## 背景与问题

任务研发已经拥有候选、三个门禁、推进决定和研发交接的唯一 Application read model，但 Local App 仍只有“概览、环境、审查、验证”四个并列页签。用户无法从页面判断当前候选和交接是否就绪；若直接增加第五个页签，还会继续扩大模块型导航。任务详情同时存在 `Task Record`、`current Result`、`Cleanup` 等英文主标题或中英混杂表达。

## 目标与非目标

目标是把一级导航收敛为“概览、研发、证据、环境”，增加只读研发投影，把审查和验证组合到证据页，并收敛当前任务详情文案。非目标包括 Development 写操作、公共 CLI、新状态机、Board、Task Finish、Retrospective、全站术语重构和持久 schema 变更。

## 受影响用户或角色

- 在 Local App 查看正式 Task 当前交付准备情况的人
- 通过 Agent 推进任务研发、审查、验证和收尾的维护者
- 维护 Local App 与 Task lifecycle authority 边界的 Buildr 开发者

## 核心流程

1. 用户打开 Task 详情，概览仍只展示 Task Record。
2. 用户进入“研发”，页面通过 Development Application `inspect` 展示当前结论、输入轴、候选、门禁、决定和最近交接。
3. 用户进入“证据”，页面分别读取 Task Review 与 Task Verification Application，展示完整专业结果并保留现有 Agent Action。
4. 用户进入“环境”，页面继续读取当前机器的 Task Environment facts。
5. Environment 已清理或观察失败时，研发页保留历史 Receipt 摘要并明确说明当前未实时复核。

## 关键变化

- 新增 Workspace-scoped Task Development 只读 GET
- 用只读投影要求替代 canonical spec 中“首版不得增加 Local App surface”的过时要求，继续禁止公共 CLI 与写操作
- Task 详情从模块型四页签调整为信息型四页签
- Review/Verification 从两个一级入口变为同一证据页的独立区块
- 随包 `task-development` Skill 明确 Local App 仅消费 Application `inspect` 只读投影，仍无公共 CLI 或 Development 写操作
- 任务详情使用纯中文或“中文（English Term）”主称
- 无新 writer、无数据迁移、无生命周期聚合状态

## 影响、风险与兼容性

Task 详情 URL、Task Record 操作、Review/Verification API 和 Agent prompt contract 保持兼容。主要风险是证据 reader 部分失败和 Environment 不可观察时的状态误读；页面通过独立诊断和“历史保留但未实时复核”文案消除歧义。

## 验收摘要

- 一级页签只有“概览、研发、证据、环境”
- 研发 missing/current/unknown 均有可理解展示，且无浏览器写操作
- 证据页同时保留两个 Review 槽位、一个 Verification Result 与既有 Agent Action
- HTTP/Web 不直接读取专业文件或计算 currentness
- 任务详情不存在本次已识别的英文-only 主标题，1024px 与 390px 无横向溢出

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Development delta](specs/task-development/spec.md)
- [Task Record delta](specs/task-record/spec.md)
- [Local Workspace Application delta](specs/local-workspace-application/spec.md)
- [Tasks](tasks.md)
