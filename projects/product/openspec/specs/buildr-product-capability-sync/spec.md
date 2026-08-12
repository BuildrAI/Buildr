# buildr-product-capability-sync Specification

## Purpose
定义 Buildr 产品管理的内置能力状态，以及 `update` / `sync` 从当前产品 package 单向物化 workspace 源资产和 Agent runtime 的行为。
## Requirements

### Requirement: Buildr 内置能力层
Buildr MUST 在每个 Buildr workspace 中支持由产品管理的 Rules、Skills 和 Commands 内置能力层。

#### Scenario: 内置能力目录
- **WHEN** Buildr 初始化或同步 workspace
- **THEN** Buildr MUST 能够在 `rules/buildr/` 和 `skills/buildr/` 下物化产品管理的内置 Rule 和 Skill
- **AND** Buildr MUST 将内置 Commands 声明写入 `commands/manifest.yml`
- **AND** 用户管理的 Rules、Skills 和 Commands MUST 与内置能力共用对应 manifest

#### Scenario: 内置能力分 required 和 optional
- **WHEN** Buildr 提供内置 Rules、Skills 或 Commands
- **THEN** Buildr MUST 支持 `required: true` 和 `required: false`
- **AND** `rules/buildr/core.md` MUST 是 required Rule 且不可卸载
- **AND** optional 内置能力 MUST 支持显式卸载

#### Scenario: 内置能力状态跟踪
- **WHEN** Buildr 跟踪内置能力状态
- **THEN** Buildr MUST 区分 `installed`、`modified`、`uninstalled` 和 `missing`
- **AND** Buildr MUST 在对应 manifest 中持久化显式卸载状态，确保 sync 和 doctor 不把它误判为意外损坏
- **AND** Buildr MUST 通过安装回执区分上一版官方资产与用户修改

#### Scenario: 官方内置能力自动升级
- **WHEN** workspace live 内容精确匹配上次安装回执或 package 声明的已知旧版官方完整性
- **THEN** Buildr sync MUST 自动升级到当前 package 内容
- **AND** Buildr MUST NOT 要求用户确认是否同步 Buildr 自身更新

#### Scenario: 修改过的内置能力不被静默覆盖
- **WHEN** 某个内置能力的 live 内容不匹配上次安装回执、当前 package 或已知旧版官方完整性
- **THEN** Buildr sync MUST NOT 在没有用户明确决策时覆盖 optional 内置能力
- **AND** doctor MUST 报告该修改状态，并提供足够上下文让用户选择还原或保留

#### Scenario: 已卸载的内置能力默认不还原
- **WHEN** 某个内置能力被标记为 `uninstalled`
- **THEN** Buildr sync MUST NOT 默认还原它
- **AND** doctor SHOULD 将其作为 info 而不是 warning 报告

### Requirement: Buildr 内置能力管理命令
Buildr MUST 提供显式命令，供用户和 Agent 查看、卸载和还原内置能力。

#### Scenario: 查看内置能力
- **WHEN** Agent 运行 `buildr builtin list --target <dir> --json`
- **THEN** Buildr MUST 列出内置能力 id、类型、状态，以及可用的修复或还原动作
- **AND** 当内置能力声明了 version 或 hash 时，Buildr MUST 一并输出对应元数据

#### Scenario: 卸载内置能力
- **WHEN** Agent 运行 `buildr builtin uninstall <id> --target <dir>`
- **THEN** Buildr MUST 拒绝卸载 required 内置能力
- **AND** Buildr MUST 将 optional 内置能力标记为 `uninstalled`
- **AND** Buildr MUST 删除 optional 内置 Rule/Skill 源文件和 runtime 投射；Command 只更新 `commands/manifest.yml`

#### Scenario: 还原内置能力
- **WHEN** Agent 运行 `buildr builtin restore <id> --target <dir>`
- **THEN** Buildr MUST 从当前 Buildr 产品包还原该内置能力
- **AND** Buildr MUST 将其标记为 `installed`

### Requirement: Buildr sync 是 Agent 升级主路径
Buildr MUST 提供 `sync <agent>` 命令，让 Agent 使用当前 CLI package 携带的 assets 同步 workspace 产品能力并准备支持的 Agent runtime；首次 `init --agent` MUST 复用同一 sync 管线，且所有可预判用户决策必须由零副作用的只读 preflight 汇总。

#### Scenario: 同步 Codex
- **WHEN** Agent 运行 `buildr sync codex --target <dir>`
- **THEN** Buildr MUST 同步 workspace 产品能力、安装或修复产品入口 Buildr Skill、渲染 Codex runtime，并报告最终 Codex doctor 状态
- **AND** Buildr MUST NOT 检查或更新 CLI 自身

#### Scenario: 同步 Claude Code
- **WHEN** Agent 运行 `buildr sync claude-code --target <dir>`
- **THEN** Buildr MUST 同步 workspace 产品能力、安装或修复产品入口 Buildr Skill、渲染 Claude Code runtime，并报告最终 Claude Code doctor 状态
- **AND** Buildr MUST NOT 检查或更新 CLI 自身

#### Scenario: 高层初始化复用 sync
- **WHEN** Agent 运行 `buildr init --agent <agent> --target <dir>`
- **THEN** Buildr MUST 先完成 workspace 源资产初始化，再通过与 `buildr sync <agent>` 相同的管线执行产品能力同步、Component reconcile、runtime 投射和 doctor
- **AND** Buildr MUST NOT 为初始化维护第二套 workspace reconcile、render 或 doctor 实现

#### Scenario: sync 自动处理官方 Builtin 升级
- **WHEN** sync 证明 optional Builtin 的 live 内容等于上次安装版本或已知旧版官方资产
- **THEN** sync MUST 自动升级并继续 render 与 doctor
- **AND** sync MUST NOT 将该差异作为用户决策点

#### Scenario: sync 遇到用户决策点时停止
- **WHEN** sync 只读 preflight 遇到可证明的用户修改、optional Builtin 缺失、Component 冲突、manifest 对齐问题，或需要安装外部命令行工具
- **THEN** sync MUST 在创建 mutation lock、transaction、journal、backup 或执行任何 workspace 写入前停止
- **AND** sync MUST 一次性提供清晰的集合级下一步，供 Agent 向用户确认
- **AND** workspace 文件与 Git 状态 MUST 与执行前完全一致

#### Scenario: 用户完成 Builtin 决策后重新同步
- **WHEN** 用户根据 preflight 结果完成 optional Builtin restore 或 uninstall 决策并重新运行 sync
- **THEN** Buildr MUST 使用新的只读 plan 执行 source mutation、runtime render 和最终 doctor
- **AND** 最终 doctor 通过时 sync MUST 报告完成

### Requirement: 已有 workspace 升级兼容
Buildr MUST 通过 sync 支持已有 Buildr workspace 升级到内置能力和 adapter render 模型，同时不静默覆盖用户编写的规则正文。

#### Scenario: 修复根 AGENTS required block
- **WHEN** 已有 workspace 的根 `AGENTS.md` 缺少或破坏 Buildr required block
- **THEN** Buildr sync MUST 恢复 required block，使其引用 `rules/buildr/core.md`
- **AND** Buildr MUST NOT 覆盖 `AGENTS.md` 的用户正文

#### Scenario: 迁入产品 baseline 规则
- **WHEN** 已有 workspace 使用旧版 package baseline rules
- **THEN** Buildr sync MUST 能将产品发布的规则迁入 `rules/buildr/` 和 `rules/manifest.yml`
- **AND** `runtime.md` 的语义 MUST 内化进 `rules/buildr/core.md`

#### Scenario: MVP 不提供 migrate 命令
- **WHEN** Buildr 处于本变更的 MVP 实施阶段
- **THEN** Buildr MUST NOT 要求实现 `buildr migrate agents`
- **AND** Buildr MUST 通过 doctor 兼容提示保护已有 workspace

### Requirement: Buildr sync 安全迁移被替代的 builtin identity
Buildr product package MUST 能为一个当前 builtin 声明单一 legacy predecessor identity；sync MUST 在只读 preflight 中解析 replacement，并 MUST 在 ownership、integrity 和目标唯一性可证明时原子迁移 builtin 源资产与 manifest 状态，再在同一次 sync 中清理旧 runtime、投射新 runtime 并运行最终 doctor。

#### Scenario: 迁移已安装的官方 builtin
- **WHEN** 当前 package 声明 `git-operations` replaces `git-ops`，且 workspace 中旧 Skill 为 `installed`、内容匹配官方 receipt 或已知官方完整性、目标 identity 不存在
- **THEN** sync MUST 在同一 source mutation 中移除旧受管源、登记并物化 `git-operations`，再清理匹配 receipt 的旧 runtime 投射并渲染当前 Agent runtime
- **AND** 最终 workspace 和 runtime MUST NOT 同时保留可用的受管 `git-ops` 与 `git-operations`

#### Scenario: 继承显式卸载状态
- **WHEN** 被替代的 optional builtin 为 `uninstalled`
- **THEN** sync MUST 将该 opt-out 迁移为 replacement 的 `uninstalled` 状态
- **AND** sync MUST NOT 因 identity rename 重新安装该能力

#### Scenario: 旧 builtin 已被用户修改
- **WHEN** 旧 Skill 内容或 runtime 文件不匹配官方 receipt、当前 package 或已知官方完整性，或者包含未知文件
- **THEN** sync preflight MUST 在创建 mutation lock、transaction、journal、backup 或写入 workspace 前停止
- **AND** 输出 MUST 标识 predecessor、replacement、冲突路径和可供 Agent解释的下一步

#### Scenario: replacement 目标已存在
- **WHEN** workspace 已存在非本次 replacement 产生的 replacement identity、源目录或 runtime path
- **THEN** sync preflight MUST 将迁移标记为冲突并保持 workspace 零写入
- **AND** Buildr MUST NOT 覆盖、合并或根据名称猜测目标 ownership

#### Scenario: replacement source 事务失败
- **WHEN** builtin identity 迁移在源目录、manifest 或 builtin receipt 任一步失败
- **THEN** Buildr MUST 回滚本次 source mutation 中已发生的受管变更
- **AND** Buildr MUST NOT 留下两个部分安装的 Skill source identity

#### Scenario: replacement runtime 阶段失败
- **WHEN** source identity 已迁移，但随后 runtime render 或最终 doctor 失败
- **THEN** sync MUST 报告未完成并保留可由重复 sync 修复的受管 source 状态
- **AND** Buildr MUST NOT 把仍存在旧 runtime orphan 或缺少新 runtime 的状态报告为迁移成功

#### Scenario: 新 workspace 初始化
- **WHEN** 新 workspace 从声明 replacement canonical identity 的当前 package 初始化
- **THEN** init MUST 直接物化当前 replacement
- **AND** init MUST NOT 创建 legacy predecessor entry、目录或 runtime receipt

### Requirement: Buildr 必须显式恢复被替代的 Builtin
Buildr MUST 允许 Agent 通过 `builtin restore <replacement>` 明确放弃内容完整性无法识别、但 ownership 可证明为 Buildr-managed 的 predecessor，并将其恢复为当前 package 声明的 canonical Builtin；该授权 MUST NOT 放宽普通 `sync` 的自动迁移边界或接管 ownership 无法证明的资产。

#### Scenario: 显式恢复未知官方版本的 predecessor
- **WHEN** 当前 package 声明 `git-operations` replaces `git-ops`，workspace manifest 将 predecessor 登记为相同 target 的 Buildr-managed Builtin，predecessor live 内容不匹配 receipt 或已知 `legacyIntegrities`，且 replacement identity 和 target 不存在
- **THEN** `buildr builtin restore git-operations --target <dir>` MUST 在受管 mutation 中删除 predecessor source、将 manifest identity 切换为 `git-operations`、物化当前 package source并写入当前Builtin receipt
- **AND** 命令 MUST 将 predecessor、replacement 和实际受管变更路径报告为显式恢复结果

#### Scenario: 普通 sync 不继承显式恢复授权
- **WHEN** 相同未知 predecessor 状态仅运行 `buildr sync <agent> --target <dir>`
- **THEN** sync preflight MUST 继续将其报告为用户决策点并保持 workspace 零写入
- **AND** sync MUST NOT 因产品支持显式 restore 而自动删除 predecessor

#### Scenario: predecessor ownership 无法证明
- **WHEN** predecessor 缺少匹配的 Buildr manifest entry、`source` 不是 `buildr`、登记 target 与 package replacement 声明不一致，或 replacement identity/target 已被占用
- **THEN** `builtin restore <replacement>` MUST 在任何 workspace 写入前失败
- **AND** 输出 MUST 标识阻塞 identity、ownership 或冲突路径，且 MUST NOT 删除、覆盖或合并任一 Skill

#### Scenario: restore 不触碰历史任务页面
- **WHEN** workspace 存在不属于 package replacement target 的 Project knowledge、代码或其他用户资产
- **THEN** replacement restore 的 mutation plan MUST NOT 包含这些路径
- **AND** restore 成功或失败后这些资产的内容和路径 MUST 保持不变

#### Scenario: restore 结果必须反映实际状态
- **WHEN** replacement restore 因 modified、missing、ownership、target conflict、receipt 或 mutation 错误而没有建立 canonical source、manifest 和 receipt 状态
- **THEN** CLI MUST 返回失败并 MUST NOT 输出“已恢复 Buildr builtin”成功结论
- **AND** finding 中存在 replacement id MUST NOT 被视为恢复成功的充分条件

#### Scenario: restore 幂等成功
- **WHEN** replacement canonical source、manifest 和 receipt 已经与当前 package 一致，且不存在 predecessor source identity
- **THEN** 再次运行 `builtin restore <replacement>` MUST 成功且不创建重复 identity 或 receipt
- **AND** 成功判断 MUST 基于对象最终状态而不是 changed path 数量

#### Scenario: restore 后同步 runtime
- **WHEN** replacement source restore 已成功且 Agent runtime 仍包含可证明由 Buildr 管理的 predecessor 投射，或缺少 replacement 投射
- **THEN** 后续 `buildr sync <agent> --target <dir>` MUST 清理受管 predecessor runtime、投射 replacement runtime 并运行最终 doctor
- **AND** runtime 未完成或 ownership 无法证明时 MUST 报告未完成，不得把整次 workspace sync 报告为成功

### Requirement: Buildr 产品交付必须单向物化
Buildr MUST 将当前产品 package target 视为产品交付源，并将用户 workspace 和 Agent runtime 中的对应文件视为安装结果。

#### Scenario: Workspace target 单向物化
- **WHEN** Agent 使用当前 Buildr 产品执行 init 或 sync
- **THEN** Buildr MUST 从 `package/targets/workspace/` 向目标 workspace 物化 manifest 声明的资产
- **AND** Buildr MUST NOT 从目标 workspace 反向更新 Product Project 的 package 源

#### Scenario: Runtime target 单向物化
- **WHEN** Agent 执行 `buildr skill install <agent>`、`buildr sync <agent>` 或 `buildr init --agent <agent>`
- **THEN** Buildr MUST 从 `package/targets/runtime/` 安装 manifest 声明的产品入口 Agent Skill
- **AND** 安装后的 runtime 文件 MUST NOT 成为产品 Skill 的源资产

#### Scenario: 未合并候选产品使用隔离目标验证
- **WHEN** Buildr 维护者使用未合并的 task worktree Product checkout 验证候选产品
- **THEN** init/sync MUST 使用该 checkout 随附的 package target
- **AND** CLI update 测试 MUST 使用隔离 Git checkout 或 npm prefix
- **AND** 验证目标 MUST 是临时 workspace 或 task worktree自身，而不是主开发工作区的自举 workspace

#### Scenario: 相同候选 tree 集成后不重复物化验证
- **WHEN** 已完成隔离验证的候选 Git tree 未经内容改变集成到主开发分支
- **THEN** Buildr 开发流程 MUST NOT 要求仅为重复产品验证而从主开发分支 checkout 再次 sync 主自举 workspace
- **AND** 实际 workspace 后续需要消费新版产品资产时 MAY 独立执行 sync

#### Scenario: 保留 workspace 自有内容
- **WHEN** init/sync 向 workspace 物化产品管理资产
- **THEN** Buildr MUST 继续保留用户或自举 workspace 自有的 `AGENTS.md` 正文和未由 package manifest 管理的资产
- **AND** Buildr MUST 只修复 required block 和 manifest 声明的产品管理资产

### Requirement: Sync 聚合 Component 与 runtime 状态
Buildr sync MUST 在 workspace 产品能力同步阶段处理 Components，并在没有待决冲突时将其有效 Rules 和 Skills 投射到指定 Agent runtime。

#### Scenario: 同步启用 Component
- **WHEN** Agent 运行 `buildr sync <agent> --target <dir>`
- **THEN** Buildr MUST 先完成 Component reconcile/check
- **AND** Buildr MUST 将启用 Component 的有效 Skills 和 Rules 纳入指定 adapter 的 runtime reconcile
- **AND** Buildr MUST 在最终 doctor 中聚合 Component 和 Commands collections 状态

#### Scenario: Component 冲突阻止 render
- **WHEN** sync 发现 Component modified、missing、ownership conflict 或 manifest invalid
- **THEN** sync MUST 在 runtime render 前停止
- **AND** sync MUST 提供需要用户处理的 Component 和成员上下文

### Requirement: Component-owned Builtins 不允许单项生命周期操作
Buildr MUST 区分独立 Builtin 与 Component-owned 产品成员，并阻止单项 Builtin 操作破坏 Component 完整性。

#### Scenario: 列出 Component-owned Builtin
- **WHEN** Agent 运行 `buildr builtin list --target <dir> --json`
- **THEN** Buildr MUST 标识属于 Component 的产品成员及其 Component id
- **AND** Buildr MUST 将 Component 命令作为其生命周期入口

#### Scenario: 单项卸载或恢复 Component 成员
- **WHEN** Agent 对 Component-owned Builtin 运行 `builtin uninstall` 或 `builtin restore`
- **THEN** Buildr MUST 拒绝操作且不修改源资产或 runtime
- **AND** Buildr MUST 引导 Agent 使用对应 Component install/uninstall

### Requirement: 已有 OpenSpec Builtins 迁移为 Component
Buildr sync MUST 安全识别旧 workspace 中独立管理或由 Buildr fork 管理的 OpenSpec workflow Skills，并迁移为外部上游 Skill 与 Buildr sidebar 分离的 Component。

#### Scenario: 原位采用一致的外部 OpenSpec Skills
- **WHEN** 旧 workspace 中全部预期 OpenSpec Skills 已以外部来源安装，且内容匹配当前 resolved package source
- **THEN** Buildr MUST 创建或更新 OpenSpec Component registry entry 和 installed definition
- **AND** Buildr MUST 创建 OpenSpec Command collection 和 Buildr sidebar members
- **AND** Buildr MUST 保留外部 Skill 源内容，并在 runtime reconcile 时组合 sidebar

#### Scenario: 迁移一致的 Buildr OpenSpec fork
- **WHEN** 旧 workspace 的 `skills/buildr/openspec-*` 内容完整匹配已知旧 package receipt，且目标外部 Skill 路径无冲突
- **THEN** Buildr MUST 在一个 source transaction 中删除旧 fork、物化外部上游 Skills、更新 manifests 和 Component definition
- **AND** runtime reconcile MUST 从新的外部源和 sidebar contributions 生成等价或更新后的派生 Skills
- **AND** 成功后 workspace MUST 不再包含 `skills/buildr/openspec-*` workflow fork

#### Scenario: 旧 OpenSpec Skills 状态不一致
- **WHEN** 任一旧 fork 或外部 Skill 为 modified、missing、uninstalled，或存在来源、路径、version、integrity 冲突
- **THEN** Buildr MUST 停止 OpenSpec Component 迁移
- **AND** Buildr MUST 保留全部旧状态
- **AND** Buildr MUST 输出集合级用户决策信息

### Requirement: Buildr sync 同步随包 Components
Buildr sync MUST 将当前 package 声明的 workspace Components 按 registry 期望状态和三方比较结果同步到已有 workspace。

#### Scenario: 更新已启用 Component
- **WHEN** Agent 运行 `buildr sync <agent> --target <dir>`
- **AND** Buildr-managed Component 为 enabled 且实际成员未被用户修改
- **THEN** Buildr MUST 按当前 package 定义更新 Component 和全部成员源资产，再继续 runtime render

#### Scenario: 不恢复已卸载 Component
- **WHEN** Component registry 将 optional Buildr-managed Component 标记为 uninstalled
- **THEN** Buildr sync MUST 保留该状态
- **AND** Buildr MUST NOT 因 package 新增或更新成员而重新安装它

#### Scenario: Component 修改阻塞 sync
- **WHEN** 已启用 Component 的实际成员不同于已安装 definition
- **THEN** Buildr sync MUST 停止该 Component 更新和后续 runtime render
- **AND** Buildr MUST 输出成员差异和用户可选择的恢复或迁移动作

### Requirement: Buildr sync 必须安全清理已退役的 Task Board 投射
Buildr sync MUST 将不再由当前 package manifest 声明的受管 Task Board Skill、contract、binding、runtime projection 与 receipt 作为 managed orphan 清理；非 Buildr-owned 或已修改输出 MUST 继续 fail closed。Buildr MUST NOT 为 `task-cockpit → task-board` 保留专属 replacement/restore 行为，但 MUST 保留有真实 consumer 的通用 builtin replacement 能力。

#### Scenario: 已有 workspace 使用官方 Task Board 投射
- **WHEN** workspace 的 Task Board 源、contract、binding 与 runtime projection 仍与 Buildr receipt 一致
- **THEN** sync MUST 删除这些当前 package 已退役的受管资产和 receipt
- **AND** MUST NOT 删除或改写 Project `openspec/knowledge/task-boards/*.html` 与 `task-cockpits/*.html`

#### Scenario: Task Board 投射已被用户修改
- **WHEN** 退役目标不再匹配 Buildr ownership evidence
- **THEN** sync MUST fail closed 并报告冲突路径
- **AND** MUST NOT 以清退为由覆盖或删除用户内容

#### Scenario: 其他 builtin replacement 仍有真实 consumer
- **WHEN** 当前 package 声明 `git-operations ← git-ops` 等 replacement
- **THEN** 通用 replacement validation、migration 与 restore MUST 继续工作
- **AND** Task Board 清退 MUST NOT 删除该通用机制

### Requirement: 内部最终 Doctor 使用有界紧凑结果
Buildr 的 `sync`、Component reconcile 和其他只需要最终健康门禁的内部 Doctor consumer MUST 显式请求 compact JSON、使用有限输出缓冲区，并 MUST 区分 Doctor 业务失败与子进程执行或捕获失败。

#### Scenario: 大型健康 Workspace 完成 sync
- **WHEN** Workspace 的 full Doctor JSON 超过 Node 子进程默认缓冲区，但 compact Doctor JSON 在内部上限内且 Doctor 通过
- **THEN** `buildr sync <agent>` MUST 报告最终 Doctor 通过
- **AND** sync MUST NOT 捕获或保留完整 Doctor inventory

#### Scenario: Doctor 业务失败
- **WHEN** 内部 Doctor 子进程正常执行并以非零状态返回有效 compact 诊断
- **THEN** consumer MUST 报告最终 Doctor 未通过并保留有界诊断
- **AND** consumer MUST NOT 将其描述为进程启动、捕获或输出超限错误

#### Scenario: Doctor 输出超过内部上限
- **WHEN** compact Doctor stdout 或 stderr 超过内部声明的有限缓冲区
- **THEN** consumer MUST 报告 Doctor 输出超过内部上限
- **AND** consumer MUST NOT 将该失败描述为 Doctor 业务未通过

#### Scenario: Doctor 子进程执行失败
- **WHEN** Doctor 子进程无法启动、被终止或发生非输出超限的执行错误
- **THEN** consumer MUST 报告子进程执行失败及可用的有界原因
- **AND** consumer MUST NOT 输出“最终 doctor 未通过”作为唯一根因
