## 1. Result Domain、Repository 与 Application

- [x] 1.1 新增 closed `buildr.task-review-result/v1` Domain validator/renderer，覆盖统一 schema、两种 reviewType、三种 method、两种 outcome、最小 reviewed/uncovered/findings 与系统 completedAt
- [x] 1.2 新增 `.buildr/tasks/<task-id>/reviews/planning.yml|completion.yml` repository，验证正式 Task/type/path identity、可选读取、canonical bytes digest、精确文件 ownership 与 portable Git tracking
- [x] 1.3 实现同目录临时文件加原子替换，覆盖输入/serialization/rename/post-read 故障时旧 current bytes、另一 slot 与全部 sibling records 保持不变
- [x] 1.4 实现共享 Task Review Application `inspect|record`，只允许 active Task record、terminal Task inspect，并返回两个 slots、resultDigest、diagnostic、effects 与 nextActions
- [x] 1.5 实现 `current|stale|unknown|null` target applicability 比较，拒绝缺少 target identity 的 record，尤其不得为 Completion 生成伪 Candidate identity
- [x] 1.6 增加 Domain/repository/Application unit tests，覆盖零 Result、单/双 slot、unknown fields、无 revision、同类型覆盖、跨类型隔离、中断/故障与 target mismatch

## 2. CLI 与公共 JSON

- [x] 2.1 注册薄 `buildr task review inspect|record <task-id>` CLI、参数校验、退出码与 topic/action help；CLI 不执行 Review、不接受 caller path/next-state/system fields
- [x] 2.2 登记并校验 `buildr.task-review-operation-result/v1` public JSON family，固定两个 slot、response-only resultDigest、applicability、diagnostic/effects/nextActions
- [x] 2.3 增加 checkout CLI integration、npm tarball parity、help/command registry/JSON registry tests，覆盖成功、blocked 和 stdout 单对象契约

## 3. Skill、Capability 与 Package Authority

- [x] 3.1 新增最小 `buildr.task-review/v1` capability contract，明确语义 Skill/确定性 Application 分工、执行方式真实性、可选双槽位、中断不写入与非目标
- [x] 3.2 新增一个 `task-review` Skill/Agent metadata，以 planning|completion 参数动态选择 reviewed/uncovered，不硬编码 OpenSpec 或测试清单，不拆成两个 provider
- [x] 3.3 更新 source/package/workspace manifests、default binding 与独立 Skill runtime mapping，使 checkout/package/runtime 使用同一 contract、Skill 和 Application identity；不向通用 Buildr Skill 增加重复意图路由
- [x] 3.4 扩展 package static validation/residual gate，拒绝第二个 Task Review writer/store、类型专属 capability、Task Record/Environment Review 字段和正式 Task route 绕过
- [x] 3.5 保持 `task-asset-review` v3 provider、observation store 与 Task Finish optional dependency 不变，并增加 capability graph/contract test 证明两种 review authority 独立

## 4. Local App 与 Task-scoped Review Route

- [x] 4.1 新增 Workspace-scoped 只读 `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/reviews`，只调用 Task Review Application inspect，拒绝 query/path/target/root 与未知 Task
- [x] 4.2 在 Task 详情增加独立“审查”页签和两个 slot cards，展示 missing/present、current/stale/unknown、target/method/time、coverage、findings 与 conclusion，不修改 Task Record UI writer
- [x] 4.3 增加 Planning/Completion 的 Agent action，Local App 只生成带 Task ID/reviewType 的 prompt，不直接 record/edit/delete Result
- [x] 4.4 将 Task-scoped Change detail 的审查按钮切到同一 Planning Review action，保留全局 retained-only Change review prompt，并对 Resolver unavailable/identity conflict fail closed
- [x] 4.5 增加 Local App unit/browser smoke，覆盖双 slot、unknown target、stale target、空态、Task/environment sibling 不受影响、task-scoped/global route 分流和窄屏布局

## 5. Authority 清退、Roadmap 与当前认知

- [x] 5.1 重新审计现有 review routes/stores/schemas/tests/consumers；证明没有旧 Task Review 数据需要迁移，不把未知 `review.yml` sibling 当 authority 或删除用户数据
- [x] 5.2 更新 Task Record/Environment sibling preservation fixtures，使其覆盖 `reviews/planning.yml|completion.yml`，并删除/改写任何暗示旧正式 Task Review writer 的 fixture/文案
- [x] 5.3 校准 task lifecycle roadmap：一个模型/两个可选槽位、无持久 revision、派生 applicability、P0.3 不设门禁，未来 handoff 只冻结 digest/target/method/minimal conclusion
- [x] 5.4 根据 `.buildr/knowledge-impact.yml` 完成 Brief 与受影响 glossary/architecture/flow/Service knowledge reconcile；无真实影响的目标保持 not-applicable，不创建空文档

## 6. 分层验证与生效门禁

- [x] 6.1 运行 OpenSpec strict、proposal/implementation contract guard 与 Change/spec/task coherence review，修复全部诊断后再进入 apply/closeout
- [x] 6.2 运行 Task Review focused unit/contract/CLI/Local App tests与 `npm run test:changed` affected 验证，记录真实失败与修复反馈
- [x] 6.3 在 task worktree/临时 Workspace 验证 candidate package/runtime/CLI/Local App E2E、可移植 Git tracking、原子失败和 retained/peer isolation
- [x] 6.4 完成实现、自然语言资产、runtime projection 与 review 修订后冻结候选，使用 selected Task Verification provider 运行最终 `npm run test:candidate` 并报告 timing/evidence/cleanup

Retained 生效确认属于 Change 交付后的 delivery evidence，不作为 Finish preflight 前的 Change task：候选集成后仅从 retained Product source 执行 sync/render/doctor 和真实 Task Review E2E；确认 task-scoped route 已单次切换、无双 authority 后，才在 retained roadmap 中把 P0.3 标记为生效。
