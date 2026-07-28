# Buildr CLI 产品表面

## Purpose

定义 Buildr CLI 与关联数据标识的 public、legacy compatibility、internal/maintenance 分类、可见性和兼容边界。
## Requirements

### Requirement: CLI 产品表面必须显式分层
Buildr MUST 将当前可执行命令、兼容输入和内部数据标识区分为 public、legacy compatibility 与 internal/maintenance 产品表面，并在 help、产品文档、current-state knowledge 和验证中保持同一分类。

#### Scenario: Public workspace surface
- **WHEN** 用户或 Agent 查看 Buildr 根帮助与主产品文档
- **THEN** Buildr MUST 展示正式支持的 workspace 初始化、资产维护、诊断、修复、runtime 操作和本地应用入口
- **AND** `buildr app --target <workspace>` MUST 作为人查看 Workspace 并执行受控 metadata 修改的 public 产品入口
- **AND** `buildr app preview start|list|stop` MUST 作为 Agent 并行验收 task worktree 的 public 开发入口
- **AND** 低频但由 doctor、bootstrap 或 Buildr Skill 正式调用的 workspace 命令 MUST 保持 public，而不能仅因其底层或高级而标为 internal

#### Scenario: Local application help
- **WHEN** 用户运行 `buildr app --help`、`buildr help app` 或 preview 子命令帮助
- **THEN** Buildr MUST 说明默认本机应用与 task preview 的边界、target、loopback、port、实例身份、页面修改白名单和 prompt-only 新增边界
- **AND** help MUST 明确 preview 不安装或替换 `Buildr Dev.app`
- **AND** help MUST NOT 声称本地应用提供数据库、远程服务或 Agent session connector

#### Scenario: Workspace init description help
- **WHEN** 用户运行 `buildr init --help`
- **THEN** Buildr MUST 展示可选 `--description <description>` 参数
- **AND** help MUST 说明未提供说明时会产生待补全提示，而不是静默编造 Workspace 说明

#### Scenario: Internal maintenance surface
- **WHEN** 根帮助或产品文档提及产品构建、发布、自举或 workflow 编排命令
- **THEN** Buildr MUST 将这些入口与普通 workspace 用户主路径分区并标明 maintenance 或 workflow internal 用途
- **AND** 分类 MUST NOT 改变命令的现有可执行性、安全契约或安装后行为

### Requirement: Canonical 输出不得推荐 legacy 形式
Buildr MUST 只在兼容解析、迁移诊断或历史事实中接受和描述 legacy surface；主帮助、主题帮助、bootstrap canonical 示例、doctor repair command 和当前使用说明 MUST NOT 生成或推荐 legacy 参数、scope、Project Skill source 或数据布局。

#### Scenario: Legacy 输入仍被兼容
- **WHEN** 旧 workspace 或旧调用使用仍受支持的 legacy 参数、scope 或 Project Skill manifest
- **THEN** Buildr MUST 按对应 canonical spec 保留、迁移或兼容解析
- **AND** Buildr MUST 使用 `legacy Project Skill source` 等明确限定术语输出可操作的 warning、info 或迁移提示
- **AND** Buildr MUST NOT 静默把 legacy 形式重新定义为 canonical

#### Scenario: Unsupported layout is not compatibility surface
- **WHEN** 输入使用 canonical specs 已明确拒绝的 `organizations/<org>/` layout 或新的 Project Skill source scope
- **THEN** Buildr MUST 继续拒绝该输入
- **AND** 产品分类 MUST NOT 将它描述为受支持的 current source surface

#### Scenario: Canonical Skill 帮助使用新模型
- **WHEN** 用户查看 Skills add/remove/render、Project capability 或 runtime destination 帮助
- **THEN** 输出 MUST 将 workspace 说明为唯一 source authority
- **AND** MUST 将 Project 说明为 capability/applicability context
- **AND** MUST 将 user/workspace 说明为 runtime destinations

### Requirement: service create rules 参数仅作为兼容 no-op
Buildr MUST 将 `service create --rules <path>` 保留为 deprecated legacy compatibility no-op，而 Service Rule 的唯一 canonical 入口 MUST 是 Service 目录层级的 `AGENTS.md`。

#### Scenario: 旧调用携带 rules 参数
- **WHEN** Agent 调用 `buildr service create <project>/<service> <repo-ref> --rules <path>`
- **THEN** Buildr MUST 保持不带该参数时的 Service 创建和登记语义
- **AND** Buildr MUST 输出 deprecated 与迁移提示
- **AND** Buildr MUST NOT 读取、验证、复制或持久化 `<path>`，也不得向 Service manifest 写入 rule-source 字段

#### Scenario: Canonical Service help
- **WHEN** 用户查看根帮助、`service create --help`、bootstrap guide 或当前产品示例
- **THEN** canonical usage MUST NOT 包含 `--rules`
- **AND** Service 主题说明 MUST 指向目录层级 `AGENTS.md` 约定

### Requirement: Package 命令属于产品维护表面
Buildr MUST 保留 `package check` 与 `package build` 作为产品包校验、构建和发布维护命令，并 MUST NOT 将它们描述为普通 workspace 用户的日常资产管理入口。

#### Scenario: Maintainer discovers package commands
- **WHEN** 产品维护者查看根帮助的维护分区、package 主题帮助或 release checklist
- **THEN** Buildr MUST 提供 `package check` 与 `package build` 的准确用途和用法
- **AND** 两个命令 MUST 继续遵循现有 package manifest、output receipt、integrity 与安全替换契约

#### Scenario: User follows onboarding path
- **WHEN** 普通用户或 Agent 按 quick start、bootstrap 或主 workspace workflow 操作
- **THEN** Buildr MUST NOT 要求运行 `package check` 或 `package build` 才能完成 workspace onboarding 和日常维护

### Requirement: package source identity 不得成为公开资产 id
Buildr MUST 将 `package:<source-id>` 保留为 package manifest `skillSources` 与随包 Skill resolver 之间的内部 source reference，并 MUST NOT 将其作为用户创建的 Skill id、通用 source scheme 或 `skills add` 的公开参数格式推荐。

#### Scenario: Package baseline references bundled source
- **WHEN** Buildr package baseline 使用 `source: package:<source-id>` 引用已声明的 `skillSources`
- **THEN** Buildr MUST 按现有 package manifest 与 runtime 约束解析该引用
- **AND** `<source-id>` MUST 继续只标识随包 source，不改变 Skill 的用户可见 asset id

#### Scenario: Public Skill authoring guidance
- **WHEN** 用户查看 workspace Skill source、Project capability/applicability 或 user/workspace destination 的创建与安装说明
- **THEN** Buildr MUST 只推荐公开支持的 local path、remote source 或 resolved source 模型
- **AND** 说明 MUST NOT 引导用户手工构造 `package:<source-id>` 引用

### Requirement: 产品表面分类必须由验证保护
Buildr 产品验证 MUST 同时验证 public 可发现性、legacy 输入兼容与 canonical 输出收敛、internal/maintenance 定位，防止 help、docs、spec 和实现再次漂移。

#### Scenario: Verify help and compatibility boundaries
- **WHEN** 产品验证检查根帮助、主题帮助、bootstrap guide 和 legacy Service 调用
- **THEN** 验证 MUST 确认 public 命令可发现、maintenance/workflow internal 命令有明确分区、canonical Service usage 不含 `--rules`
- **AND** 验证 MUST 确认携带 `--rules` 的旧调用仍输出 deprecated 提示且不写入 rule-source metadata

#### Scenario: Verify internal source identity boundary
- **WHEN** package check 或产品测试检查随包 Skill source reference
- **THEN** 验证 MUST 确认 `package:<source-id>` 只能解析 package manifest 已声明的 source
- **AND** 主用户文档与公开 Skill authoring help MUST NOT 把该引用描述为用户 asset id

### Requirement: CLI 必须公开自身版本 identity
Buildr CLI MUST 提供无需 workspace、网络或 Git 状态即可读取当前实际执行 package identity 的版本入口。

#### Scenario: 使用全局版本参数
- **WHEN** 用户运行 `buildr --version` 或 `buildr -V`
- **THEN** Buildr MUST 向 stdout 输出当前 CLI package 的 semver version
- **AND** 命令 MUST 以 0 退出且不读取或修改 workspace

#### Scenario: 使用 version 命令
- **WHEN** 用户运行 `buildr version`
- **THEN** Buildr MUST 输出与 `buildr --version` 相同的当前 package version
- **AND** checkout 与 npm tarball 入口 MUST 对相同 candidate tree 输出相同值

### Requirement: CLI 帮助入口必须支持命令式主题查询
Buildr CLI MUST 让 `help <command...>` 与既有 `<command...> --help`、`<command...> -h` 共享同一 canonical topic 和帮助正文。

#### Scenario: 查询一级命令帮助
- **WHEN** 用户运行 `buildr help doctor`
- **THEN** Buildr MUST 输出与 `buildr doctor --help` 相同的 canonical doctor 帮助
- **AND** 命令 MUST 以 0 退出且无 workspace 副作用

#### Scenario: 查询嵌套命令帮助
- **WHEN** 用户运行 `buildr help component install`
- **THEN** Buildr MUST 输出与 `buildr component install --help` 相同的 canonical topic
- **AND** 帮助 MUST NOT 回退到不相关的根帮助

### Requirement: 未知命令必须返回简洁可操作诊断
Buildr CLI MUST 对无法匹配的命令返回稳定非零退出码、未知输入和可执行下一步，而不是默认输出完整 legacy usage。

#### Scenario: 未知命令存在相近候选
- **WHEN** 用户运行拼写接近公开命令的未知输入
- **THEN** Buildr MUST 在 stderr 标识未知命令并给出有限的相近 canonical 命令建议
- **AND** Buildr MUST 提示通过 `buildr --help` 查看完整帮助并以 2 退出

#### Scenario: 未知 help topic
- **WHEN** 用户运行 `buildr help <unknown-topic>`
- **THEN** Buildr MUST 报告未知 help topic 而不是静默显示根帮助
- **AND** diagnostics MUST 保持零 workspace 副作用

#### Scenario: 不占用小写 v
- **WHEN** 用户运行 `buildr -v`
- **THEN** Buildr MUST NOT 将其解释为 version
- **AND** Buildr MUST 以未知 option 诊断失败，为未来 verbose 语义保留该短参数

### Requirement: Skills CLI 明确区分 workspace source 与 render destination
Skills CLI MUST 将 workspace 作为唯一 source authority，并 MUST 使用 `--destination user|workspace` 表达 runtime 投射位置。

#### Scenario: skills add/remove canonical help
- **WHEN** 用户查看 `skills add` 或 `skills remove` 帮助
- **THEN** canonical usage MUST 只要求 Buildr workspace target
- **AND** MUST NOT 推荐 Project source scope

#### Scenario: skills render canonical help
- **WHEN** 用户查看 `skills render` 帮助
- **THEN** CLI MUST 解释 `--target` 是 source workspace
- **AND** MUST 解释 `--destination workspace` 写当前工作目录 runtime、`--destination user` 写当前 Agent 用户层
- **AND** 省略 destination 的兼容默认 MUST 为 `workspace`

#### Scenario: legacy Project scope
- **WHEN** 用户执行带 `--scope projects/<project>` 的 Skills 命令
- **THEN** CLI MUST 返回结构化 breaking diagnostic
- **AND** diagnostic MUST 包含 Project Skill migration nextAction

### Requirement: Skill 冲突输出使用稳定机器契约
Skills render、sync、runtime check 和 doctor MUST 使用稳定 diagnostics 表达 Buildr 管理 Skill 的 identity、ownership、内容和已观察冲突，并 MUST 使用独立 assurance metadata 表达 runtime inventory 的可见性上限。

#### Scenario: 同名冲突 JSON
- **WHEN** JSON mode 检测到 Buildr 管理候选 Skill 的名称冲突
- **THEN** finding MUST 包含 candidate skillId、asset/source identity、destination、observed entries、ownership、digests、inventory evidence 和 nextActions
- **AND** MUST 使用稳定 reason，例如 `name_conflict`、`foreign_owner` 或 `equivalent_external`

#### Scenario: Partial inventory JSON
- **WHEN** adapter inventory 只能部分观察 Agent Skills 集
- **THEN** runtime scope MUST 返回 `skillInventoryEvidence.evidence: partial` 和 `opaqueSources`
- **AND** doctor health summary MUST NOT 将该 assurance metadata 计为 warning、error 或 actionable finding

#### Scenario: 冲突导致零写入
- **WHEN** 任一 Buildr 管理候选 finding 为 blocking
- **THEN** command MUST 以非零状态结束并报告 `mutationApplied: false`
- **AND** MUST NOT 只更新未冲突候选

### Requirement: Commands CLI 显式表达 task context
Buildr CLI MUST 让 Commands catalog 维护与 Project requirement/machine check context 在帮助、参数和 JSON 中可区分。

#### Scenario: Commands help
- **WHEN** 用户查看根帮助或 Commands 主题帮助
- **THEN** CLI MUST 将 `commands add/remove` 描述为 workspace catalog 维护
- **AND** MUST 将 Project requirement 维护描述为引用管理
- **AND** MUST 将 `commands check --project <id>` 描述为 context-aware machine check

#### Scenario: Commands check JSON
- **WHEN** Agent 请求 Commands JSON 输出
- **THEN** JSON MUST 分离 `catalog`、`requirements`、`effectiveConstraints`、`observations` 和 `findings`
- **AND** 每项 MUST 提供稳定 ID、provenance 和 reason code

#### Scenario: 无效 Project context
- **WHEN** 用户提供未登记、重复或不安全的 Project id
- **THEN** CLI MUST 在执行 version probe 前失败
- **AND** MUST 输出可操作诊断且不得修改任何 source 或 machine state

#### Scenario: Legacy version constraint guidance
- **WHEN** CLI 读取把 requirement version constraint 保存在旧 catalog definition 的兼容输入
- **THEN** canonical 输出 MUST 说明其 workspace default requirement 语义或迁移路径
- **AND** MUST NOT 将其静默复制到每个 Project

### Requirement: Project CLI 必须使用 canonical Domain 术语
Buildr CLI MUST expose Project creation and diagnostics using `code`, `name`, source and integration branch terminology while preserving explicit legacy input compatibility.

#### Scenario: Project create help
- **WHEN** 用户运行 `buildr project create --help`
- **THEN** help MUST document `--name`, `--description`, `--repo`, `--remote` and `--integration-branch`
- **AND** help MUST explain workspace versus Git source and MUST NOT call integration branch the current branch

#### Scenario: Legacy title input
- **WHEN** an existing automation uses `--title`
- **THEN** CLI MUST accept it as compatibility input and map it to Project `name`
- **AND** canonical output and examples MUST use `--name`

#### Scenario: App help includes Project boundary
- **WHEN** 用户运行 `buildr app --help`
- **THEN** help MUST mention Project list/detail and low-risk name/description edits
- **AND** help MUST state that Project creation is prompt-only and Git state changes are not performed by the UI

### Requirement: Project JSON 输出必须区分声明与观察
Buildr CLI and doctor JSON MUST expose canonical Project identity, declared source and observed Git state as separate objects.

#### Scenario: Canonical Project JSON
- **WHEN** Agent requests JSON diagnostics for a v2 registry
- **THEN** each Project MUST expose id, workspaceId, code, name, description and source
- **AND** observed Git fields MUST NOT appear inside source or persisted Domain fields

#### Scenario: Compatibility Project JSON
- **WHEN** Agent requests diagnostics for a readable v1 registry
- **THEN** output MUST mark migration required and expose a canonical next action
- **AND** MUST NOT claim that generated compatibility identity has been persisted

### Requirement: Service CLI 必须使用 canonical Domain 术语
Service CLI MUST 使用 `code`、`name`、`description`、`type`、`source` 与 `integrationBranch` 表达 canonical Domain，并兼容旧参数。

#### Scenario: 查看 service create 帮助
- **WHEN** 用户查询 `service create` 帮助
- **THEN** canonical usage MUST 展示 `--name`、`--description`、`--type` 与 `--integration-branch`
- **AND** `--branch` MUST 只作为兼容别名说明

#### Scenario: 创建 Service JSON 输出
- **WHEN** Agent 使用 JSON 输出创建或登记 Service
- **THEN** 输出 MUST 包含稳定 Domain、registry revision 与 declared/observed 分离结果

### Requirement: Project 验证执行必须成为公开 CLI 表面
Buildr MUST 将 `buildr verification run` 登记为 public CLI，支持显式 `--project`、`--level affected|candidate`、`--target`、可选 task environment context、evidence output 与 `--json`；根帮助和专题帮助 MUST 说明该命令执行 Project policy，而不是调度 Agent 或创建任务。

#### Scenario: 用户查看 verification run 帮助
- **WHEN** 用户运行 `buildr help verification run`
- **THEN** 帮助 MUST 展示必需参数、task context 可选参数、evidence 生命周期和恢复诊断
- **AND** 帮助 MUST 不把 Buildr Product 专用测试入口描述为普通 Workspace 默认值

#### Scenario: 参数不足时请求 JSON
- **WHEN** 调用方缺少 Project、保证级别或必要 task binding 并请求 `--json`
- **THEN** 命令 MUST 返回登记的机器可读错误并以非零状态退出
- **AND** stdout MUST 保持单一 JSON 对象且不得混入 worker 文本
