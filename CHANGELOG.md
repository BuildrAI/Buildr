# Changelog

本项目遵循语义化版本。正式发布前的变更可以在 `0.1.x` 内调整，但会在 release notes 中说明用户可观察差异。

## Unreleased

## 0.1.0-rc.8 - 2026-08-11

- Breaking：把 Buildr 为 Agent Skill 投射保存的所有权回执迁移到 `.buildr/agent-runtime/<workspace|user>/<adapter>/skill-projection-ownership-receipts/`；实际 Agent Skills 路径不变。新版本会安全迁移仍能证明 runtime 文件的旧回执，新旧冲突或 runtime 漂移时零写入停止；旧 CLI 不再能自动管理已迁移投射。
- Breaking：清退 CLI Legacy 产品表面，删除 `openspec baseline create`、阶段型 `openspec check` 与 `skills migrate-project-assets` 的 route、实现和 JSON schema；连同已删除的 `sync-plan`/`sync-apply`，旧调用统一返回零写入 unknown-command。OpenSpec apply 改用 strict validation、current Planning Review 与单一 `converge`，legacy Project Skill source 只 fail closed，不再自动迁移。
- 收敛 Buildr CLI 产品表面：以单一 command catalog 统一 dispatch、canonical help、未知命令建议和 `primary`、`agent-machine`、`maintenance` 三层分类；补齐 `task finish` 聚合帮助。
- 修复候选验证的跨平台 npm 入口，并让 CI 在 Pull Request 与推送场景显式使用对应 Git 基线，保证 Windows 和 OpenSpec changed-path 审计可以执行。
- 修复 Windows 8.3 checkout 路径导致的 Environment Manager 误判，并隔离候选矩阵的 Node runtime 临时目录。
- 提升 Windows 受管 Node runtime 安装等待时间，并修正候选验证中的 Windows OpenSpec 与跨平台测试 fixture。
- 系统收敛跨平台候选验证：统一 Windows npm/OpenSpec shim、node:test 盘符路径、Git checkout 与用户目录边界；隔离 macOS Local App loopback 连接复用，改用确定性资源容量证据，并在 CI 采用受限 workspace 并发。

## 0.1.0-rc.7 - 2026-07-24

- 将本机工作台扩展为 Workspace、Project、Service 与 Change 的统一治理入口：支持稳定的目录、详情与编辑路径，展示真实 Git 状态和 OpenSpec 变更，并通过“交给 Agent”保持页面负责认知与交接、Agent 负责执行的边界。
- 提供全局多 Workspace 本机应用与完整安装体验：用户可登记、切换和移除本机 Workspace；macOS、Windows 提供可双击 launcher，修复 Finder 前台等待和 Windows 中文路径问题。
- 完善首次使用和日常导航：开始页展示真实工作范围与下一步，Project/Service 创建改为意图式 Agent Action，公开 README 与 Agent onboarding 说明两种开始路径。
- 加固 Agent 任务执行环境：实现前先路由 task worktree；支持多仓 task environment、隔离的 Local App preview、任务收尾同端口迁移，并默认不推送远端任务分支。
- 收敛验证体验与证据边界：日常交付使用受影响验证，发布/高风险使用完整 Candidate；浏览器冒烟覆盖 Project、Service、Change 主流程，Candidate evidence 与实际 task environment identity 绑定。
- 将 Buildr 可执行实现迁入 `product/buildr` Service，并按 Domain、Application、Infrastructure、Interfaces 分层，保持 Product 治理资产与运行源码的责任边界清晰。

## 0.1.0-rc.6 - 2026-07-21

- Breaking：Skill source 只在 workspace `skills/` 治理；Project 改用 `capabilities.yml` 表达 requirements、bindings 与 applicability，`skills render` 显式选择 workspace 或 user destination，并以稳定 identity、projection receipts 和零写入冲突预检保护资产。
- 建立 Skill capability contracts 与 bindings，将任务分流、验证、Git 集成、worktree 生命周期、收尾和资产审查组合为可发现、可替换且 fail-closed 的 Agent 工作能力。
- 重构产品验证为 registry 驱动的 Changed、Focus 和 Candidate DAG，将完整候选证据绑定到 repository、Product root、tree/fingerprint 与 timing summary，并提供可安全清理的临时 evidence。
- 引入 Agent 维护的只读任务看板与独立任务资产审查，保留历史 `task-cockpit` 资产，并通过显式 builtin restore 安全迁移受管替换。
- 收紧 doctor、runtime 和公开 JSON 契约：区分 workspace valid、runtime readiness 与可操作诊断，将不可观测的 Agent Skill inventory 保留为 assurance metadata，并避免与 Agent 抢占通用理解、推理和任务执行职责。
- 重构 Commands 资产模型与 CLI 模块边界，加强 package、runtime adapter、managed mutation 和发布收敛检查，同时保持 Node.js 20+ 与七个 runtime adapter 的公开支持范围。

## 0.1.0-rc.5 - 2026-07-17

- 统一 Buildr 更新与 workspace 同步意图：Agent 能明确区分 CLI/Skill 更新和 `buildr sync`，并在 Git tree 变化后用 doctor 判断是否需要同步当前工作环境。
- 加固候选版发布流程：发布准备绑定 canonical worktree、最终候选 tree 和历史衔接门禁，GitHub Release 说明改为从对应 CHANGELOG 章节生成。
- 新增任务驾驶舱：复杂、长期或跨阶段任务可维护稳定的只读 HTML 全景，持续呈现目标、进度、结论、下一步和阻塞。
- 移除随包最小 workspace 示例，减少与公开文档重复的维护入口。
- 修正 `0.1.0-rc.4` 的发布范围，暂不发布任务资产审查能力。

## 0.1.0-rc.3 - 2026-07-15

- 强化 Agent 端到端工作引导：在 pull、rebase、checkout 和 worktree 切换等 Git tree 变化后先运行 doctor，再按诊断结果决定是否同步当前 Agent 工作环境。
- 重写中英文公开 README，以“让 Agent 越做越多，越做越好”直接表达产品价值，并明确从产品、开发到发布的端到端工作场景。
- 收敛发布 worktree 生命周期：远端已安全承载候选提交且无后续本地动作时，自动清理本地发布 worktree 和任务分支。

## 0.1.0-rc.2 - 2026-07-14

- 将 Buildr 的公开定位收敛为面向组织和 Agent 的工作资产治理系统，明确 Buildr 管理有组织的项目信息，而不是模型 context window。
- 新增 Cursor、Qoder、TRAE、TRAE Work 和 WorkBuddy runtime adapter，并用 trait catalog 统一 adapter 能力、检查与投射模型。
- 修复 Project scoped Rules render 可能清理无关 Project 投射的问题，并补充不同 cleanup 实现族的隔离回归。
- 将产品验证拆分为 fast、affected 和 candidate 三层入口；候选验证复用 npm tarball 并采用有界并行，显著缩短完整验证耗时。
- 增加 Buildr 候选版/稳定版发布 Skill，完善 GitHub trusted publishing、发布后 registry 与 GitHub Release 核验流程。

## 0.1.0-rc.1 - 2026-07-13

- 建立 Organization/Root、Project 和 Service 资产模型。
- 提供 Rules、Skills、Commands、Components、OpenSpec、doctor 和 source transaction 能力。
- 支持 Codex 与 Claude Code runtime projection。
- 支持从干净开发 checkout 或 npm tarball完成 Agent onboarding。
- 支持 Service 显式 branch intent 与远端 Skill 有界读取。
- 补齐 MIT License、公开 CLI reference、已知限制、贡献与安全说明及 GitHub Actions 验证。
- 固定官方源码为 `elevenching/Buildr`、npm identity 为 `@buildr-ai/buildr`，并提供中文/英文 README。
- 增加开源候选安全扫描、tag/version/dist-tag 契约和 OIDC-ready release workflow。
