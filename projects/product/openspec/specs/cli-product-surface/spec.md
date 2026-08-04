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
Buildr MUST 将 `buildr verification run` 登记为 public transient execution CLI，要求显式 `--project`、一个或多个 `--capability`、`--target-identity` 与 `--target`，并支持可选 Task Environment context、capability effects/resource authorization、bounded concurrency 与 `--json`。`effects.authorization: explicit` MUST 要求精确 `--authorize-capability <id>`，声明为 explicit 的资源 MUST 要求精确 `--authorize-resource <id>`。execution summary MUST 只写 provider-owned 临时目录，不得提供 caller-managed output writer。根帮助和专题帮助 MUST 说明该命令只执行 Project v2 中已有 command capabilities，不选择语义适用性、不调度 Agent、不创建 Task、不写 current Result。

#### Scenario: 用户查看 verification run 帮助
- **WHEN** 用户运行 `buildr help verification run`
- **THEN** 帮助 MUST 展示显式 capability、target identity、可选 Task context 与 transient evidence lifecycle
- **AND** 帮助 MUST 不出现 affected/candidate level、required assurance、Buildr Product 专用默认测试或 Result writer 暗示

#### Scenario: 参数不足时请求 JSON
- **WHEN** 调用方缺少 Project、capability、target identity 或必要 Task binding 并请求 `--json`
- **THEN** 命令 MUST 返回 `buildr.verification-execution/v1` 的机器可读错误并以非零状态退出
- **AND** stdout MUST 保持单一 JSON 对象且不得混入 worker 文本

#### Scenario: 调用旧 level 参数
- **WHEN** 调用方传入 `--level`、`--include-advisory` 或 `--candidate-fingerprint`
- **THEN** CLI MUST 作为 unknown argument 拒绝
- **AND** MUST NOT 启动 capability 或写 evidence

### Requirement: Task Finish canonical CLI 必须只有 run 与 inspect
Buildr CLI MUST只提供`task finish run`和`task finish inspect`：首次`run` MUST只要求`--task <task-id>`，并从matching ready Task Environment与Task Development Application解析current Development Handoff、Candidate/generation和Content Target；`inspect` MUST只读返回canonical run状态。默认target branch MUST来自retained Workspace当前符号分支，显式`--target-branch` MUST与该分支一致；delivery remote MUST来自显式参数、Environment evidence、target branch upstream或唯一configured remote。当前客户端 MUST NOT注册、加载或执行`actions|advance|resume|renew|recover|cleanup-prepare|cleanup-finalize`，也 MUST NOT接受`--project`、`--change`、assurance/Result bytes、caller-authoredCandidate/evidence/fingerprint/execution-plan/recovery参数。

#### Scenario: 查询 canonical Task Finish 帮助
- **WHEN** 用户运行`buildr help task finish`、`buildr help task finish run`或`buildr help task finish inspect`
- **THEN** 输出 MUST只把run/inspect表述为canonical actions，并说明首次run需要Task ID、current Development Handoff、ready Environment、retained target与可确定remote
- **AND** MUST NOT声称target branch来自worktree start point，或要求调用方理解Project/Change、Candidate kind、step、attempt、action registry或recovery manifest

#### Scenario: 省略 Change 创建 code-only run
- **WHEN** Task Development已经为Change引用为`0..N`的Task形成current handoff
- **THEN** 调用方 MUST只用`task finish run --task <task-id>`进入同一产品执行器
- **AND** CLI MUST把Change context保持为opaque handoff fact，不推断candidate kind或任意active Change

#### Scenario: 调用旧 action
- **WHEN** 调用方使用旧maintenance action、`--project`、`--change`、Verification summary或caller Candidate参数
- **THEN** CLI MUST作为不存在、不支持或unknown argument拒绝
- **AND** MUST NOT加载旧reader/executor、创建run、写Development Receipt或启动Verification

#### Scenario: Canonical store 中存在旧 run shape
- **WHEN** 当前客户端运行或检查Task Finish且canonical store中仍有非v2 run shape
- **THEN** 自动选择 MUST跳过旧shape，显式inspect MUST fail closed
- **AND** MUST NOT加载旧reader、生成迁移receipt或把旧passed evidence映射为新phase

### Requirement: Task Finish CLI 失败必须直接定位并给出唯一 workflow

Task Finish JSON error/result MUST优先返回真实`phase`、`operation|check`、`failureClass`、`code|status|exit`、bounded diagnostic identity与唯一`nextWorkflow|nextAction`。只有Task Development Application报告Candidate applicability stale时，Finish才 MUST指向`task-development`；同一frozen Candidate可恢复的target race、Delivery Adaptation、retained或cleanup阻塞 MUST返回产品生成的exact resume token。未知参数与缺失context MUST返回canonical run/inspect help topic。

#### Scenario: Verification 子检查失败

- **WHEN** Task Development Application报告Content Target、Candidate、gate或handoff stale
- **THEN** CLI MUST返回具体Development finding与`nextWorkflow: task-development`
- **AND** MUST NOT把Finish自己的Git判断伪装成Development applicability evidence

#### Scenario: Delivery Adaptation required

- **WHEN** prepare在最新Delivery Baseline机械应用Task Contribution失败但Development handoff仍current
- **THEN** CLI MUST返回`delivery-adaptation-required`或`semantic-review-required`、carrier facts与exact resume token
- **AND** `nextAction` MUST指向在run-owned carrier完成Agent review后重复canonical run，不得输出`nextWorkflow: task-development`

#### Scenario: Target race 可恢复

- **WHEN** frozen Candidate未变但目标ref在push前漂移
- **THEN** CLI MUST返回`phase: deliver`、`code: task-finish.target-race`和产品生成的resume token
- **AND** nextAction MUST是重复canonical run/resume，而不是手写recovery JSON

### Requirement: Task Record 必须提供五个明确 CLI action
Buildr CLI MUST公开 `buildr task create <task-id>`、`inspect`、`update`、`complete` 和 `abandon`，并 MUST在帮助中将它们描述为 Task Manager 的确定性记录动作。CLI interface MUST只拥有参数解析、Application 调用、输出和退出码；Task Record Application MUST NOT解析 argv、打印 stdout/stderr、修改 process exit state 或向客户端暴露 SQL/storage internals。现有 `buildr task finish run|inspect` MUST保持当前专业语义，直到 Task Finish 模块被替换。

#### Scenario: 查看 Task Manager 帮助
- **WHEN** 用户运行 `buildr help task` 或任一 Task Record action help
- **THEN** CLI MUST展示精确 usage、canonical Workspace target、required/repeatable/exclusive flags、副作用与停止条件
- **AND** MUST说明 Task Manager 不管理 Environment/专业阶段、不自动 Git publication，也不要求 Agent 直接编辑 YAML 或 SQLite

#### Scenario: CLI 与 Application 分层
- **WHEN** command registry 路由任一 Task Record action
- **THEN** CLI interface MUST将结构化 action input 交给共享 Application，并把 result 映射为人类或 JSON 输出
- **AND** Application MUST保持可由 Local App 直接复用，不依赖 argv、stdout/stderr、CLI process state 或客户端 SQL

#### Scenario: 创建 Task Record
- **WHEN** 调用方运行 `buildr task create <task-id> --title <text> --intent <text>` 并按需重复提供 `--project <code>`、`--service <project>/<service>` 或 `--change <project>/<change>`
- **THEN** CLI MUST将明确参数交给 create Application，并只在 SQLite authority 中 canonical record 不存在且校验通过时创建 active Task
- **AND** MUST NOT隐式创建 task environment、OpenSpec Change、Git branch、commit、push 或专业 Receipt/Result

#### Scenario: 检查 Task Record
- **WHEN** 调用方运行 `buildr task inspect <task-id>`
- **THEN** CLI MUST只读返回 canonical logical Task Record 与 response-level digest
- **AND** MUST NOT创建数据库、更新 `updatedAt`、status、result 或任何业务字段

#### Scenario: 更新 Task Record
- **WHEN** 调用方运行 `buildr task update <task-id>` 并提供至少一个登记的 set/add/remove flag
- **THEN** CLI MUST由 Application 对 transaction 内最新 active record 应用明确 mutation 并验证最终完整记录
- **AND** MUST NOT接受 `--input` 完整文档、`--expected-revision`、SQL 或任意 JSON/YAML patch

#### Scenario: 完成或放弃 Task
- **WHEN** 调用方运行 `buildr task complete <task-id> --summary <text> [--no-change]` 或 `buildr task abandon <task-id> --reason <text>`
- **THEN** CLI MUST只允许 Application 执行对应 active-to-terminal transition
- **AND** MUST NOT从专业 records 推断结果、自动执行 Finish、cleanup、commit 或 push

#### Scenario: 已知业务冲突
- **WHEN** action 遇到重复 Task ID、非法状态、终态改写、无效 scope/Change、database/schema failure 或 canonical Workspace 冲突
- **THEN** CLI MUST返回 Task Record v2 family 的 structured blocked result 并以非零状态退出
- **AND** MUST包含稳定 code、未发生 effects 与唯一恢复 next action

#### Scenario: Task Finish 命令保持兼容
- **WHEN** 用户运行现有 `buildr task finish run|inspect` 或对应帮助
- **THEN** CLI MUST继续匹配现有三段式 command key 与当前 Task Finish 契约
- **AND** 新增 `task inspect` MUST NOT遮蔽或误解析 `task finish inspect`

### Requirement: Task Environment 必须提供三个薄公共 CLI action
Buildr CLI MUST 公开 `buildr task environment prepare <task-id>`、`inspect <task-id>` 与 `cleanup <task-id>`，并 MUST 在帮助中将它们描述为 Task Environment Application 的确定性客户端。CLI interface MUST 只拥有参数解析、Application 调用、输出和退出码；Application MUST NOT 解析 argv、打印 stdout/stderr 或修改 process exit state。

#### Scenario: 查看 Task Environment 帮助
- **WHEN** 用户运行 `buildr help task environment` 或任一 action help
- **THEN** 帮助 MUST 展示三个 action、canonical Workspace target、Task ID、effects、授权与停止条件
- **AND** MUST 说明 `prepare` 同时承担首次准备和幂等恢复，Environment Receipt 不属于 Task Record

#### Scenario: 准备或恢复 Task Environment
- **WHEN** 调用方运行 `buildr task environment prepare <task-id>`
- **THEN** CLI MUST 把明确 Task/Workspace input 交给 Application，并返回当前 ready/blocked、实际执行根、关键 probe/effects 与 next action
- **AND** MUST NOT 注册单独 `restore`、接受完整 Receipt/next state 或直接调用 Git worktree provider 形成总结果

#### Scenario: 只读检查 Task Environment
- **WHEN** 调用方运行 `buildr task environment inspect <task-id>`
- **THEN** CLI MUST 只读返回当前机器 Receipt availability、`observedAt`、真实 probe 与 Environment read model
- **AND** MUST NOT 写入 Receipt、准备依赖、创建 checkout、启动/停止资源或执行 cleanup；`observedAt` 只属于本次响应

#### Scenario: 清理 Task Environment
- **WHEN** 调用方运行 `buildr task environment cleanup <task-id>`
- **THEN** CLI MUST 只把已登记的 Finish handoff 或明确 abandon authorization 交给 Application，并返回 removed/retained/blocked 结果
- **AND** MUST NOT 接受任意 shell、删除路径、branch/path ownership 声明或 caller-authored provider result

#### Scenario: 内部资源动作不公开
- **WHEN** 用户检查根帮助、Task Environment topic、command registry 或 public JSON coverage
- **THEN** `resource register/release` MUST NOT 作为公共 CLI action 出现
- **AND** Preview 等已知产品 provider MUST 直接复用 Application，而不是 shell out 或手写 Receipt

### Requirement: Worktree CLI 必须与 Task Environment CLI 分离
Buildr MAY 保留 `buildr worktree create|inspect|cleanup` 作为 Git provider-level 公共命令，但 MUST 只通过 `buildr.git-worktree-result/v1` 返回 Git checkout/branch/HEAD/clean/registration/cleanup evidence。`worktree context|adopt`、session adoption 与 environment-shaped worktree help/JSON MUST 被删除，正式 workflow MUST NOT 以 worktree command result 代替 Task Environment result。

#### Scenario: 用户明确管理 Git worktree
- **WHEN** 用户运行保留的 `worktree create|inspect|cleanup`
- **THEN** CLI MUST 说明该操作只管理 Git provider 事实和精确 Git effects
- **AND** MUST NOT 声称 Runtime/CLI/依赖、ready、恢复、动态资源、session 或总 cleanup authority

#### Scenario: 调用已删除的环境路由
- **WHEN** 调用方运行 `buildr worktree context|adopt` 或旧 environment-shaped action/参数
- **THEN** CLI MUST 作为不存在或不支持的 action 拒绝，并指向 `buildr task environment prepare|inspect`
- **AND** MUST NOT 加载旧 reader/writer、创建 adoption state 或返回旧 Environment result

### Requirement: CLI 必须提供最小 Task Review Result 管理入口
Buildr CLI MUST 公开 `buildr task review inspect <task-id>` 与 `buildr task review record <task-id>`，并 MUST 只把解析后的 canonical target、current target identity 或完整语义字段交给 Task Review Application。CLI MUST NOT 执行 Review、生成 plan/Candidate identity、接受 caller path 或写完整 next-state YAML。

#### Scenario: 查看两个 current slots
- **WHEN** 用户运行 `buildr task review inspect <task-id> --target <canonical-workspace> --json`
- **THEN** CLI MUST 返回 Planning/Completion 两个可选 slot 的 Application read model
- **AND** 未提供 current target identity 时已存在 Result 的 applicability MUST 为 unknown

#### Scenario: 记录完整 Review Result
- **WHEN** 用户运行 `buildr task review record` 并提供 type、target identity、method、reviewed、uncovered、findings、outcome 与 summary
- **THEN** CLI MUST 调用 Application record，并返回 recorded 或 blocked 的结构化结果
- **AND** CLI MUST 不接受 schemaVersion、taskId、completedAt、revision、current 或 applicability 作为 caller-authored字段

#### Scenario: 查看 Task Review help
- **WHEN** 用户运行根帮助、`buildr task --help`、`buildr task review --help` 或具体 action help
- **THEN** help MUST 说明 CLI 只管理完成 Result、两种类型均可选、record 需要明确 target identity、中断不写入且适用性由 identity 比较派生
- **AND** help MUST 不把命令描述为 Review engine、Development gate 或 Candidate generator

### Requirement: CLI 必须提供最小 Task Verification Result 管理入口
Buildr CLI MUST 只通过 `task verification inspect|record` 管理一个 Task current Result。`inspect` MUST 接受 Task ID 与可选 current target identity；`record` MUST 接受完整 target、实际 capability facts、coverage gaps 和 `passed|not-passed` conclusion。两者 MAY 接受 matching ready Task Environment 根作为 `--declaration-root`，但 MUST 通过 Task Verification Application 完成 ownership、领域校验与持久化。

#### Scenario: inspect current Result
- **WHEN** Agent 调用 `buildr task verification inspect <task-id> [--target-identity <identity>] --json`
- **THEN** stdout MUST 返回一个稳定 operation envelope、current Result、digest 与派生 applicability
- **AND** 命令 MUST 不准备 Environment、不执行 capability、不改变任何记录

#### Scenario: inspect Task Environment declaration
- **WHEN** Agent 为尚未集成的 target 追加 `--declaration-root <task-environment-root>`
- **THEN** Application MUST 证明该 root 属于当前 Task 的 ready Environment 后再观察 declaration
- **AND** 任意其他本机目录 MUST 被拒绝且原 current 不变

#### Scenario: record 完整 Result
- **WHEN** Agent 为 active Task 提供完整合法 facts 与 conclusion
- **THEN** CLI MUST 调用 Application 原子整值替换 current
- **AND** 返回 effects MUST 只披露 created/updated 的 portable Result path

#### Scenario: record 不完整
- **WHEN** target、capability fact、coverage gap 或 conclusion 不能构成完整 closed-schema Result
- **THEN** CLI MUST 返回 blocked operation result 与具体 field diagnostic
- **AND** 原 current MUST 保持不变

### Requirement: OpenSpec CLI help 不得恢复 Task Finish 的旧 Change authority
Buildr CLI MUST把`openspec baseline create`、`openspec check`、`openspec converge`与`openspec audit`描述为各自的OpenSpec contract/maintenance入口，并 MUST NOT把任一命令表述为current Task Finish stage、required action或恢复路径。Task Finish current help MUST明确Change convergence、sync与archive在Development stable Content Target之前完成。

#### Scenario: 查询 OpenSpec 兼容入口帮助
- **WHEN** 用户查询`buildr help openspec baseline create`或`buildr help openspec check`
- **THEN** help MAY说明其兼容诊断用途
- **AND** MUST NOT声称“新 Task Finish 使用 openspec converge”或引导Finish读取/修改Change

#### Scenario: 查询 Task Finish 帮助
- **WHEN** 用户查询canonical Task Finish help
- **THEN** help MUST说明Finish只消费current Development Handoff并执行carrier/delivery/cleanup
- **AND** MUST NOT列出OpenSpec command、Change convergence、sync或archive为Finish operation
