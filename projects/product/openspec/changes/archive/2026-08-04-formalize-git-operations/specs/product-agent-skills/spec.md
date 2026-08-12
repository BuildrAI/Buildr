## ADDED Requirements

### Requirement: Git Operations 生成精简提交信息
Buildr `git-operations` Skill MUST 为已授权 commit operation 提供精简的 Conventional Commits 提交信息规则，并 MUST 遵循 Core 和更具体的提交语言约定。

#### Scenario: 生成提交主题
- **WHEN** Agent 为已确认提交范围生成 commit message
- **THEN** subject MUST 使用 `<type>(<scope>): <subject>` 格式，其中 scope 可选
- **AND** type MUST 从 `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert` 中选择
- **AND** Agent MUST 基于实际提交内容选择 type 和 scope，不得猜测不明确的 scope

#### Scenario: 补充正文或破坏性变更
- **WHEN** 变更动机、行为差异或破坏性影响需要补充说明
- **THEN** Agent MUST 使用可选正文说明动机和行为差异
- **AND** 破坏性变更 MUST 使用 `BREAKING CHANGE:` 说明
- **AND** 不需要补充信息时 MUST 保持仅一行 subject

#### Scenario: 应用提交语言约定
- **WHEN** Agent 使用 Git Operations 生成 commit message
- **THEN** Git Operations MUST 遵循 Core 的默认提交语言和当前 scope 的更具体约定
- **AND** Git Operations MUST NOT 在 Skill 正文中复制 Core 的语言约束

#### Scenario: 仓库已有明确格式
- **WHEN** 项目或仓库规则定义了比 Git Operations 默认格式更具体的提交约定
- **THEN** Agent MUST 遵循更具体的项目或仓库约定

## MODIFIED Requirements

### Requirement: 产品内置 Agent Skills
Buildr MUST 支持面向支持 runtime 的产品内置 Agent Skills，将其作为 workspace sync 的一部分进行同步，并 MUST 通过 capability contracts 路由可替换的 workspace 专业动作。

#### Scenario: 产品内置 Buildr Skill
- **WHEN** Buildr 产品包包含 Buildr 使用 Skill
- **THEN** 该 Skill MUST 由 package 的产品入口 Skill 声明管理
- **AND** `buildr skill install <agent>`、`buildr sync <agent>` 和首次 `buildr init --agent <agent>` MUST 能够为支持的 Agent runtime 安装或修复该 Skill
- **AND** 该 Skill MUST NOT 写入 workspace 的 `skills/manifest.yml`

#### Scenario: Buildr Skill 感知 Buildr 产品入口更新意图
- **WHEN** 用户要求 Agent“更新 Buildr”“同步 Buildr”或表达明确等价意图，且没有限定只更新 CLI
- **THEN** 产品内置 Buildr Skill 的 description 和正文 MUST 将这些表达统一识别为更新 Buildr CLI 与产品入口 Buildr Skill
- **AND** Buildr Skill MUST 引导 Agent 先运行 `buildr update`
- **AND** update 成功后 Agent MUST 重新解析当前 `buildr` 入口，再运行 `buildr skill install <agent> --target <dir>`
- **AND** Agent MUST NOT 因该意图同步其他 workspace 产品能力或执行完整 workspace sync

#### Scenario: Buildr Skill 感知只更新 CLI 意图
- **WHEN** 用户明确要求“只更新 CLI”、不要安装或修复 Buildr Skill，或表达明确等价限制
- **THEN** Buildr Skill MUST 引导 Agent 只运行 `buildr update`
- **AND** Agent MUST NOT 追加 Skill install、sync、runtime render 或 workspace doctor

#### Scenario: Buildr Skill 感知 Git 管理的 workspace 同步意图
- **WHEN** 用户要求 Agent“更新 workspace”“同步 workspace”或表达明确等价意图，且 workspace root 由 Git 管理
- **THEN** Buildr Skill MUST resolve `buildr.git-operations/v1`，并把明确 workspace、upstream、update operation 与授权交给 selected provider
- **AND** Git 更新成功后 Agent MUST 直接运行 `buildr sync <agent> --target <dir>`，不得因 sync 再次询问授权
- **AND** Agent MUST NOT 先运行 `buildr update`
- **AND** Agent MUST 使用 sync 的最终 doctor 结果判断 workspace 同步是否完成

#### Scenario: Git workspace update provider 不可用
- **WHEN** `buildr.git-operations/v1` consumer readiness is `blocked`
- **THEN** Buildr Skill MUST stop before changing the checkout
- **AND** Agent MUST report the readiness reason and executable provider or binding nextActions
- **AND** Agent MUST NOT silently fall back to a removed builtin or hand-written Git route

#### Scenario: Git workspace 无法安全更新
- **WHEN** workspace Git 更新遇到本地改动、分叉、冲突、缺少 upstream 或其他需要用户决策的状态
- **THEN** Agent MUST 停止并说明实际状态和可执行选项
- **AND** Agent MUST NOT 自动 stash、rebase、merge、覆盖或继续执行 `buildr sync`

#### Scenario: Buildr Skill 感知非 Git workspace 同步意图
- **WHEN** 用户要求 Agent“更新 workspace”“同步 workspace”或表达明确等价意图，且 workspace root 不由 Git 管理
- **THEN** Buildr Skill MUST 直接运行 `buildr sync <agent> --target <dir>`
- **AND** Agent MUST NOT 先运行 `buildr update`
- **AND** Agent MUST 使用 sync 的最终 doctor 结果判断 workspace 同步是否完成

#### Scenario: CLI update 受阻时停止 Buildr 产品入口更新
- **WHEN** `buildr update` 返回 Git、registry、权限或来源决策点
- **THEN** Buildr Skill MUST 向用户说明阻塞事实和可执行选项
- **AND** Agent MUST NOT 使用旧 CLI 继续安装 Buildr Skill

#### Scenario: Buildr Skill 感知首次初始化意图
- **WHEN** 用户要求 Agent 首次使用 Buildr 管理尚未初始化的目录，且 runtime adapter 已确认
- **THEN** Buildr Skill MUST 引导 Agent 使用 `buildr init --agent <agent>` 完成源资产初始化、产品 Buildr Skill 安装、runtime render 和 doctor
- **AND** Buildr Skill MUST NOT 把独立 `skill install` 或 `sync` 列为完成首次 onboarding 的额外必需步骤

#### Scenario: Buildr Skill 与用户 Skills 保持区分
- **WHEN** Buildr 同步产品内置 Skills
- **THEN** Buildr MUST 将产品入口 Buildr Skill 与 `skills/buildr/*` 能力 Skills 区分开
- **AND** 用户 Skill MUST 只在 workspace `skills/manifest.yml` 和 workspace 源目录维护
- **AND** Project 专用语义 MUST 由 capability/applicability context 表达，而不是编辑 runtime 或 Project Skill source

#### Scenario: 内置能力 Skills 默认 optional
- **WHEN** Buildr 提供 `skills/buildr/*` 能力 Skills
- **THEN** 这些 Skills MUST 默认为 optional
- **AND** 用户 MUST 能够卸载 optional 内置 Skill，卸载时删除源目录和 runtime 投射，并在 `skills/manifest.yml` 保留卸载状态
- **AND** Buildr MUST report any required consumers that become blocked without silently restoring the builtin

## REMOVED Requirements

### Requirement: Git Ops 生成精简提交信息
**Reason**: `git-ops` 入口被唯一 `git-operations` Skill 替换，旧 requirement 名称会保留冲突 routing。

**Migration**: 使用新增“Git Operations 生成精简提交信息”要求；提交格式与 Core 语言分层保持不变。
