# AGENTS.md

Agent 在 `product` Project 中的最小运行规则。

## 项目定位

本文件是 Project scope 规则。开始产品任务时，先遵循 Buildr root `AGENTS.md` 和 Buildr Core，再读取本文件。

当前 Project 是 Buildr 自举 workspace 的产品 Project：`projects/product/`。这里维护 Buildr 产品本身，不是用户 workspace。

所有回复、文档、提案、规格、任务说明和面向用户的文本默认使用中文；代码标识、命令、文件路径、协议字段、第三方专有名词或必须保持原文的格式关键字可以使用英文。

## 资产边界

| 对象 | 位置 | 说明 |
|------|------|------|
| Project rules | `AGENTS.md` | 当前 Product Project 的 Agent 工作规则 |
| OpenSpec | `openspec/` | Buildr 产品事实、能力规范、变更和归档 |
| Product docs | `docs/` | 产品定位、设计说明、发布和维护文档 |
| Package assets | `services/buildr/package/` | 随包 manifest、bootstrap、workspace/runtime targets |
| Product implementation | `services/buildr/` | npm package、产品运行源码、验证与维护脚本的唯一实现根 |
| Compatibility bridge | `buildr` | 只加载 `services/buildr/bin/buildr.mjs` 的稳定开发入口 |
| Service registry | `services/manifest.yml` | 当前 Product Project 的 Service registry |
| Service assets | `services/<service>/` | Service 实现目录；是否独立 Git repo 以 registry source 和实际 Git 边界为准 |

## 产品边界

- 产品定位、核心模型、边界和 Roadmap 以 `docs/buildr-product.md` 为准。
- Buildr 的主要用户是 Agent；人是一等参与者，主要通过 Agent 表达目标、提供业务判断并确认重要决策。产品能力必须优先从 Agent 如何发现、理解和使用组织工作资产的视角设计，同时保证人可以低门槛参与，不能只提供面向人的操作入口与说明。
- 产品交互优先支持 Agent 理解用户意图、自主推理下一步并引导用户使用 Buildr；能够由 Agent 判断、解释和推进的工作，不应要求人类用户先掌握 Buildr 的内部模型或命令细节。
- Buildr 不成为另一个 Agent，也不复制 Agent 的通用理解、推理、规划、对话和专业任务执行能力。新增产品能力必须说明其长期治理、跨 Agent 复用、确定性约束或可验证诊断价值；不具备这些价值时应将工作保留给 Agent，需要复用和治理的专业动作优先沉淀为 Skill 或其他工作方法资产，不得在 Buildr 产品核心中另建推理或任务执行主体。
- Buildr 功能默认由 Agent 操作：Agent 能在当前工具、权限和安全边界内完成的动作，必须在说明必要影响并取得所需授权后直接执行，不得把命令或操作步骤作为默认交付结果要求用户代为执行。只有用户明确选择手动方式，或 Agent 因工具不可用、权限、登录态、外部环境等原因无法完成时，才提供准确的手动操作作为兜底。
- 新增或调整产品能力时，必须同时考虑 Buildr Skill 如何让 Agent 发现、理解、选择并正确使用该能力；缺少相应的 Agent 使用指引、决策边界或完成标准时，功能设计不完整。
- 产品能力、CLI 行为、上下文模型、runtime adapter 行为和架构性变更必须先创建 OpenSpec change。
- `services/buildr/package/manifest.yml` 声明发布边界；`services/buildr/package/targets/workspace/` 只放映射到用户 workspace 或 Project 的源，`services/buildr/package/targets/runtime/` 只放直接安装到 Agent runtime 的源。
- `services/buildr/package/targets/` 和 `services/buildr/package/bootstrap/` 是发布给用户的内容，修改时必须同时从用户初始化、更新和日常使用 Buildr 的视角审视。
- 预计包含代码、构建或测试的产品 change 必须在 propose 前创建或复用 task worktree；artifacts、实现和合并前候选验证只写入该 worktree。
- 合并前候选验证使用临时 workspace 或 task worktree 自身，不从未合并 checkout 更新主自举 workspace。
- OpenSpec apply 期间按单任务最小反馈、任务组受影响范围验证、最终候选完整验证分层执行；不得在每个普通任务后运行产品总验证或临时 workspace E2E。所有实现、自然语言资产、所需同步和 review 修订完成并冻结候选后，才运行一次产品级总验证。
- Product Project 的本节与验证入口定义“应该跑什么”；selected `buildr.task-verification/v2` provider 负责决定 affected 或 candidate 保证、实际执行、绑定候选、测量验证自身 wall-clock 并向用户报告，`task-worktree` 只提供 checkout 与 tree identity，不拥有验证政策。
- 验证进程仍在运行或暂时无输出时继续等待同一进程，不重复启动相同命令；完整验证失败后的修复循环优先重跑失败项和受影响检查，候选重新稳定后再运行一次最终完整验证。
- 完整验证必须绑定所有 rebase、冲突解决和实现内容修改结束后的 implementation Candidate，并记录最终候选 Git tree 作为当时的 delivery identity；commit、相同内容集成、push 和 worktree 清理复用该结果，不在主开发分支重复 E2E。候选 tree 改变时，先按动作来源、实际 diff 和 Project policy 分类：Task Finish 可归因产生的 OpenSpec sync/archive 等 closeout-only delta 只运行对应 workflow checks，不再次启动 Candidate。若唯一变化是同一会话中刚成功的最终 Candidate 任务在 active change `tasks.md` 由 `- [ ]` 精确变为 `- [x]`，将其记录为 `closeout-metadata-only` / `verification-result-metadata-only`：保留已验证 implementation identity，并另存 source/target identity、change/task identity 和精确 marker transition；不得声称 Candidate 直接覆盖变化后的 delivery tree。任何额外编辑、任务歧义、source identity 不匹配或跨会话缺少 transition evidence 时，必须按 implementation change 在集成前重新运行 Candidate。
- 用户在 task worktree 中明确要求“收尾”时，使用 `task-finish` 编排已完成 change 的 specs 同步与归档、相关校验、提交、必要的本地未推送 rebase、fast-forward 集成、目标分支 push 和本地 worktree/任务分支清理；该意图不授权 force push、merge commit、远端任务分支删除、丢弃改动或语义冲突决策。
- `task-finish` 是 Buildr 自有编排层，不直接修改外部 `openspec-*` Skills；OpenSpec archive/specs sync 后只对可证明由本次操作产生的 Markdown EOF 多余空行自动规范化。
- 实际自举 workspace 如需消费新版产品资产，再从仍保留的当前产品 checkout 执行 sync；CLI update 只更新 Product checkout 或 registry package。workspace 状态变更后按 Buildr Core 运行当前 Agent doctor，但不作为相同 tree 后续 Git 动作的重复产品验证门禁。
- 私有业务 workspace、私有业务规则和私有服务内容不得进入 `package/`。
- 开发阶段执行 Buildr 命令时，从 workspace root 使用 `projects/product/buildr`，不要依赖本机 PATH 上安装的 `buildr`。

## 服务入口

Project 服务通过 `services/manifest.yml` 维护 Service registry，默认 repo 目录为 `services/<service>/`。进入具体 Service repo 后，继续读取该服务仓 `AGENTS.md`。

## 本地 CLI 同步

- task environment 必须使用其 receipt 返回的绝对 CLI invocation；不得运行主机全局安装脚本，也不得修改 `~/.local/bin/buildr`。需要验证安装行为时，只能通过 `BUILDR_CLI_INSTALL_DIR` 指向任务专用临时目录。
- 改动涉及 Buildr 产品 CLI 入口或实现（`buildr`、`bin/buildr.mjs`、`src/**/*.mjs`、安装/卸载脚本或 npm CLI 映射）时，候选验证与集成完成后，必须从仍保留的 Product checkout 自动运行一次 `scripts/install-buildr-cli`，刷新本机默认开发入口，无需再次等待用户提醒。
- 安装后必须运行 `command -v buildr`、`buildr --help` 和 `buildr doctor --agent <agent> --target <workspace-root> --json`，确认默认入口绑定仍保留的 checkout，且目标 workspace 状态有效。
- 如目标位置存在非 Buildr 管理的文件或命令冲突，停止自动安装并明确报告，不得覆盖。

## 验证入口

修改 package baseline、manifest、CLI、bootstrap、Buildr Skill 或 runtime adapter 后，按 `services/buildr/docs/release-checklist.md` 验证。

- 普通任务从 `services/buildr/` 运行 `npm test` 或 `npm run test:fast`，只承担 unit、架构、spec 和全部 adapter 低成本契约反馈。
- 日常改动优先运行 `npm run test:changed`；失败定位使用 `npm run test:focus -- <step-id|group:<group>>`，只展开真实依赖并按 identity 去重。
- 最终候选冻结后运行 `npm run test:candidate`；`scripts/verify-buildr-product` 是供 CI、publish 和历史集成使用的等价兼容入口。

Buildr 产品完整验证结束后，Agent 必须读取 timing summary，并向维护者汇报总耗时、最慢阶段、失败阶段（如有）、evidence retention 和 cleanup status。summary 仍保留时报告文件路径；transient evidence 已被 consumer 使用并清理后，不得把失效路径表述为长期引用。耗时仅用于观察趋势；除非 OpenSpec 另有阈值契约，不得仅因耗时增长判定验证失败。该要求仅适用于 Buildr Product Project，不扩展为其他 Buildr workspace 的通用 Skill 流程。
