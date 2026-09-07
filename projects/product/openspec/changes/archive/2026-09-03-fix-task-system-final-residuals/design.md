## Context

当前 `origin/dev` 已删除 Task Overview、Task Environment、Task Development、旧 Finish、Task Execution Record 与内部任务候选/交接链；Workspace SQLite migration 31 的当前任务表只有 `tasks`、`task_review_current` 和 `task_verification_current`。但若干 canonical specs 和 current knowledge 仍正向要求已退役能力，部分文档还指向已经迁移为 TypeScript 的 `.mjs` 路径。实现侧，Task Review 已有事务内摘要比较，而 Task Verification 仍是无条件 upsert；Task Record CLI 读取会重新验证所有历史 Project/Service，Buildr Web 详情使用的轻量视图却不会，导致同一记录不同入口不一致。

本次同时触达 Buildr Service、Buildr Web、SQLite current、CLI/HTTP/DTO、Skills、测试和 OpenSpec，因此需要一个跨模块 Change。用户已经明确授权实现、验证、交付、自举和子任务收尾；不需要新增产品目标或数据删除决定。

## Goals / Non-Goals

**Goals:**

- 让当前规范、知识、帮助、实现和测试只描述真实存在的任务能力。
- 为 Task Verification current 建立与 Task Review 同等级、但互不依赖的摘要比较与原子替换安全。
- 让结构有效的 Task Record 始终可读，并把外部引用可用性限制为响应级诊断。
- 让 Web 默认聚焦未结束任务，同时保留终态筛选、竞态保护与空状态语义。
- 完成 `src/task` 保留能力的严格 TypeScript 类型收敛。

**Non-Goals:**

- 不恢复或替换任何已退役任务模块，不创建聚合任务流程、统一状态机、许可层、历史平台或第二事实源。
- 不改变 Product/Release Candidate、发布流程、Task Triage Git 基线或全部 Skills 的整体结构。
- 不修改已归档 Change、已应用 migration 字节或 legacy fixture；不删除 SQLite 业务数据。
- 不让 Review 或 Verification 成为 Task 完成前置，也不完成父任务 `refactor-task-system`。

## Decisions

### 1. Verification 使用调用参数摘要，不改变报告模型

CLI `task verification record` 新增必填 `--expected-report <absent|sha256-digest>`；Application 输入使用 `expectedReportDigest`，但构造并持久化的 Verification Report v1 不含该字段。Repository 在序列化成功后打开 writable store，以 `BEGIN IMMEDIATE` 锁定写事务，读取并验证 current，计算 `absent|sha256`，不匹配即返回 `task_verification_current_conflict` 和 `currentReportDigest`；匹配才 upsert、写后回读完整查询字段、提交。

选择这一方式是因为它复用现有 inspect `reportDigest`，不需要 revision/history/lease。备选的持久化 revision 会复制摘要身份并扩大 schema；Application 先读后写则无法关闭两个进程之间的竞态。

### 2. Task Record 将结构读取与引用可用性分开

Repository 继续只负责 SQLite Task Record 结构和关系读取。Application 对每条记录计算响应级 `referenceDiagnostics`：Project、Service 和 Change 各自独立解析，失败只产生带引用 identity 的局部诊断。CLI inspect、HTTP detail、列表项与专业模块共享同一可读顶层事实；诊断不写回 Task Record。

创建时校验全部新引用；更新时只校验真正新增的 Project、Service、Change 与 Parent。移除失效引用、标题/意图等无关更新不重新校验保留的旧引用。备选的统一 `blocked`/健康字段会污染业务事实；自动删除或修复引用会制造未经授权的数据变化。

### 3. Web 默认值只属于客户端

`TasksPage` 的已应用状态和筛选草稿默认均为 `open`，清除筛选恢复 `open`；服务端省略 `status` 仍返回 `all`。选择 `pending-decision|decided` 时草稿状态自动切换为 `all`。现有 generation + AbortController 继续作为请求竞态边界，并增加真实浏览器断言证明旧响应不能覆盖新筛选结果。

详情页只保留一个 `id="task-detail-id"`，其他展示改用 class 或独立 ID。不会进行视觉重设计或引入新页面。

### 4. 严格 TypeScript 复用领域类型，不新增平行 DTO

为 Review、Verification、Parent Coordination 的领域结果、持久化行、Application 输入/输出、CLI runtime 和模块 port 定义可复用的本地类型；外部 JSON 从 `unknown` 进入现有 closed normalization。模块组装使用交叉 port 类型或已导出的 runtime interface，不建立第二套 Domain 模型。生成 HTTP DTO 仍由现有 schema 单源生成。

### 5. 规范清理区分当前契约与历史证据

删除当前 canonical specs 中要求创建/读取/GC Execution Record、要求 Development/Parent Plan/Handoff/旧 Finish 协作或错误实现路径的 Requirement；保留精炼的负向退役要求。归档 Change、连续 migrations 与 legacy migration tests 原样保留。新增静态检查只扫描当前 specs、knowledge、docs 与 runtime/test ownership 映射，不扫描 archive 和明确 legacy fixture。

## Risks / Trade-offs

- [Verification 调用方升级遗漏] → CLI 将摘要设为必填并更新 Skill、help、测试 helper 和所有仓内调用；缺失时零写入稳定失败。
- [局部诊断数量使列表变大] → 每个引用只返回短 code、kind、identity 和 message，不读取文件正文，不增加持久化字段。
- [旧 Task 引用已经失效] → 读取继续成功；只有依赖对象的动作或新增同类引用失败，不自动掩盖历史事实。
- [大范围 TypeScript 修改引入行为回归] → 保留 normalization/SQL/公开 JSON 结构，分层运行 typecheck、unit、integration、browser、fresh/upgrade、DTO drift 与 package/static。
- [规范删除误伤历史语义] → 只修改非归档 canonical/current 文档；migration 与 legacy fixture 由静态检查排除。

## Migration Plan

1. 先完成 delta specs、Brief 和知识影响评估，通过 strict validation 与 convergence preflight。
2. 实现 Verification 摘要保护、Task Record 局部诊断、Web/CLI 修正与 TypeScript 收敛；同步 DTO、Skills、测试和 current knowledge。
3. 运行定向及 changed/package 验证，再执行 OpenSpec converge，使 canonical specs 原子更新并归档 Change。
4. 精确提交并推送 `origin/dev`，回读远端；matching Task 获得交付结果后运行唯一自举 runner，最后登记任务结果并安全清理 Worktree。

回滚不修改数据库 schema 或业务数据；实现回滚可通过后续普通提交恢复代码，但 Verification 旧调用方不能绕过并发保护。Convergence 若中断按 Receipt inspect 恢复，不手工覆盖 canonical specs。

## Open Questions

无。响应级诊断字段采用 `referenceDiagnostics`，Verification 调用参数采用 `expectedReportDigest` / `--expected-report`，均在本 Change 内闭合。
