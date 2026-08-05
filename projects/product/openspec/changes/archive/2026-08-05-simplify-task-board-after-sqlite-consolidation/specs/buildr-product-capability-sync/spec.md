## MODIFIED Requirements

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

## ADDED Requirements

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
