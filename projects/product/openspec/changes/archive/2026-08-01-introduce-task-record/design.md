## Context

当前 Buildr 用同一个自然语言“task”描述多种彼此独立的事实：task worktree receipt 保存环境身份，Verification/Finish 保存专业执行证据，Board 保存跨任务规划，Agent host 也把对话称为 task 或 thread。它们没有共同的正式 Task authority，Agent 更换 session 或 checkout 后只能从分散文件推断意图、范围和顶层结果。

P0.1 需要先提供后续 Environment、Review、Verification Result、Development、Candidate 和 Finish 能共同引用的稳定 Task ID，但第一版不应预先建设通用协同编辑协议、跨记录所有权、publication 状态或专业模块引用目录。用户进一步明确：能确定性固化的创建、校验、状态转换和文件写入应由产品实现，不能把完整 YAML 和合法迁移持续交给 Agent 推理。

当前产品已有 Workspace/Project/Service registry、YAML parse/render、filesystem helper、CLI registry/help、公开 JSON schema、Skill capability contract、runtime projection，以及以已登记 Workspace 身份隔离请求的全局 Local App。实现沿用这些分层；Task Record 不进入现有 worktree、Verification 或 Finish executor。Local App 不是另一套 Task writer，而是与 Skill/CLI 共用 Task Record Application 的人类客户端。

## Goals / Non-Goals

**Goals:**

- 建立 Workspace 内稳定、可恢复的正式 Task identity 与唯一 `task.yml` authority。
- 交付名为 `task-manager` 的薄 Skill，并让 `task-triage` 在正式持久交付分支创建或恢复 Task Record。
- 由产品实现五个明确动作、字段校验、引用解析、合法状态转换和安全写入。
- 在 Local App 提供最小 Task 列表、详情、创建、编辑、完成和放弃，并复用同一 Application 与 Workspace 安全边界。
- 只保存首版真正需要的顶层事实，并明确禁止 Task Environment 与其他专业记录内容。
- 支持 `completed + no-change`，且不虚构 Environment、Candidate、Review、Verification 或 Finish。
- 让 P0.1 在实现、集成并 render 后直接成为 Task Record authority；后续按模块逐步替换旧 authority。

**Non-Goals:**

- 不实现或记录 Task Environment、Development、Candidate、Review Result、Verification Result、Finish Receipt、Task Board、Retrospective 或 metadata publication。
- 不建设统一 Task Core、总调度器、数据库、锁、租约、事件总线、后台 daemon、跨文件事务、协同编辑或自动合并。
- 不为持久 Task Record 增加 revision、协作者 identity、Board/Task 关系、blocker、专业记录引用或富文本 Overview；陈旧页面检测使用不持久化的内容摘要，不扩张 v1 schema。
- 不在 P0.1 的 Local App 投影 Task Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective；这些内容按后续模块交付。
- 不扫描其他 Task Records 争夺 Change ownership，不承诺跨 Task Change 唯一归属。
- 不自动把每次用户请求、对话、只读探索或临时操作转换为正式 Task。
- 不从未合并 task checkout 更新 retained self-bootstrap Agent runtime。

## Decisions

### 1. Skill 名为 Task Manager，数据模型仍名为 Task Record

workspace Skill id 使用 `task-manager`，中文称“任务管理器（Task Manager）”；持久模型和 capability 继续使用“任务记录（Task Record）”与 `buildr.task-record/v1`。

Task Manager 只匹配 Agent 创建、查看、修改或结束正式 Task 顶层记录，以及按 Task ID 恢复这些事实。它不是所有任务的 dispatcher，也不执行 Triage、Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective。`task-record` 作为 Skill id 过于像底层存储操作，`task` 又过宽，`task-manager` 更能表达一个有边界的 Agent 管理入口。人的对应入口是 Local App；二者共享产品 Application，不互相调用。

### 2. Task Manager 不拥有专业模块目录

Task Record 不保存 Environment path、worktree/branch、runtime、CLI、依赖、进程、端口、资源、receipt revision，也不保存任何 Development、Review、Verification、Finish、Board 或 Retrospective reference。后续模块均通过同一个 Task ID 和自己确定的 canonical 路径发现、维护并解释专业事实。

这样 Task Manager 不需要预知后续 schema，也不会成为专业记录索引或第二份 authority。Local App 以后需要聚合时，由各模块 reader 按 Task ID 读取，而不是要求 Task Record 复制引用。

### 3. v1 schema 只保留十类首版事实

```yaml
schemaVersion: buildr.task-record/v1
taskId: introduce-task-record
title: 建立任务记录基础
intent: 为正式 Task 建立稳定、最小、可恢复的顶层记录
scope:
  projects:
    - product
  services:
    - project: product
      service: buildr
changes:
  - project: product
    change: introduce-task-record
status: active
result: null
createdAt: 2026-08-01T10:00:00.000Z
updatedAt: 2026-08-01T10:00:00.000Z
```

终态时 `result` 保存简短 `summary`；`completed` 另外保存 `noChange: true|false`，`abandoned` 不使用 `noChange`。

| 字段 | v1 决定 | 理由 |
|---|---|---|
| `schemaVersion` | 保留 | 低成本阻止未来 writer 静默改写不认识的格式 |
| `taskId` | 保留 | 串联 Task 生命周期的稳定主标识 |
| `title` / `intent` | 保留 | 提供人和 Agent 恢复顶层目标所需的最小语义 |
| `scope.projects/services` | 保留 | 表达真实业务影响面，并由 registry 校验 |
| `changes` | 保留 | 支持 `0..N` 个已存在 Change；`project/change` 足以消除跨 Project 同名歧义 |
| `status` / `result` | 保留 | 表达 active、完成、放弃和 no-change 的最小顶层处置 |
| `createdAt` / `updatedAt` | 保留 | 提供基础审计与排序，不要求 Agent 生成 |
| `revision` | 不持久化 | 唯一 writer 仍是 Task Record Application；Local App 的陈旧页面问题用响应级 `recordDigest` 处理，不把传输前置条件写成领域字段 |
| `workspaceId` | 删除 | 文件已经位于一个 canonical Workspace，重复 identity 没有首版收益 |
| `executionOwner` | 删除 | 当前没有 canonical 协作者 identity，不能从 Agent、session 或 Git author 猜测 |
| `boardId` / `relations` | 暂缓 | 属于后续 Board/continuation 设计，不是首版 Task Record 必需事实 |
| `blocker` | 删除 | 阻塞原因属于当前专业结果或交互，不是 Task 顶层状态 |
| `records` / `overview` | 删除 | 专业模块按 Task ID 自行发现；富摘要会迫使 Agent反复生成并形成第二份解释 |
| publication/storage 状态 | 删除 | Git 共享由 P0.7 拥有，P0.1 不建 `portable/unpublished/local-only` 模型 |

schema 仍为 closed schema，不提供结构化字段保存 worktree、branch、runtime、进程、端口、凭证、完整日志或任意 Environment/专业记录。v1 只按字段形状确定性校验，不用启发式扫描 title/intent/result 的自然语言；这是模块边界，不引入“portable 内容”分类。

### 4. Task Record Application 拥有 mutation 与状态转换

公开入口为：

```text
buildr task create <task-id> --title <text> --intent <text> [scope/change flags] [--target <canonical-workspace>] [--json]
buildr task inspect <task-id> [--target <canonical-workspace>] [--json]
buildr task update <task-id> [metadata/scope/change flags] [--target <canonical-workspace>] [--json]
buildr task complete <task-id> --summary <text> [--no-change] [--target <canonical-workspace>] [--json]
buildr task abandon <task-id> --reason <text> [--target <canonical-workspace>] [--json]
```

`create` 固定生成 active 状态和系统时间；`update` 只修改 active Task 的标题、意图、scope 或 Change 引用，并要求至少一个明确 setter/add/remove field operation；`complete` 与 `abandon` 是唯一终态转换；`inspect` 只读。Application 负责读取最新记录、合并明确字段、校验完整结果并写回，客户端不提交任意 patch 或完整 next-state document。

Task ID 仍由调用方提供，产品只执行稳定字符与冲突校验。通过 Agent 开始工作时，是否已经形成正式 Task、标题和意图是什么，仍需要 Agent 理解用户语义；人也可以在 Local App 中直接表达这些事实。无论入口为何，一旦进入记录生命周期，格式、默认值、引用解析、合法动作和错误结果都由产品确定。

`task-manager` Skill/CLI 和 Local App 都是 Application client。Skill 负责 Agent routing、必要语义交接和 result evidence；CLI interface 负责 action-specific 参数解析、输出与退出码；Local App 负责人的可视化输入与明确确认；三者都不得把接口适配混入 Application，也不得直接访问 filesystem repository。

### 5. Local App 提供最小 Task 展示与管理

P0.1 将“任务”加入 Workspace 核心导航，并提供两个稳定页面：`/workspaces/:workspaceId/tasks` 列表和 `/workspaces/:workspaceId/tasks/:taskId` 详情。列表展示 Task ID、标题、意图、Project/Service scope、status 与更新时间；详情展示完整最小 Task Record，不聚合任何尚未交付的专业记录。

Local App 通过 Workspace-scoped API 调用同一 Application：

```text
GET  /api/v1/workspaces/:workspaceId/tasks
POST /api/v1/workspaces/:workspaceId/tasks
GET  /api/v1/workspaces/:workspaceId/tasks/:taskId
PATCH /api/v1/workspaces/:workspaceId/tasks/:taskId
POST /api/v1/workspaces/:workspaceId/tasks/:taskId/complete
POST /api/v1/workspaces/:workspaceId/tasks/:taskId/abandon
```

页面可以创建 Task、编辑 active Task 的 title/intent/scope/Change references，并通过明确确认完成或放弃 Task。终态确认必须说明该动作只更新顶层 Task Record，不执行 Finish、Git、环境清理或专业验证；terminal Task 只读。第一版不增加搜索、批量操作、关系图、Board、专业结果卡片或独立前端状态模型。

HTTP interface 继续只接受已登记 `workspaceId`，在调用 Application 前解析真实 canonical root，并拒绝 query/body 中的 `target`、`root`、`path` 和未知字段。所有 mutation 复用现有 same-origin、session token、JSON content type、body size 与字段白名单校验；Web feature 不读取或写入 Workspace 文件。

### 6. canonical 文件与首版写入安全

每个 Task 的唯一 authority 固定为：

```text
<canonical-workspace>/.buildr/tasks/<task-id>/task.yml
```

命令的 `--target` 必须是 canonical Workspace；从 task environment 调用时，由调用方或 Environment provider 提供 canonical Workspace target。Task Manager 不读取 environment receipt，不从 worktree 猜测 retained root，也不把任何环境 identity 写入 Task Record。Git Workspace 通过 `git-dir` 与 `git-common-dir` 的真实拓扑区分 retained checkout 与 linked worktree，不依赖 `.worktrees` 目录名或 `.git` 文件形状；没有 Git 的已初始化 Workspace 仍可作为 canonical target。

Task Record repository 的 ownership 精确到 `.buildr/tasks/<task-id>/task.yml`。`create` 以排他目录创建保证不覆盖已有有效记录；Task 目录已存在但没有有效 `task.yml` 时返回稳定的 occupied/corrupt 诊断，不移动、删除或覆盖同目录的 Environment、Review 等专业文件。`inspect` 和 mutation 遇到损坏 YAML、不支持 schema、目录名/`taskId` 不一致或引用无效时 fail closed。更新先读取磁盘最新记录，在内存中形成完整合法记录，再使用现有 filesystem helper 做 `task.yml` 同目录临时文件与原子替换；这是防止半写文件的内部实现细节。

Application 读取有效记录时同时基于 canonical bytes 计算 `recordDigest`，但不写入 `task.yml`。Local App 的 update/complete/abandon 必须以 `expectedRecordDigest` 携带页面读取到的摘要；Application 在 mutation 前发现不匹配时返回 `task_record_conflict`，页面要求刷新，不覆盖、不自动合并。CLI action 在一次调用中读取最新记录并应用明确 field operation，不要求 Agent 推理或持久化 digest 协议。

这个机制只处理陈旧页面，不承诺多人协同编辑、跨进程锁、租约或语义 merge。同目录原子替换仍只防止半写文件；Task Record 不使用整个 Task 目录的 workspace mutation、快照或回滚，因为这些机制会越过 `task.yml` ownership 并可能改写后续专业模块文件。无法证明写入前置条件时 fail closed。

### 7. Change 引用只做本记录内限定与去重

Change 引用形状固定为 `{project, change}`。添加时产品通过 Project registry 定位该 Project 的 OpenSpec root，确认 Change 已存在，并在当前 Task Record 内去重。空列表、单个和多个引用都合法；跨 Project 同名 Change 通过 `project` 区分。

P0.1 不扫描 `.buildr/tasks/*`，不声明一个 Change 只能属于一个 Task，也不因其他损坏记录阻塞当前更新。跨 Task ownership 只有在 Task Development 或并发实践出现真实冲突后再设计。

### 8. Task Record 在 P0.1 交付后直接激活

`task-triage` 增加对 `buildr.task-record/v1` 的 optional capability dependency。Triage 仍负责判断讨论、只读探索、当前事实维护、已有契约实现或 Change Flow；当结论即将进入正式持久交付时，它必须在首次交付写入前调用 selected provider 创建或恢复 Task Record。路径已经明确而跳过 Triage 的正式执行，也必须先确保 Task Record 存在。

这不是 preview：P0.1 集成并 render 后，新的正式 Task 使用 Task Record 作为顶层事实 authority。现有 Environment、Verification、Finish、Board 和 Asset Review 仍各自维护当前专业事实，因为 P0.1 没有拥有这些内容；它们不是 Task Record 的平行 writer。

### 9. 旧能力按模块到达时立即迁移或删除

不再等待 P0.8 做统一 authority 切换。每个后续模块 Change 同时完成：

1. 实现并验证新模块；
2. 识别与该模块事实重叠的旧 authority、routing、binding、CLI、store 和测试；
3. 迁移仍必须保留的活跃事实或提供明确历史只读入口；
4. 切换该模块的 consumer/routing；
5. 删除或使旧 mutation path 不可达，并迁移仍有效的安全不变量测试。

P0.2 处理旧 task-worktree/environment authority，P0.4 处理当前 Verification lifecycle，P0.6 处理旧 Git capabilities，P0.8 处理固定五阶段 Finish，P1 处理静态 Board，P2 Retrospective 处理 Asset Review。P2 最后只做残留审计，不积压前面模块已经知道的清退工作。

### 10. 候选运行时验证与 retained runtime 激活分离

task worktree/branch 中的源码、Skill、contract、manifest 和 generated package 都是本 Task 的候选变更。开发阶段可以把候选 source sync/render 到同一个 task worktree 所承载的任务验证 Workspace，并在该根下测试 workspace-scoped Agent runtime；也可以在任务验证 Workspace 或无关临时 Workspace 内创建隔离的模拟用户目录，验证 user destination 的投射逻辑。这些都只是候选验证，不是 retained runtime 或真实用户 runtime 生效。候选 source 不得写入共享同一 Git common-dir 的 retained checkout、另一个 task worktree 或验证 Workspace 之外的用户级共享 runtime，产品用 source/target checkout 拓扑与 runtime target 路径关系在写入前阻止这些路径。与源仓库无关的临时 Workspace 仍可用于 package parity 验证。

候选实现、审查和验证完成并集成到 retained checkout 后，必须从 retained `projects/product/buildr` 执行适用的 sync/render/doctor；只有受管 runtime source identity 与 retained source 对齐且专项验证通过，Task Manager 和更新后的 task-triage 才算在自举 Workspace 正式生效。Environment Receipt、任务级 Agent 会话采用证明和验证结果与运行时 identity 的绑定属于 P0.2/P0.4，不扩进 P0.1 Task Record。

## Risks / Trade-offs

- [风险] `task-manager` 仍可能被理解为总调度器。→ description、contract 和负向 fixtures 明确只管理 Task Record，任何 Environment/专业阶段逻辑进入都使 package verification 失败。
- [风险] Agent/CLI 与 Local App 可能基于不同时间读取同一 Task。→ `task.yml` 不持久化 revision；Application 以响应级 `recordDigest` 拒绝陈旧页面写入，不提供自动合并或协同编辑承诺。
- [风险] 人在 Local App 过早完成或放弃 Task。→ 终态操作要求明确确认并说明只更新顶层状态，不执行 Finish、Git、验证或 cleanup；后续 Finish 模块可以在自己的 Change 中增加可确定的完成门禁。
- [风险] Task Record 不保存专业引用，聚合读取需要知道各模块规则。→ 每个专业模块以同一 Task ID 和自己的 contract 暴露 reader；避免中央记录耦合所有 schema。
- [风险] `project/change` 不强制跨 Task 唯一。→ 当前只保证引用可解析且本记录内无重复；在拥有实际 ownership 语义的模块中再决定是否需要唯一约束。
- [风险] 分模块切换会形成新旧模块混合期。→ 每类事实始终只有当前 owner；每个模块 Change 当场移除重叠 mutation path，并用跨模块 E2E 验证边界。
- [风险] Task Record 写失败时目录级回滚误伤后续专业文件。→ repository 只拥有并替换 `task.yml`；创建失败只清理本次排他创建且仍为空的目录，已有或未知 sibling 一律保留。
- [风险] worktree 中测试通过但 retained runtime 未激活。→ 允许候选投射自己的任务验证 Workspace，同时阻止跨 checkout runtime target；retained integration 后的 sync/render/doctor 仍是独立正式激活证据。

## Migration Plan

1. 新增最小 Task Record Domain/Application/filesystem repository、CLI interface、五个明确动作和响应级 `recordDigest`，以临时 Workspace fixture 验证 schema、引用、状态、陈旧写入、目录占用、精确文件 ownership 与失败边界。
2. 新增 `buildr.task-record/v1` contract 和 `task-manager` Skill，修改 `task-triage` package source/manifest，使正式执行分支消费 selected provider。
3. 增加 CLI help、registry、public JSON coverage、checkout/npm parity 与 routing 正负 fixtures。
4. 在现有 Local App 增加 Workspace Task 导航、列表/详情、受控 create/update/complete/abandon API 与 UI，并完成浏览器尺寸、写安全和陈旧页面测试。
5. 更新 Change Brief、glossary、overview、产品/技术架构、OpenSpec lifecycle flow、Buildr Service 文档和 Roadmap 交付跟踪。
6. 在候选自己的任务验证 Workspace 和无关临时 Workspace 验证 runtime/package，并阻止候选 source 写入 retained/peer checkout；完成 affected/Candidate 验证和集成后，从 retained checkout sync/render Agent runtime 并执行 doctor/专项验收。不迁移历史专业 records，也不创建双写路径。

## Open Questions

无。`task-manager` 命名、Task Environment 排除、最小持久 v1 schema、Task Record Application 与 CLI interface 分层、Local App 最小展示与管理、非持久 `recordDigest`、精确 `task.yml` ownership、无跨 Task Change 唯一/publication 分类、逐模块迁移和候选/retained runtime 边界均已确认。任务验证 Workspace、Environment Receipt、运行时采用证明和 Candidate identity 的细化由后续 owner 模块完成。
