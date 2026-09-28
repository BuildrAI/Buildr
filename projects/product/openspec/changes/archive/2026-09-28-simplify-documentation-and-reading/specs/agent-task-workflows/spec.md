## MODIFIED Requirements

### Requirement: Buildr Skill 统一表达 doctor 生命周期
Buildr Skill MUST 通过统一执行循环表达 Buildr 状态变更后的 doctor 验证流程，并避免在每个资产章节重复相同要求。

#### Scenario: 状态变更后的统一验证
- **WHEN** Agent 通过 Buildr Skill 完成 workspace 状态变更
- **THEN** Buildr 技能（Skill）MUST 使用当前智能体（Agent）的诊断（Doctor）确认相关结果；当前动作已返回同一现场的最终诊断（Doctor）时直接复用，否则运行 `buildr doctor --agent <agent> --target <dir> --json`
- **AND** 完成标准 MUST 要求不存在需要立即处理的 error

#### Scenario: 资产章节避免重复
- **WHEN** Buildr Skill 分别说明 Workspace、Project、Service、Rules 或 runtime 维护动作
- **THEN** 各资产章节 MUST 依赖共享执行循环完成通用 doctor 验证
- **AND** 只有该资产存在额外诊断语义时才能补充专项检查说明

#### Scenario: Bootstrap 兜底一致
- **WHEN** Buildr 技能（Skill）不可用且智能体（Agent）使用命令帮助和命令参考
- **THEN** 命令参考 MUST 保留当前智能体（Agent）的诊断与修复依据；`init --agent` 或 `sync` 已返回有效的最终诊断（Doctor）时 MUST 复用，不重复运行

### Requirement: Git 工作区转换后诊断 Buildr Agent 环境
Git 提供者（Provider）MUST 只报告真实检出变化；Buildr 技能（Skill）或当前任务的能力消费者（Consumer）MUST 根据变化范围执行相应诊断与恢复。工作树（Worktree）提供者（Provider）只管理 Git 位置、证据与安全清理，MUST NOT 自动创建运行环境、执行诊断（Doctor）、同步资产或安装依赖。

#### Scenario: Git 操作成功改变已检出内容
- **WHEN** Agent 通过任一 Git capability provider 成功完成 `pull`、`merge`、`rebase`、切换 tree 的 `checkout` 或 `switch`、改变工作区的 `reset`、`cherry-pick`、`revert`、`stash apply` 或 `stash pop`
- **AND** 当前仓库位于包含 `.buildr/workspace.yml` 的已初始化 Buildr workspace 中
- **THEN** Agent MUST 针对当前 Agent 和 Buildr workspace root 运行 `buildr doctor --agent <agent> --target <workspace-root> --json`
- **AND** 检查 MUST 发生在 Git 操作成功且工作区不存在未解决冲突之后

#### Scenario: Git 操作不改变已检出内容
- **WHEN** Agent 只执行 `fetch`、`push`、普通 `commit`，或复用未发生 tree 转换的既有 worktree
- **THEN** Agent MUST NOT 仅因该操作运行 Git 工作区转换后的 Buildr 环境检查

#### Scenario: 当前环境无需处理
- **WHEN** 工作区转换后的 doctor 没有报告需要用户处理的环境问题
- **THEN** Agent MUST NOT 提醒用户执行无必要的 `render` 或 `sync`

#### Scenario: 当前环境存在漂移或依赖问题
- **WHEN** 工作区转换后的 doctor 报告 Rules、Skills、capability bindings、Commands、Components、Contributions 或当前 Agent runtime 存在需要处理的问题
- **THEN** Agent MUST 向用户汇总当前环境问题及 doctor 指向的可执行下一步
- **AND** Agent MUST NOT 将全部问题笼统解释为 runtime 渲染问题
- **AND** Agent MUST 说明当前 session 是否重新发现新资产由 Agent runtime 决定

#### Scenario: 当前 provider 已报告 treeChanged
- **WHEN** 已绑定 Git provider 的结果证据包含 `treeChanged: true`
- **THEN** 能力消费者（Consumer）MUST 按 Buildr 技能（Skill）核对当前工作空间（Workspace）与运行时（Runtime），执行适用诊断
- **AND** Agent MUST NOT 因 selected provider 的具体 Skill id 不同而跳过检查

#### Scenario: 一般环境漂移可由 workspace sync 修复
- **WHEN** 非 worktree-create 工作区转换后的 doctor 指出当前 Agent 的 workspace sync 是合适修复动作
- **THEN** 智能体（Agent）MUST 在已有同范围授权内执行同步；只有缺少该授权或需要新的业务取舍时才询问
- **AND** Agent MUST 同时提供 `buildr sync <agent> --target <workspace-root>` 作为手动同步备选
- **AND** 面向用户的手动命令 MUST 使用已解析的实际 Agent 和 workspace root，不得保留占位符
- **AND** 智能体（Agent）MUST NOT 在缺少相应授权时执行同步，MUST NOT 对已成立的同范围授权重复确认
- **AND** Agent MUST NOT 把要求用户自行运行命令作为默认处理方式

#### Scenario: 用户确认由 Agent 同步
- **WHEN** 用户确认由 Agent 处理 workspace sync
- **THEN** Agent MUST 调用 Buildr Skill 执行 `buildr sync <agent> --target <workspace-root>`
- **AND** 智能体（Agent）MUST 使用同步返回的最终诊断（Doctor）确认结果；同一现场已有有效结果时不重复执行
- **AND** Agent MUST 报告实际同步与诊断结果，而不是仅重复手动命令

#### Scenario: 用户选择手动同步或 Agent 无法执行
- **WHEN** 用户明确选择手动同步，或 Agent 因工具不可用、权限、登录态或外部环境无法完成同步
- **THEN** Agent MUST 提供准确的手动同步命令
- **AND** Agent MUST 在无法执行时说明具体原因
- **AND** 用户选择手动同步后，Agent MUST NOT 在缺少诊断证据时假设同步成功
- **AND** 用户报告完成且 Agent 能运行 doctor 时，Agent MUST 再次验证当前环境

#### Scenario: 诊断问题不应由 sync 修复
- **WHEN** doctor 报告 Commands、Components、CLI 或其他不能由 workspace sync 正确修复的问题
- **THEN** 智能体（Agent）MUST 按对应能力在已有授权内执行可完成的动作，只有范围或副作用变化时取得必要决定
- **AND** Agent MUST 仅在自身无法完成或用户选择手动方式时要求用户操作

#### Scenario: 无法确认当前 Agent 环境
- **WHEN** Agent 无法匹配受支持的 runtime adapter，或 post-transition doctor 无法执行
- **THEN** Agent MUST 报告环境状态尚未确认及具体原因
- **AND** Agent MUST NOT 猜测本地 Agent runtime 已经同步

#### Scenario: 产品创建新 task worktree 并自动准备环境
- **WHEN** 智能体（Agent）已明确任务标识、分支、起点与工作空间（Workspace），并调用已选工作树（Worktree）提供者（Provider）
- **THEN** 提供者（Provider）MUST 返回真实创建或复用位置及 Git 证据，MUST NOT 自动执行诊断（Doctor）、同步或安装依赖
- **AND** 智能体（Agent）MUST 从返回位置继续工作，仅在当前实现或验证需要时读取项目（Project）和服务（Service）的真实准备入口
- **AND** 准备与投射 MUST 遵守独立授权、目录所有权和保留工作空间（Workspace）保护边界

#### Scenario: 新 task worktree 不满足安全自动 sync 条件
- **WHEN** 工作树（Worktree）创建后发现运行时（Runtime）、依赖、组件（Component）或源资产问题
- **THEN** 智能体（Agent）MUST 保留已创建目录和 Git 事实，将具体问题交给相应能力所有者（Owner）
- **AND** 提供者（Provider）MUST NOT 执行任意修复命令、删除检出目录、丢弃内容或扩大 Git 授权
- **AND** 局部准备问题 MUST NOT 否定已经成功创建或复用的位置

#### Scenario: 幂等复用既有 task worktree
- **WHEN** canonical task path 已注册为同一 repository 与 branch 的既有 worktree
- **THEN** Buildr MUST 返回 `reused` 与 `treeChanged: false`
- **AND** Buildr MUST NOT 仅因复用重复运行创建后的 doctor 或自动 sync
- **AND** path、repository 或 branch identity 不匹配时 MUST fail closed 且零写入

#### Scenario: 任务 Skill 内部发生其他工作区转换
- **WHEN** `task-finish` 通过绑定 provider 改变目标 workspace tree，或 task workflow 执行 worktree create 之外的 tree transition
- **THEN** 对应任务技能（Skill）MUST 依据真实变化调用产品入口 Buildr 技能（Skill）的适用诊断与恢复；已有有效诊断和同范围授权继续复用
- **AND** 检查 MUST NOT 改变既有验证证据、Git 授权或 worktree 清理契约

#### Scenario: Git 操作由 Agent 之外执行
- **WHEN** 用户或其他程序绕过 Agent Skill 和 Buildr worktree create 入口直接改变 Git 工作区
- **THEN** Buildr MUST NOT 声称能够即时感知该操作
- **AND** 智能体（Agent）后续继续工作时 MUST 核对当前事实；需要运行时（Runtime）诊断时使用当前产品入口，而非宣称已自动观察到变化
