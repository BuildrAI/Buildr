## Context

前序 Child 已把 Task/Environment 准入、Finish 正交结果、Development evidence 与 Workspace 局部诊断收敛为专业 authority。当前协调层的主要问题不是缺少状态，而是人机边界和读取方式仍不一致：Declaration Intake 把 routine 声明维护与改变长期适用性的决策混为一谈；Task Overview 只暴露专业内部字段；Task、Project 与 Service 页面各自解析 Markdown 链接。

Parent Contribution 进度的四项摘要、紧凑横向行、Child 导航与详情侧栏已完成浏览器验收，本 Change 将其视为稳定基线，不重新设计。

## Goals / Non-Goals

**Goals:**

- 只有真实独立交付单元才进入正式 Parent/Child；普通 Agent 协作保持轻量。
- routine Declaration maintenance 在已授权 Task scope 和现有长期适用性内由 Agent 完成，只有范围、能力承诺或危险效果变化才请求用户决定。
- Task Overview 从同一条 SQLite 查询已取得的专业 current payload 中派生用户摘要，Web 不重算 authority。
- Task、Project 与 Service 页面共享一套 Workspace 相对 Markdown 引用解析和安全打开语义。

**Non-Goals:**

- 不实现 legacy Parent backfill/correction、terminal Task correction、自动迁移或通用 UI writer。
- 不新增聚合表、文档附件表、声明 writer 或前端全局 Store。
- 不改变已验收 Parent Contribution 页面信息架构。
- 不让只读 Overview 或文档打开执行 Git、Environment probe、声明解析或 filesystem scan。

## Decisions

### 1. 以独立交付契约判断正式 Child，而不是以并发人数判断

正式 Child 必须具有可单独说明的 Contribution、scope、Candidate/evidence、immutable Handoff 和 Delivery。并行调查、代码检索、局部测试或同一交付内的实现分工仍由 Agent 自由组织，不创建 Task Record、Parent binding 或 Contribution Handoff。

备选方案是“每个协作者一个 Child”；这会把临时编排固化为长期治理事实，并制造无意义 Finish，因此不采用。

### 2. Declaration 写入授权按语义变化分类

Intake 仍先只读发现并展示精确 diff。若 diff 只是让声明追上 scope 内已经确认、已有 wrapper/lockfile/测试入口可证明的 routine 事实，且不新增 scope、required capability、外部效果或安全例外，Agent 可在当前用户目标授权下交给专业 owner 写入并验证。新增/删除 scope、改变 applicability/requiredness、引入 capability 或外部效果、证据冲突时必须请求用户精确决定。

备选方案是继续要求所有声明 diff 人工确认；它保护的是内部流程而非危险不变量，会把 routine maintenance 变成用户负担。

### 3. 用户摘要属于 Task Overview response，不属于 Web 推断

Repository 继续使用一个 read-only connection 和一条参数化 `LEFT JOIN`。查询额外读取 compact Finish `payload_json`、Environment receipt payload 与 Development applicability 中已经保存的字段；Application 只投影：目标、Delivery、Activation、Cleanup、attention、authorization。它不复制完整 Result，也不做外部 observation。

Web 只渲染这个 closed summary。内部 outcome、digest、gateMatch 和时间仍保留在默认折叠的技术事实区域。

备选方案是在 React 中拼接 Development、Environment、Finish tabs；这会形成第二套状态解释并产生竞态，因此不采用。

### 4. 文档引用使用共享纯函数解析，正文读取继续归 Project Document API

共享 resolver 规范化具名 Workspace 相对 `.md` 链接，根据 current registered Project `source.path` 和调用页面 scope 选择最长匹配 Project，并输出稳定 reference。Task、Project 与 Service 页面复用该 resolver；文档内相对链接也通过同一规范化核心处理。

“可解析”只证明引用语法与 scope 合法；只有 Project Document API 成功返回正文才显示“当前可读取”。缺失或读取失败不改写引用、不扫描 Workspace，也不升级为 Task lifecycle failure。

备选方案是新增 Workspace 任意文件 API；它扩大读取边界，没有必要。

## Risks / Trade-offs

- [routine 与长期决策分类过宽] → 使用 closed 条件；scope、requiredness、capability、外部效果或证据冲突任一变化都要求用户决定。
- [compact payload 兼容旧 terminal row] → Overview 对缺失字段返回 `unknown/not-applicable`，不猜测成功。
- [共享 resolver 改变旧链接行为] → 保留 Task scope 最长路径匹配和 Project 内相对链接测试，并覆盖 root/attached/nested source。
- [用户摘要隐藏诊断细节] → attention 保留人类摘要和专业来源；完整技术事实仍可展开或进入专业 Tab。

## Migration Plan

先更新 specs、Skill source、Overview read model 与测试，再更新 Buildr Web 和 tracked `web-dist`。无需 SQLite migration；旧 current rows按兼容缺失语义展示。回滚代码与前端构建即可恢复旧读取方式，专业 current facts 不受影响。

## Open Questions

无。Parent Plan 已明确排除 legacy correction 与自动迁移，既有 UI 基线也已验收。
