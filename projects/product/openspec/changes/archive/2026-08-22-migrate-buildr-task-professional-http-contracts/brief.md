# 迁移 Buildr Task 专业阶段 HTTP 契约

一句话：沿用 Task Record 参考切片，把 Environment、Development、Review、Verification、Retrospective、Finish、Execution Record 与 Parent Coordination 的 HTTP 边界纳入同一套可执行 Schema、生成 DTO 与 typed Client 流水线。

## 背景与问题

P0 已将 Task Record 基础操作的契约 authority 收敛到 Schema、Ajv、生成 DTO 与能力 Client。专业阶段读取与少量写入仍分散在 read executor、handler 和页面局部类型中，字段漂移与错误优先级缺少同一条可检查链路。

## 目标与非目标

- 目标：为已登记专业 operation 提供稳定 Schema/catalog、严格输入校验、显式 DTO mapping、两端生成 DTO、能力级 typed Client 和真实 Contract Test。
- 非目标：不改变 Task 专业 Application/Domain/Persistence/writer/lifecycle，不迁移 Workspace、Agent Assets、Runtime/System 或未登记 operation，不建立全局 completeness gate。

## 受影响用户与角色

- Agent 与开发者可在 Schema、生成检查、typecheck、Contract Test 或正式 build 阶段发现专业 API 漂移。
- Buildr Web 用户继续使用原有 Task Detail 信息架构和交互，但获得稳定的专业阶段数据读取与错误反馈。

## 核心流程

1. Task HTTP owner 登记专业 operation 与 Schema。
2. Buildr 在模块加载时 strict compile，handler/read executor 显式校验并映射到既有 Application authority。
3. generator 从同一 Schema 产生 Buildr/Web DTO，typed clients 将页面与低层 transport 解耦。
4. 真实 HTTP Contract Test、typecheck、正式 web-dist build 与 Task Browser Smoke 验收。

## 关键变化

- 专业 API 新增 Task-owned Schema/catalog 与 generated DTO 投影。
- Retrospective/review handler 与 read executor 复用严格校验并保持既有安全、digest、conflict、terminal 语义。
- 未迁移 API 只输出诊断，不成为无关工作硬门禁。

## 影响、风险与兼容性

路径、payload major、错误 code/status/优先级以及专业 writer authority 保持兼容。主要风险是复杂 read model 字段遗漏和页面类型化范围过大；通过真实 fixture、Contract Test、按能力 client 和有界页面迁移缓解。

## 验收摘要

专业 catalog、generated DTO 无 drift；真实请求/响应/错误契约通过；Buildr 与 Buildr Web typecheck/正式 build 通过；Task Detail 专业 tab 的正式 web-dist 与 Task Browser Smoke 均通过。Task selector fixture 约需 152 秒，因此其测试预算为 300 秒，避免把 fixture 成本误判为页面失败。

## 技术 Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task professional HTTP contracts spec](specs/task-professional-http-contracts/spec.md)
- [Implementation tasks](tasks.md)
