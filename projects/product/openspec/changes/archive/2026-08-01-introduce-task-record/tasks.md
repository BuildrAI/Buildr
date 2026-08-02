## 1. 最小 Task Record 与产品逻辑

- [x] 1.1 新增 `buildr.task-record/v1` closed Domain validator，只包含 Task ID、title、intent、Project/Service scope、`0..N` 个 `project/change` 引用、三态 result 与系统时间
- [x] 1.2 新增 canonical `.buildr/tasks/<task-id>/task.yml` filesystem repository，基于 Git 拓扑拒绝 task worktree target，并以现有 helper 实现完整校验后的精确单文件同目录原子替换；不得把整个 Task 目录纳入 transaction/rollback
- [x] 1.3 实现 list query 与 create/inspect/update/complete/abandon Application，固化默认值、明确字段 mutation、active-to-terminal 转换、终态不可改写和稳定 diagnostics
- [x] 1.4 为 read/result model 计算不持久化的 `recordDigest`，Local App mutation 对 `expectedRecordDigest` fail closed；不在 `task.yml` 加入 revision、锁、自动合并或协同编辑协议
- [x] 1.5 实现 Project/Service/Change registry 校验与当前记录内引用去重；不加入跨 Task Change ownership 扫描或 Environment/专业记录引用

## 2. CLI 与公开 JSON

- [x] 2.1 在 CLI registry 接入 `task create|inspect|update|complete|abandon`，由独立 CLI interface 实现 action-specific flags、输出与稳定退出码；Application 只接收结构化 action input 并返回精确 effects
- [x] 2.2 增加根帮助与 Task Manager 主题帮助，明确五个动作、Task Environment/专业模块边界、无 typed next-state input 和不自动 Git publication
- [x] 2.3 登记包含响应级 `recordDigest` 的 `buildr.task-record-result/v1` public JSON family，增加成功/blocked/语法错误 coverage 与 checkout/npm parity，并确认 digest 不进入 canonical record
- [x] 2.4 更新 `services/buildr/docs/cli-reference.md` 和适用实现文档，保持命令、最小 schema、自举 runtime 激活与专业模块边界一致

## 3. Local App 最小 Task 界面

- [x] 3.1 在全局 Workspace App Shell 增加“任务”核心导航与 `/workspaces/:workspaceId/tasks`、`/workspaces/:workspaceId/tasks/:taskId` 稳定路由
- [x] 3.2 增加 Workspace-scoped Task list/detail/create/update/complete/abandon HTTP API，复用已登记 Workspace 解析、same-origin、session、JSON、body limit、字段白名单与路径拒绝边界
- [x] 3.3 实现中文优先的 Task 列表、空/损坏状态和最小详情，只展示 Task Record 顶层事实，不投影 Environment 或其他专业记录
- [x] 3.4 实现创建与 active Task 编辑表单，所有写入调用 Task Record Application；陈旧 `recordDigest` 冲突要求刷新，不自动合并
- [x] 3.5 实现 complete/abandon 明确确认、summary/reason 与 no-change 选择，说明只更新顶层状态且不执行 Finish/Git/Verification/cleanup；terminal Task 只读

## 4. task-manager Skill 与 task-triage 集成

- [x] 4.1 新增最小 `buildr.task-record/v1` capability contract，明确 consumer obligations、五个 lifecycle action、专业字段禁区、result evidence、Local App client 边界和陈旧页面失败语义
- [x] 4.2 新增 `task-manager` Skill 与 runtime metadata，固定正式 Task Record 正向触发及普通任务/只读探索/Environment/专业动作负向触发
- [x] 4.3 更新 package manifest、workspace baseline Skills manifest、default binding 与 source mappings，原子交付 contract/provider
- [x] 4.4 为 `task-triage` 增加 optional Task Record consumer edge，并在正式持久交付分支首次写入前创建/恢复 Task Record；其他分支保持不依赖
- [x] 4.5 扩展 package static validation 与 runtime fixtures，阻止 description drift、总 dispatcher 越界、专业字段渗入，以及候选 source 写入 retained/peer checkout runtime；允许投射自身任务验证 Workspace

## 5. 分层测试

- [x] 5.1 增加 Domain/Application unit tests，覆盖 closed schema、scope/reference identity、list 与五个 lifecycle action、三态/no-change、终态限制、系统字段和 `recordDigest`
- [x] 5.2 增加 filesystem/CLI fast integration，覆盖基于 Git 拓扑的 canonical Workspace、task worktree target 拒绝、有效重复与目录占用区分、损坏 YAML、陈旧 digest、替换失败和原 bytes 保留
- [x] 5.3 增加 `0/1/N` Change、跨 Project 同名、当前记录重复、其他 Task 同 Change 不扫描，以及 Environment/专业/机器本地字段拒绝测试
- [x] 5.4 增加 Local App API 与 browser tests，覆盖 Workspace 隔离、路径/未知字段/Origin/session/body 拒绝、列表/详情/创建/编辑/终态确认/冲突刷新，并在桌面、1024px 与 390px 视口核对核心交互
- [x] 5.5 增加 task-triage 正式 implementation/change-flow、已有 Task、Local App 已创建 Task、纯讨论/只读与 provider not-ready fixtures
- [x] 5.6 增加 package/runtime/doctor、supported Agent projection 与 checkout/npm tarball/Local App parity E2E，实际覆盖 create → inspect → update → completed/no-change/abandoned/blocked
- [x] 5.7 保留现有 task-worktree、Verification、Task Finish、Board、Asset Review 与 Git 回归，并以同目录专业文件 fixture 直接证明 Task Record 成功/失败路径只拥有 `task.yml`

## 6. 当前认知与 Roadmap

- [x] 6.1 按修订后的 proposal/design/spec 完成 Change Brief、Task/Task Record/Task Manager/Local App 术语核对和 knowledge impact assess
- [x] 6.2 更新 `docs/roadmap/task-lifecycle-architecture.md`：记录最小 v1、P0.1 Local App、逐模块迁移/清退、任务验证 Workspace 与自举激活边界，并增加交付跟踪表和本轮审查结论归属
- [x] 6.3 实现稳定后更新 glossary、overview、`architecture/product.md`、`architecture/technical.md`、`flows/openspec-change-lifecycle.md` 与 `services/buildr.md`，只描述已经实现并投射的当前事实
- [x] 6.4 执行 current knowledge reconcile 与 inspect，将 sidecar 更新为最终 tree identity、changed assets 和全部已处理状态

## 7. 验证与自举激活

- [x] 7.1 对本轮修订后的 Domain/Application/repository、CLI、Local App、Skill/package 逐组运行最小反馈和对应 affected verification
- [x] 7.2 完成源码、自然语言资产和 review 修订后重新运行 OpenSpec strict validation、contract baseline/check 与 current knowledge inspect
- [x] 7.3 在 task environment 使用 receipt-bound candidate CLI、无关临时 Workspace、隔离 Local App preview 与自身任务验证 Workspace runtime 验证候选，不更新 retained 或 peer checkout runtime
- [x] 7.4 本轮修订完成后重新冻结并运行 Product Candidate 验证，记录 candidate/tree/runtime identity、耗时、失败和 cleanup evidence；此前 Candidate evidence 已因实现变更失效
- [x] 7.5 固定自举生效门槛：Task Finish 只有在候选集成到 retained checkout 后，才从 retained `projects/product/buildr` 执行适用 sync/render/doctor，并以 completion receipt 证明 Task Manager、Local App 与更新后的 task-triage 已正式生效；这些交付效果不作为 Finish 前置任务
