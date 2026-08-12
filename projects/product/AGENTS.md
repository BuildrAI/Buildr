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
| Buildr 可执行实现 | `services/buildr/` | npm package、CLI、本机应用 HTTP/运行时（runtime）、`web-dist` 托管与打包、验证及维护脚本的实现根 |
| Local App 前端源码 | `services/buildr-web/` | Local App React/Vite 权威前端源码与正式构建 |
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
- OpenSpec apply 期间按当前目标选择直接相关的已有 capability 做实现反馈；不得在每个普通任务后运行产品总验证或临时 workspace E2E。所有实现、自然语言资产、所需同步和 review 修订完成并冻结交付目标后，才执行 `verification.yml` 中适用且 `requiredForDelivery` 的产品验证能力。
- Project Testing 中 Quick 只表示成本约束，affected/full 表示选择范围，Candidate/Release 表示验证目标或节点；不得把三者当作同一层级的测试类型。冻结 Candidate 可以执行 affected，只有全局验证 owner 变化或明确完整回归要求时才执行 full。
- Product Project 的本节与 `verification.yml` 定义“已经有什么能力、何时适用、能证明什么”；selected `buildr.task-verification/v3` provider 负责执行适用能力、测量 transient wall-clock，并通过唯一 Application 维护 Task-scoped current Result。`task-worktree` 只提供 checkout 与 tree identity，不拥有验证政策或 Result。
- 验证进程仍在运行或暂时无输出时继续等待同一进程，不重复启动相同命令；完整验证失败后的修复循环优先重跑失败项和受影响检查，候选重新稳定后再运行一次最终完整验证。
- 最终交付验证必须在所有 rebase、冲突解决、OpenSpec 收敛、runtime sync、review 修订和内容修改完成后冻结明确 target identity；current Task Verification Result 同时绑定该 target 与 Project declaration identities。commit、相同内容集成、push 和 worktree 清理不改变 target 时可以复用；tree 或 declaration bytes 发生任何变化后 Result 直接派生为 stale，并针对新目标重新执行适用能力，不保留 checkbox 或 closeout metadata 的特殊复用协议。
- 用户在task worktree中明确要求“收尾”时，先在Task Development阶段完成Change checklist、current knowledge reconcile、`buildr openspec converge`、Formal Verification、Completion Review和研发交接，再使用`task-finish`只消费current Development Handoff，执行carrier、交付与cleanup；该意图不授权force push、merge commit、远端任务分支删除、丢弃改动或语义冲突决策。
- `task-finish`不调用、不拥有也不解释OpenSpec sync/archive或Convergence Inspect。正常Converge成功归档后释放事务Receipt并直接继续Development；只有未决收敛现场仍存在时才运行只读Inspect，Environment cleanup后不得追索Receipt。
- 实际自举 workspace 如需消费新版产品资产，再从仍保留的当前产品 checkout 执行 sync；CLI update 只更新 Product checkout 或 registry package。workspace 状态变更后按 Buildr Core 运行当前 Agent doctor，但不作为相同 tree 后续 Git 动作的重复产品验证门禁。
- 私有业务 workspace、私有业务规则和私有服务内容不得进入 `package/`。
- 开发阶段执行 Buildr 命令时，从 workspace root 使用 `projects/product/buildr`，不要依赖本机 PATH 上安装的 `buildr`。

## 服务入口

Project 服务通过 `services/manifest.yml` 维护 Service registry，默认目录为 `services/<service>/`。进入具体 Service 目录或作用域后，继续读取该 Service 的 `AGENTS.md`；是否属于独立 Git 仓库继续以 registry source 和实际 Git 边界为准。

## 本地 CLI 同步

- task environment 必须使用其 receipt 返回的绝对 CLI invocation；不得运行主机全局安装脚本，也不得修改 `~/.local/bin/buildr`。需要验证安装行为时，只能通过 `BUILDR_CLI_INSTALL_DIR` 指向任务专用临时目录。
- 改动涉及 Buildr 产品 CLI 入口或实现（`buildr`、`bin/buildr.mjs`、`src/**/*.mjs`、安装/卸载脚本或 npm CLI 映射）时，普通用户 Workspace 的 Formal Task Finish 不执行本机产品安装。Buildr 自举 Workspace 仅由已安装的 `buildr-self-bootstrap` Component 在 Formal Finish 成功后，根据冻结 Task Contribution选择development CLI activation。
- self-bootstrap activation安装后必须运行 `command -v buildr`、`buildr --help` 和 `buildr doctor --agent <agent> --target <workspace-root> --json`，确认默认入口绑定仍保留的 checkout，且目标 workspace 状态有效。
- 如目标位置存在非 Buildr 管理的文件或命令冲突，停止自动安装并明确报告，不得覆盖。

## 验证入口

修改 package baseline、manifest、CLI、bootstrap、Buildr Skill 或 runtime adapter 后，按 `services/buildr/docs/release-checklist.md` 验证。

- 普通任务从 `services/buildr/` 运行 `npm test` 或 `npm run test:fast`，只承担完整低成本 Unit、Component、静态 Contract 及必要静态检查的 Quick 反馈；需要真实 filesystem 投射、CLI、Git、Workspace、重复 cleanup 或完整生命周期的测试不得因历史名称或暂时较快进入该入口。
- 日常改动优先运行 `npm run test:changed`；失败定位使用 `npm run test:focus -- <step-id|group:<group>>`，只展开真实依赖并按 identity 去重。
- 最终候选冻结后通过 Task Verification 执行 delivery-required `product.delivery`；其 changed plan 根据 owner 选择 affected 或 full。用户明确要求完整 Product 回归、发布准备或验证兼容入口时运行 `npm run test:candidate`；`scripts/verify-buildr-product` 是其等价兼容入口。

Buildr 产品完整验证结束后，Agent 必须读取 timing summary，并向维护者汇报总耗时、最慢阶段、失败阶段（如有）、evidence retention 和 cleanup status。summary 仍保留时报告文件路径；transient evidence 已被 consumer 使用并清理后，不得把失效路径表述为长期引用。耗时仅用于观察趋势；除非 OpenSpec 另有阈值契约，不得仅因耗时增长判定验证失败。该要求仅适用于 Buildr Product Project，不扩展为其他 Buildr workspace 的通用 Skill 流程。
