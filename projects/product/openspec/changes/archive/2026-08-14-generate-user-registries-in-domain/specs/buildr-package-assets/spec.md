## MODIFIED Requirements

### Requirement: 随包资产使用 package manifest
Buildr MUST 使用产品 root 下的 `package/manifest.yml` 声明产品随包定义、内容资产和交付 target；用户 Workspace 的持久化配置与 registry MUST 由对应 Domain writer 生成，不得作为随包物理源。

#### Scenario: 随包资产边界
- **WHEN** Buildr 发布产品包或校验 package baseline
- **THEN** 发布包 MUST 只包含产品 root 内 `package/manifest.yml` 显式声明或引用的产品定义、内容资产和 CLI 运行所需文件
- **AND** 发布包 MUST NOT 包含用于直接复制为用户状态的 Workspace、Project 或 Service 配置源

#### Scenario: 开发资产引用随包资产
- **WHEN** Buildr 产品开发需要验证初始化或 runtime baseline
- **THEN** package manifest MAY 引用产品 root 下的 Rule、Skill、Command collection、Component definition、Agent metadata、文档或其他内容资产
- **AND** package manifest MUST NOT 以开发仓内的用户态配置文件作为初始化源

#### Scenario: 默认 workspace baseline 源进入 workspace target
- **WHEN** Buildr 维护默认 workspace baseline
- **THEN** 默认 workspace 规则、Git ignore 模板、Command collection 和 Workspace Skill 正文等产品内容源 MUST 位于产品 root 下的 `package/targets/workspace/`
- **AND** `.buildr/workspace.yml`、`projects/manifest.yml`、`rules/manifest.yml`、`skills/manifest.yml`、`commands/manifest.yml` 与 `components/manifest.yml` MUST NOT 位于该 target 或 npm tarball

#### Scenario: 默认 Project 模板源归属 workspace projects 容器
- **WHEN** Buildr 维护默认 Project baseline 内容
- **THEN** `AGENTS.md` 等真实 Project 内容模板 MAY 位于产品 root 下的 `package/targets/workspace/projects/`
- **AND** `capabilities.yml`、`commands.yml` 与 `services/manifest.yml` MUST NOT 作为 Project 模板源或进入 npm tarball

#### Scenario: 随包资产不得引用开发 overlay
- **WHEN** Buildr 校验 `package/manifest.yml`
- **THEN** package baseline MUST NOT 引用产品仓根特有规则、私有业务项目、私有组织名、私有路径或用户态配置源

#### Scenario: 通用根规则进入 workspace target 规则源
- **WHEN** Buildr 维护默认 root 工作规则
- **THEN** 通用规则 MUST 以产品 root 下 `package/targets/workspace/rules/` 中可独立维护的规则正文作为源
- **AND** package manifest MUST 显式声明 Rule entry 和允许发布的正文文件，不得发布开发仓的 `rules/manifest.yml`

### Requirement: package manifest 声明发布边界
Buildr MUST 使用 `package/manifest.yml` 声明产品随包资产 include、内容映射、Builtin/Component 定义、模板变量和禁止内容；用户态配置的 schema、默认值与写入 MUST 由 canonical Domain writer 拥有。

#### Scenario: package check 校验 manifest
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 校验 manifest include 和内容映射源路径存在、模板变量完整，并报告禁止内容
- **AND** Buildr MUST 拒绝用户态配置源出现在 `workspaceFiles`、`projectFiles`、`package/targets/workspace/` 或最终发布 inventory
- **AND** Buildr MUST 报告 `.gitkeep` 占位文件

#### Scenario: package check 校验初始化闭环
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 在不读取用户态配置模板的前提下于临时目录执行初始化，并验证 `doctor --json` 通过

### Requirement: 初始化从 manifest 映射生成
Buildr MUST 从 `package/manifest.yml` 的产品声明和内容映射生成默认 root/Project 内容，并 MUST 通过 canonical Domain writer 生成 Workspace、Project 与 Service 的持久化配置。

#### Scenario: 渲染 root baseline
- **WHEN** Agent 执行 `buildr init --target <dir> --name <name>`
- **THEN** Buildr MUST 使用 manifest `workspaceDirectories` 和 `workspaceFiles` 生成 Rule 正文、Skill 正文、Command collection、Component definition、AGENTS 与 Git 模板等内容资产
- **AND** Buildr MUST 通过 canonical writer 生成 `.buildr/workspace.yml`、`projects/manifest.yml`、`rules/manifest.yml`、`skills/manifest.yml`、`commands/manifest.yml` 与 `components/manifest.yml`
- **AND** Builtin 与 Component 条目 MUST 从 package 声明收敛到生成后的 registry
- **AND** Buildr MUST 直接创建必要空目录，不通过 `.gitkeep` 占位文件表达目录意图

#### Scenario: 已有 root AGENTS 时保留组合入口
- **WHEN** Agent 执行 `buildr init --target <dir> --name <name>`
- **AND** `<dir>/AGENTS.md` 已经存在
- **THEN** Buildr MUST NOT 覆盖 `<dir>/AGENTS.md`
- **AND** Buildr MUST 补齐或修复 Buildr required block
- **AND** Buildr MUST NOT 生成 `<dir>/AGENTS.workspace.md`

#### Scenario: 新 workspace 仍生成 root AGENTS
- **WHEN** Agent 执行 `buildr init --target <dir> --name <name>`
- **AND** `<dir>/AGENTS.md` 不存在
- **THEN** Buildr MUST 将默认 workspace 规则写入 `<dir>/AGENTS.md`

#### Scenario: root baseline 不包含 ASSETS
- **WHEN** Buildr 生成默认 root baseline
- **THEN** Buildr MUST NOT 默认生成 `ASSETS.md`

#### Scenario: root AGENTS 提供 Buildr required block
- **WHEN** Buildr 生成默认 root `AGENTS.md`
- **THEN** 文件 MUST 包含 Buildr required block并引用 `rules/buildr/core.md`
- **AND** Buildr workspace 基础模型和硬边界 MUST 由 Buildr Core 承载
- **AND** 场景化操作流程 MUST 由对应 Skill 承载
- **AND** 文件 MUST NOT 引用产品仓私有业务项目、私有路径或私有业务规则

#### Scenario: 默认 root baseline 不生成 README
- **WHEN** Buildr 生成默认 root baseline
- **THEN** Buildr MUST NOT 默认生成 `README.md`

#### Scenario: 渲染 project baseline
- **WHEN** Agent 执行 `buildr project create <project>`
- **THEN** Buildr MUST 使用 manifest `projectDirectories` 和 `projectFiles` 生成 AGENTS 等 Project 内容资产
- **AND** Buildr MUST 通过 canonical writer 生成缺失的 `capabilities.yml`、`commands.yml` 与 `services/manifest.yml`
- **AND** `services/manifest.yml` MUST 使用新建 Project 的真实 UUID

#### Scenario: 同步补齐新增配置
- **WHEN** 当前版本为 Workspace 或 Project 引入新的用户态配置且目标文件缺失
- **THEN** `buildr sync` 或对应显式 update MUST 通过 canonical writer 生成 schema-valid 的空配置
- **AND** Buildr MUST NOT 从产品开发配置复制该文件或覆盖已有有效用户内容

### Requirement: package manifest 声明产品内置 Agent Skills
Buildr package manifest MUST 显式声明产品随包内置 Agent Skills，并将产品 Skill 定义与用户 Workspace `skills/manifest.yml` 分离。

#### Scenario: 声明 agentSkills
- **WHEN** Buildr 产品包包含内置 Agent Skill
- **THEN** `package/manifest.yml` MUST 通过专用字段声明 Skill id、源路径和适用 runtime
- **AND** 产品入口 Buildr Skill 源路径 MUST 位于 `package/targets/runtime/skills/<skill-id>/`

#### Scenario: agentSkills 不参与 init baseline
- **WHEN** Agent 执行 `buildr init`
- **THEN** manifest 中声明的产品入口 Agent Skills MUST NOT 被复制到目标 workspace `skills/` 目录
- **AND** Workspace `skills/manifest.yml` MUST 由 writer 使用真实 Workspace identity 生成，并由 Builtin/Component 声明收敛

#### Scenario: package check 校验内置 Agent Skills
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 校验 manifest 声明的产品内置 Agent Skill 源路径存在
- **AND** Buildr MUST 校验该 Skill 不包含 forbidden patterns
- **AND** Buildr MUST 校验该 Skill 具备可渲染的 `SKILL.md`

#### Scenario: package check 校验 bootstrap 入口契约
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 校验 bootstrap guide 和 Buildr Skill 满足 `package/bootstrap/contract.yml`
- **AND** bootstrap 契约 MUST 分别约束 guide 的恢复入口、Buildr Skill 的必要章节、生成后 runtime Skill 的 adapter 内容和禁用入口
- **AND** bootstrap 契约 MUST NOT 要求 bootstrap guide 覆盖 Buildr Skill 的完整资产维护细节

### Requirement: Package 顶层职责必须分离
Buildr package MUST 将维护说明、产品声明、恢复入口和交付 target 表达为不同职责，并 MUST 排除由用户 Workspace writer 生成的持久化配置。

#### Scenario: Package 维护说明与机器契约
- **WHEN** 维护者查看 `package/` 顶层
- **THEN** `package/README.md` MUST 只说明 package 的维护用途
- **AND** `package/manifest.yml` MUST 是产品定义、内容资产和 source-to-target 映射的机器契约

#### Scenario: Bootstrap 恢复入口
- **WHEN** Buildr Skill 不可用且 Agent 运行 `buildr bootstrap guide`
- **THEN** Buildr MUST 从 `package/bootstrap/guide.md` 输出恢复指南
- **AND** bootstrap 资产 MUST NOT 被当作 workspace target 或 runtime target 物化

#### Scenario: Target 目录只表达交付目的地
- **WHEN** Buildr 维护 `package/targets/`
- **THEN** `package/targets/workspace/` MUST 只保存面向 Workspace 的产品内容源，不得保存用户持久化配置源
- **AND** `package/targets/runtime/` MUST 只保存直接面向 Agent runtime 的交付源

#### Scenario: 旧 package 源路径被拒绝
- **WHEN** Buildr 校验新版本 package manifest 和活动产品引用
- **THEN** Buildr MUST NOT 接受 `package/workspace/` 或 `package/agent-skills/` 作为 canonical 源路径
- **AND** 新版本 npm package MUST NOT 同时发布旧路径兼容副本

### Requirement: package baseline 支持命令行工具清单入口
Buildr MUST 通过 Commands Domain writer 为默认 Workspace 生成命令行工具清单入口，而不得发布用户态 `commands/manifest.yml` 源。

#### Scenario: 初始化命令行工具清单入口
- **WHEN** Agent 执行 `buildr init --target <dir> --name <name>`
- **THEN** Buildr MUST 在 Workspace 中生成 `commands/manifest.yml` 或等价命令行工具清单入口

#### Scenario: 默认命令行工具清单为空
- **WHEN** Buildr 当前没有随包提供默认外部命令行工具声明
- **THEN** Commands Domain writer MUST 初始化空的命令行工具清单
- **AND** 默认清单 MUST NOT 声明 Buildr 自身为 Workspace 命令行工具资产

#### Scenario: package check 校验命令行工具清单入口
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 校验 Commands Domain writer 可以在临时 Workspace 生成命令行工具清单入口
- **AND** Buildr MUST 校验默认命令行工具 manifest 不包含私有路径、私有组织名或个人机器状态
