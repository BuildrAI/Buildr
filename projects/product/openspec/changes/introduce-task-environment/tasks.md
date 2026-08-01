## 1. Environment Receipt、Application 与 CLI

- [x] 1.1 新增 `buildr.task-environment-receipt/v2` Domain validator/read model，只包含 Task/Workspace、实际工作范围、稳定 controller、执行基础、provider refs、动态资源和最新 ready/cleanup 事实
- [x] 1.2 新增 canonical `.buildr/tasks/<task-id>/environment.json` repository，校验正式 Task 与 canonical Workspace，完整校验后精确原子替换单文件并保持所有 sibling files；只忽略 environment.json
- [x] 1.3 实现共享 Task Environment Application：`prepare|inspect|resource register|resource release|cleanup`，统一领域校验、真实 probe、原子写入、diagnostics 与 effects
- [x] 1.4 注册薄公共 CLI `buildr task environment prepare|inspect|cleanup <task-id>`；`prepare` 幂等承担首次准备和恢复，不增加 `restore` 命令，资源登记/释放不作为公共 action
- [x] 1.5 登记 `buildr.task-environment-result/v1` 公共 JSON schema，覆盖成功、blocked、无 receipt、drift 与 cleanup 结果，并保持 checkout/npm parity
- [x] 1.6 实现实际执行根、共享占用、Task Validation Workspace 根和多 scope 记录；不增加顶层 environment mode、Task Record 环境字段或跨 Workspace receipt

## 2. Task-scoped Change 解析与 Local App

- [x] 2.1 实现任务范围 Change 引用解析器（Task-scoped Change Reference Resolver），只接受 canonical Workspace、Task ID 与 `project/change`，通过 Environment read port 解析 Project 执行根，拒绝请求 path/cwd/branch 猜测
- [x] 2.2 支持 task-environment candidate（active/archive）、retained baseline/active/archive 与 unavailable provenance；两根并存时分开表达、不合并，全局 Change list 保持 retained-only
- [x] 2.3 改造 Task Record Change reference validation：新增引用时调用共享 Resolver；inspect/list 返回不可用引用诊断，删除失效引用和无关字段更新不被旧引用阻塞
- [x] 2.4 确认 Task Record schema/repository 不增加 Environment path、identity、provenance 或专业字段；Task Record Application 不直接读取 Environment Receipt
- [x] 2.5 在现有 Task 详情增加独立“环境”页签，保留 Task 概览；展示 current-machine、observedAt、ready/blocked/drift/unavailable、scope/root、Runtime/CLI/依赖/projection、provider evidence、资源与 cleanup 摘要
- [x] 2.6 新增 Workspace-scoped 只读 Task Environment API，直接调用 Application `inspect`，拒绝 target/root/path 与越界 Task；使用 no-store，并在打开页签、页面聚焦和手动刷新时触发有界 probe
- [x] 2.7 为 Task 详情的 Change 引用增加 task-scoped detail/read model，复用同一 Resolver；不增加 Environment mutation 按钮、WebSocket、持续轮询或第二套 filesystem reader

## 3. Git worktree provider 与一次性迁移

- [x] 3.1 将现有 worktree application 拆为 `buildr.git-worktree-provider/v1`，以 `buildr.git-worktree-evidence/v1` 和 Git common-dir `buildr/task-worktrees/<task-id>.json` 只维护 repository/checkout/branch/HEAD/remote/clean/registration/Git effects
- [x] 3.2 保留并收窄 `worktree create|inspect|cleanup` provider 表面，统一登记 `buildr.git-worktree-result/v1`；删除 `worktree context|adopt`、adoption receipt/session logic 和所有 Environment ready/runtime/总 cleanup 输出
- [x] 3.3 保持显式单/多 repo selector、canonical `source.path`、完整零写入 preflight、partial creation recovery 和 nested-first Git cleanup；Environment 结果只引用 provider evidence
- [x] 3.4 实现与正常 routing 隔离的一次性 v1 reader/migrator，不允许写回 v1，也不提供永久 legacy inspect/cleanup adapter
- [x] 3.5 实现 A 类迁移：正式 Task + identity-matching live worktree 生成 v2 Receipt/Git evidence、重新 probe，成功后删除旧 receipt/adoption state
- [x] 3.6 实现 B/C 类清退：无 Task 的 live worktree 只保留 Git evidence并删除旧环境 receipt；无 live resource 的 stale receipt 在证明后删除；均不创建 Task/v2 Receipt
- [x] 3.7 实现 D 类阻断：identity/ownership 冲突时原样保留 bytes/资源，阻止该 Workspace authority 切换并返回唯一解决动作
- [ ] 3.8 切换前重新枚举 retained Workspace 的真实 v1 receipts（探索快照为 33 份），记录逐项 A/B/C/D 分类和迁移结果；候选已记录只读分类 A=1/B=1/C=31/D=0，实际迁移结果待 retained cutover 回填

## 4. 确定性 prepare、ready 与恢复

- [x] 4.1 按 canonical Workspace/Project/Service 和显式 scope 生成准备计划，先记录 Receipt，再依次准备执行位置、Runtime、Workspace CLI、依赖与 runtime projection；partial failure 保留现场并返回 blocked
- [x] 4.2 为每个实际执行根实现 provider/Runtime/CLI/lockfile/依赖/projection 的最小真实 probe，并从全部 required scope 形成唯一 ready/execution binding；不支持或事实冲突时 fail closed
- [x] 4.3 为 Buildr 自举 Node checkout 实现 Workspace Node/npm + 自身 lockfile 的确定性 `npm ci` 与复用探测，证明不链接、复制或修改 retained/peer `node_modules`
- [x] 4.4 固化 retained stable controller 与 candidate CLI 边界：候选只能投射/测试自身任务验证工作区和根内模拟 user destination，所有 retained/peer/shared user runtime 越界写入前失败
- [x] 4.5 实现按 Task ID 串行恢复，重新探测 scopes/provider/Runtime/CLI/依赖/projection/resources；cwd/branch/相同 HEAD 不作为 ownership，发现可见 writer/identity 漂移即 blocked

## 5. 动态资源与 cleanup 交接

- [x] 5.1 实现已知 resource provider 的登记/释放模型，只接受结构化非敏感 cleanup handle；登记失败时要求 creator 回收刚创建资源，不保存任意 shell、凭证或一次性进程
- [x] 5.2 改造 Local App Preview start/stop/restore：start 健康后先登记再成功，登记失败认证停止；stop 先由 provider 证明终止再释放 Environment resource
- [x] 5.3 改造 Task Finish preflight/cleanup 的最小接线：读取 Environment execution result，交付完成后只提交 delivery identity/cleanup eligibility，消费 Environment cleanup result，不直接扫描资源或调用 worktree cleanup
- [x] 5.4 实现正常完成、明确放弃、shared-root ownership 不明和其他并行 Task 四类 cleanup；按资源依赖顺序停止并调用 providers，blocked 保留现场，成功只保留最小 Environment 处置摘要
- [x] 5.5 向 Task Verification 只交接 Task/scope/environment/source/projection identity，删除 Environment session/adoption 判断，保持实际 Agent session proof 只属于 P0.4 Verification Result

## 6. Skills、contracts、package 与 authority 切换

- [x] 6.1 新增最小 `buildr.task-environment/v1` 与 `buildr.git-worktree-provider/v1` contracts，明确 guarantees、effects、授权、result evidence、单 writer 限制和非目标
- [x] 6.2 新增简洁 `task-environment` Skill，使其调用公共 CLI；把 `task-worktree` description/正文收窄为显式 Git worktree/provider 动作，统一中英文术语并禁止“开发 Workspace”等混用
- [x] 6.3 更新 package/workspace manifests、source mappings、default bindings 和 direct/recursive consumers，使 task-triage/OpenSpec gate/Task Finish 只消费新 Environment contract，task-worktree 只提供 Git provider
- [x] 6.4 在同一 package cutover 中删除 `buildr.task-worktree-lifecycle@1/@2` contracts/bindings、旧 Environment writer、`worktree context|adopt`、adoption state、旧 environment JSON/help/docs/runtime routes和直接旧 receipt consumers
- [x] 6.5 清理重复 package/runtime copies、旧 shape tests 和 canonical guidance；只允许 migration module/fixtures、OpenSpec delta/history 保留旧 identity 字符串
- [x] 6.6 增加 residual gate，检查 capability graph、CLI registry/help、public JSON registry、Application/router、Skills/package/runtime assets 与 consumer imports；任何旧 mutation/routing 可达即失败

## 7. 分层验证、Roadmap 与当前认知

- [x] 7.1 增加 Environment Domain/Application/repository/CLI unit tests，覆盖 closed schema、Task gate、精确文件 ownership、实际 scope、原子失败、公共 JSON 和资源字段禁区
- [x] 7.2 增加 fast integration，覆盖共享根、非 Git、单/多 repo provider、partial recovery、Node 依赖、真实 ready/blocked、串行恢复、candidate target guard 和其他 Task 不受影响
- [x] 7.3 增加 Task-scoped Change/Local App integration，覆盖 candidate/baseline/archive/unavailable、全局 retained-only、路径越界、no-store/current probe 与无 Environment mutation
- [x] 7.4 增加 Preview/Finish/cleanup integration，覆盖登记失败回收、正常/放弃/混合 ownership、cleanup-only resume 和 Task Finish 不直接调用 Git provider
- [x] 7.5 增加 checkout/npm tarball/package/runtime E2E 和双正式 Task 并发验收，覆盖 A/B/C/D 旧数据、provider replacement、Environment 资源归属与 cleanup、supported Agent projections、CLI/JSON parity 及无旧 contract/writer/routing 可达
- [x] 7.6 更新 Change Brief 并运行 current knowledge assess；实现稳定后更新 glossary、overview、产品/技术架构、OpenSpec lifecycle flow 和 Buildr Service，只描述已交付事实
- [x] 7.7 在 retained Roadmap 未提交更新已由其原任务安全进入 source 后，修正 P0.2 的 Application/CLI/Local App/Change Resolver、`environment.json`/窄 provider evidence、worktree 术语、P1.2 边界与一次性迁移表述；不得覆盖当前 retained 修改
- [x] 7.8 完成实现与 knowledge reconcile 后运行 OpenSpec strict、proposal/implementation contract guard、affected/Candidate verification 和本任务验证工作区 runtime 验收；确认 retained/peer checkout/runtime 全程未被候选提前修改
- [ ] 7.9 候选集成后仅从 retained Product source 执行 sync/render/doctor；重新应用并复核 A=1/B=1/C=31/D=0 迁移结果，将 `product/introduce-task-environment` 写入正式 Task Record，再通过 residual gate 后声明 P0.2 authority 生效
