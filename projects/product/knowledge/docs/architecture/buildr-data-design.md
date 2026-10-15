# Buildr 数据全景与领域设计

理解 Buildr 的数据，先问三件事：这项信息表达什么，谁负责修改，原文保存在哪里。文件与数据库只是保存方式；本机记录未必可丢弃，派生文件也未必允许直接覆盖。

例如，两项业务目标可以引用同一个服务（Service），同一代码库实例（Repository Instance）又可以承载多个服务（Service）。复制目录树无法准确表达这些关系；Buildr 将业务身份、实现位置和当前运行观察分别保存，再通过引用连接。稳定身份用于确认对象，路径用于定位内容，当前分支和进程状态则在继续工作时重新观察。

本章覆盖当前本机产品。字段与约束见[数据库表参考](buildr-database-tables.md)，复杂业务关系见[项目、服务与代码库](project-service-repositories.md)。它不描述未来云端或跨机器同步方案。

![数据领域与事实归属](../../archify/data/buildr-data-domains.html)

图中同时包含文件与数据库对象，是领域关系图，不是实体关系图（ERD）。箭头表达标明的登记、引用或生成关系，不表示调用顺序、关系基数或数据库外键（Foreign Key）；数据库形状也不意味着每个节点都是表。表内关系另见[数据库实体关系图（ERD）](../../archify/data/workspace-sqlite-erd.html)。任务（Task）到知识的虚线表示通过变更引用或正文链接定位成果，没有通用的“任务—知识”关联表。图源与本章依据共同维护，安装与恢复现场由本章后文说明。

## 共享源、本机记录与当前观察

| 信息 | 保存位置 | 怎样理解它 |
| --- | --- | --- |
| 身份、登记、规则（Rule）、技能（Skill）、组件（Component）和项目声明 | YAML、Markdown 与随附文件，可由 Git 管理 | 长期定义与选择，不能从数据库完整还原 |
| 任务（Task）、工作摘要（Work Context）、答复、审查（Review）和验证（Verification） | 每个工作空间（Workspace）的 SQLite | 已登记的协作事实，不能从聊天或代码提交完整还原 |
| 规范、变更材料和知识文章 | OpenSpec 与 `knowledge/` | 原文就是成果，重新撰写不是无损恢复 |
| 工具可发现的派生入口 | 对应智能体（Agent）的目录 | 可依据当前源生成，写入和清理仍受所有权约束 |
| 搜索索引（Search Index） | SQLite 的 `task_search` 及辅助表 | 可从任务（Task）重建，不增加业务事实 |
| 安装登记、投射回执、恢复现场 | 本机 JSON、YAML 与备份文件 | 说明归属和实际操作，不能从目录外观猜出 |
| 技能声明接入的团队实例与团队认证 | `connections/instances/<系统>-<环境>--<唯一后缀>.yml`，可由团队 Git 共享 | 正文完整 `id` 是身份；只属于用户实际工作空间（Workspace），不进入公共技能源或发布物 |
| 技能声明接入的个人认证及观察密钥 | 应用数据根的 `connection-skills/` | 加密的完整个人组、本机安全观察及提供者状态，不能由共享文件恢复 |
| 分支、未提交修改、进程和外部登录态 | Git、进程与外部工具 | 每次重新观察，不用旧记录替代 |

## 从业务身份找到实际位置

项目（Project）表达目标，服务（Service）表达实现职责，代码库实例（Repository Instance）表达具体代码位置。一个项目（Project）可以引用多个服务（Service），一个服务（Service）也可以被多个项目（Project）引用；每个服务（Service）引用一个代码库实例（Repository Instance），用 `modulePath` 定位其中的模块。

| 对象 | 主要登记位置 | 关键身份或关系 |
| --- | --- | --- |
| 工作空间（Workspace） | `.buildr/workspace.yml` | `id`、名称与说明 |
| 项目（Project） | `projects/manifest.yml` | `id`、`code`、`source`、`serviceIds` |
| 服务（Service） | 根部 `services/manifest.yml` | `id`、`code`、`repositoryId`、`modulePath` |
| 代码库实例（Repository Instance） | `repositories/manifest.yml` | `id`、`code`、`source` |

`id` 是稳定身份，`code` 是可读定位，名称用于显示，路径用于访问。两份代码即使远端地址相同，也不自动成为同一个实例。来源和集成分支可以登记；当前分支、提交和未提交修改仍从 Git 观察。

关系写入会核对整组清单的已观察版本。移除登记不等于删除代码；移除服务（Service）时同时解除有关项目（Project）的引用，但保留实际仓库与历史任务（Task）。来源解析与写入依据见[关系模型](../../../services/buildr/src/modules/workspace/domain/asset-relationships.ts)、[读取](../../../services/buildr/src/modules/workspace/persistence/asset-catalog-repository.ts)和[写入应用](../../../services/buildr/src/modules/workspace/application/asset-relationships-application.ts)。

旧项目内的 `services/manifest.yml`（`buildr.services/v2`）仍可被读取并组合为关系视图，不会因读取静默迁移。全局模型使用 `buildr.services/v3` 和 `buildr.repositories/v1`；只存在其中一个文件属于不完整现场。旧 `project/service` 引用可以兼容定位，不代表新模型仍有唯一父项目。

## 工作资产与项目声明怎样使用

规则（Rule）保存约束，技能（Skill）保存方法，组件（Component）把相关资产作为一组安装和维护，命令定义（Command Definition）描述外部工具的识别与诊断。各自清单指向原文，登记本身不复制正文，也不会安装外部工具或保存它的凭证。

普通技能（Skill）在工作空间（Workspace）的 `skills/` 维护，`assetIdentity` 与 `sourceIdentity` 分别表示资产与来源。项目（Project）只声明需要什么和选择谁，不另存源副本。组合与投射细节见[技能体系](buildr-skill-system.md)。

新连接技能源使用 `skills/connections/<skill-id>/`，保存说明、接入声明和必要程序；它仍由同一 `skills/manifest.yml` 登记。共享目录只定义接入方法，真实团队实例及团队认证另存 `connections/instances/`；个人认证继续属于本机。安装另一同系统方法不改变已有实例绑定。

### 四份项目声明，各回答一个问题

| 文件 | 回答什么 | 怎么消费 |
| --- | --- | --- |
| `capabilities.yml` | 需要哪些能力，采用哪个方法？ | 解析需求、绑定（Binding）与适用性；不证明实际执行成功 |
| `commands.yml` | 需要哪些外部工具和版本？ | 引用命令定义（Command Definition），用于诊断需求；不保存可执行文件或登录态 |
| `preparation.yml` | 必要时怎样安装依赖、生成代码或准备运行条件？ | 智能体（Agent）在真实项目或服务根调用所声明入口 |
| `verification.yml` | 有哪些稳定测试、怎样发现和完整执行？ | 智能体（Agent）按目标选择并运行检查，实际结果另行记录 |

没有额外准备需求就不必创建 `preparation.yml`。有声明时应指向项目（Project）或服务（Service）拥有的真实入口，沿用各自技术栈的构建工具，不复制一套包管理逻辑。多项目、多仓库工作分别在真实根处理，不要求先形成统一环境计划。

实际使用顺序是：读取当前声明和入口，按当前动作准备，观察真实结果，再依据测试地图选择检查。Buildr Web 与 Doctor 不执行或回写准备入口；Buildr 也不为每项任务（Task）保存一份统一环境就绪状态。局部准备失败只影响依赖它的动作。

注册项目或服务、首次使用、构建与测试入口改变时，声明接入（`declaration-intake`）方法对照脚本、锁文件、持续集成（CI）及项目说明给出差异。已有授权覆盖的常规维护直接交给相应维护者；涉及新的业务取舍再请人决定。准备声明由项目维护，测试地图由任务验证方法指导维护，测试结果由对应应用保存。凭证、临时路径和完整执行日志不写入长期声明。

可参照[本项目准备声明](../../../preparation.yml)、[测试地图](../../../verification.yml)及[测试建设与使用](workspace-testing-and-verification-framework.md)。能力契约（Capability Contract）的输入、副作用及结果保证见[契约参考](../../../services/buildr/docs/skill-capability-contracts.md)。

## 两条外部连接路径分别保存事实

旧 `buildr connection` 继续在规范工作空间（Canonical Workspace）的 `.buildr/local/workspace.sqlite` 保存连接元数据，密码沿原本机加密路径维护。MySQL 查询及旧 Nacos、Kibana、XXL-JOB 不因新机制启用而改写或迁移；旧路径的代码工作树（Worktree）引用语义保持。

新 `buildr connection-skill` 从所选工作空间（Workspace）的当前 `connections/instances/*.yml` 正文发现实例。新建及保存时文件名使用“系统＋环境＋唯一后缀”，例如 `nacos-qa--<12位后缀>.yml`；完整 `id` 独立稳定，实际路径由 `sourcePath` 返回。系统来自已绑定声明的 `systemId` 或 `definitionId`，空环境使用 `default`；片段规范化并限长，后缀由完整 `id` 派生。已有 `<id>.yml` 或人工改名文件只在保存时整理，读取不改名；仅路径变化不改变内容观察版本（Observed Revision）或个人认证归属。

团队文件包含实例身份、名称、环境、精确技能源绑定、配置及团队整组认证；不存在就报告未配置，读取不导入旧清单、不写回或为分支（Branch）复制配置。类别（Category）用于展示，不替代 `(skillAssetIdentity, definitionId)`、`sourceIdentity` 和 `configVersion` 的明确绑定。同类、同目标的不同 `id` 可以共存，但仍访问同一外部环境；选择依据目标范围和用途，执行明确使用 `id` 及当前观察版本（Observed Revision），同等候选不能按名称、文件名或顺序猜选。重复正文 `id` 的文件局部报告冲突并保留，不影响其他唯一实例。

同一工作空间（Workspace）编号有唯一登记来源时，它就是配置入口。命令从相关代码工作树（Git Worktree）的根或子目录运行，须证明与登记目录具有同一 Git 公共目录后才使用该入口；登记来源自身是关联工作树时仍读取其当前文件，不跳往主检出。无登记时使用实际源目录；同编号的独立克隆（Clone）、多个登记来源或身份变化显式报告，不猜选配置。[来源解析](../../../services/buildr/src/modules/connection-skills/infrastructure/workspace.ts)只读取身份和 Git 事实，不建立分支配置管理。

个人认证保存在应用数据根 `connection-skills/<工作空间与路径摘要>/<id>.json`，整组加密并绑定实例、稳定的声明接收方及实际远端目标，密钥独立留本机。共享认证不保存本机可执行文件路径；本机接收方解析进入当前声明观察，安装位置变化会使旧测试、发现及执行观察失效，不改写团队文件。个人组存在就完整使用该组，不从团队组补字段；失效组仍被发现并报告，直到显式移除覆盖，不能失败后自动采用团队密码。团队保存与个人保存分别核对版本，不宣称跨文件事务（Transaction）。公开观察使用本机安全标识，不能从普通摘要试猜密码。

页面默认展示团队地址、账号与业务范围，个人账号在折叠区单独测试和保存。主“测试连接”只测试上方团队候选，不会因为已有个人组而换用另一个账号；保存团队与保存个人各自保留其已观察版本，保存或测试一方不把另一方的陈旧草稿变成最新事实。声明的展示区块只组织字段，不改变认证存储、完整组选择或写入边界。

声明、配置、个人组和程序来源各有观察依据。编辑和运行先核对当前值；程序写前再校验本机上下文，变化时不静默改用新配置。私有通道向所选程序交接有效认证，普通发现与日志不展开秘密；专业状态位于该提供者的 `privateStateRoot`，不成为通用权限库。依赖安装、连接测试及业务验证分别成立。

独立 Nacos 的版本 2 将专业接口地址与可选网站分开，旧版本保留并明确提示迁移。`--result-file` 在网络操作前独占创建权限为 0600 的本机结果文件，保存完整授权范围及默认原文位置；它是一次操作的私有产物（Artifact），不进入团队文件或长期登记，普通展示值不能替代该原样结果。发布后若结果落盘失败，仍保留已经发生的发布事实。

换机器可以由 Git 恢复团队实例及技能源，但仍需重新准备程序；本机个人组及密钥不随之恢复。无个人组时使用团队，已有失效个人组不能回退。来源、配置版本或程序接收方变化应核对迁移及认证目标，不能只改显示名称。实现见[文件及本机认证](../../../services/buildr/src/modules/connection-skills/persistence/files.ts)、[应用与版本判断](../../../services/buildr/src/modules/connection-skills/application/connection-skills-application.ts)和[声明目录](../../../services/buildr/src/modules/connection-skills/application/catalog.ts)。本章原有 SQLite 图中的连接对象表示旧路径，新接入文件和本机认证由本节说明。

## 任务的几类记录为什么分开

| 记录 | 保存什么 | 历史与边界 |
| --- | --- | --- |
| 顶层任务（Task） | 目标、范围、父子关系、状态与结果摘要 | 结束后更正的原结果进入 `result_history_json`；不是所有修改的事件日志 |
| 工作摘要（Work Context） | 当前进展、下一步、节点、待处理事项与人的答复 | 一份当前记录；答复核对事项身份和已观察版本 |
| 审查（Review） | 方案或完成审查的对象、方法、结论与未覆盖项 | 每种类型一份当前结果，覆盖前的结果在同一事务（Transaction）中进入历史 |
| 验证（Verification） | 内容身份、声明版本、实际检查、结果与缺口 | 一份当前报告，没有独立历史表；`passed` 不永久有效 |
| 复盘 | 本机 Markdown 正文、摘要登记及人的决定状态 | 正文不存数据库；保存文件与登记摘要不是跨介质原子操作 |

任务（Task）顶层状态只有 `todo`、`active`、`completed`、`abandoned`。需求、方案、实现等工作节点放在摘要中，不能据此推断固定执行流水线。父子关系不自动传播完成；实际使用见[从讨论到交付](task-system.md)。

复盘正文位于 `.buildr/local/task-retrospectives/<task-id>.md`。文件缺失或摘要不符应报告差异，不能静默替换，也不能把打开过文档当成人已决定。完整聊天与工具日志仍由会话系统保存。

工作台（Workbench）的 `workbench_preferences` 保存计划、关注、收藏及最近访问等个人组织方式。加入计划不等于激活任务（Task），移除收藏也不删除原资源；这些引用由应用解析，不是数据库外键（Foreign Key）。字段、主键和约束集中在[表参考](buildr-database-tables.md)。

## 正文与索引分别保存

OpenSpec 的 `specs/` 保存当前承诺，`changes/` 保存一次变更的提案、设计、规范增量和清单。任务（Task）引用变更身份，不把所有材料复制到数据库中。

知识索引（Knowledge Index）`knowledge/index.yml` 用 `objects`、`artifacts`、`sources`、`relations` 关联主题、成果、事实来源与关系，正文仍在 `path` 指定的独立文件中；`graphSource` 指向图源。阅读不会回写成果。文章模块则在实际项目根的 `docs/publications/` 维护正文，资源位于其下 `assets/`。

知识文章解释当前事实，不替代规范和代码；两者有差异时应如实说明。索引也不成为第二份正文或历史版本库。维护方式见[知识建设与维护](knowledge-maintenance.md)。

## 本机文件参考：目录存在不等于可以删除

下表中的 `W` 是真实工作空间（Workspace）根，`H` 是当前用户主目录，`P` 是产品数据根，`A` 是当前应用数据根，`G` 是真实 Git 共享目录。

| 位置 | 用途与丢失影响 |
| --- | --- |
| `W/.buildr/local/workspace.sqlite` | 任务（Task）及相关协作记录；Git 提交不能替代它 |
| `W/.buildr/local/task-retrospectives/` | 复盘原文；数据库没有正文副本 |
| `W/.buildr/daily-progress/` | 已保存的每日摘要；重新分析提交不保证重建同一份说明 |
| `P/product-installations.json` | 安装来源、入口、Node 身份与更新依据；丢失不删除程序，但影响发现和管理 |
| `A/workspace-registry.json` | 已登记工作目录与最近选择，不保存业务正文 |
| `W/.buildr/local/web-management.json` | 目录身份和应用管理归属，缺失不能直接解释为无人管理 |
| `A/instance.json`、`instance-start.lock` | 进程发现、实例密钥、运行配置（Profile）和启动争用；删除记录不等于停止进程 |
| 启动器（Launcher）的 `launcher-binding.json` | Node、入口及启动策略，重建前需核对真实安装 |
| `G/buildr/task-worktrees/<task-id>.json` | 工作树（Worktree）的目录、分支和创建归属；不是任务完成或环境就绪证明 |
| 预览根的 `previews/<name>/` | `preview.json`、`instance.json`、`preview.log`；名称或端口相同不能代替进程归属 |
| `W/.worktrees/<task-id>/.buildr/local/workspace.sqlite` | `--task` 预览为服务目标工作树播种的 canonical 任务库一致副本；时点快照，不回灌 canonical，已存在时复用 |
| `W/.buildr/agent-runtime/`、`H/.buildr/agent-runtime/` | 派生文件的所有权与完整性回执，不能仅凭内容相似重建 |
| `W/.buildr/builtin-receipts.json` | 随包资产的受管事实，不是资产正文 |
| `W/.buildr/mutations/` | 多文件写入的锁、操作记录与 `backup/` 前镜像；中断时是恢复依据 |
| 相关变更下的 `.buildr/convergence-receipt.json` | OpenSpec 修改前及预期内容，用于核对中断现场；成功核对后释放 |

`P` 可由 `BUILDR_PRODUCT_DATA_DIR` 覆盖，`A` 可由 `BUILDR_APP_DATA_DIR` 覆盖。它们可能指向同一目录，但语义和覆盖参数不同。macOS 的正式应用默认使用 `~/Library/Application Support/Buildr`，开发应用使用 `~/Library/Application Support/Buildr Dev`；Windows 使用本机应用数据目录，Linux 遵循状态目录约定。具体值以[产品路径解析](../../../services/buildr/src/infrastructure/filesystem/product-data-root.ts)与[应用运行配置](../../../services/buildr/src/modules/installation/contracts/web-profile.ts)为准。

预览根由 `buildrWebDataRoot()` 解析，使用应用覆盖目录，否则使用系统默认产品数据位置；仅设置 `BUILDR_PRODUCT_DATA_DIR` 不能推断预览已隔离。macOS 启动器绑定位于目标的 `Contents/Resources/`，Windows npm 启动器使用 `P/launchers/npm/`。工作树（Worktree）副本通常位于 `W/.worktrees/<task-id>/`；登记、真实 Git 状态和未提交内容需共同保全。

实例文件包含密钥，本机副本和故障报告都应保护这些内容。源资产与用户配置、凭证、临时日志分开保存，不意味着后者可无条件删除。

## 写入和恢复要守住哪些事实

各入口写入前核对对象身份、真实路径与已观察版本；冲突后保留输入并重读。文件引用由应用解析，SQLite 以主键、外键（Foreign Key）及检查约束保护表内结构。旧项目或来源暂时不可用时，应保留结构有效的历史任务（Task），局部报告无法解析的引用。

普通网页管理工作空间（Workspace）及打开其 SQLite 前，[管理归属守卫](../../../services/buildr/src/modules/workspace/infrastructure/workspace-management-fence.ts)核对真实目录、工作空间的通用唯一标识符（UUID）、本机管理记录和当前通道（Channel）。同路径或同一通用唯一标识符（UUID）的确定跨通道冲突仍拒绝访问；本机记录与当前身份完整匹配时，无关对侧登记不可读不会撤销该对象的既有归属。本机记录损坏或身份变化也须先处理，不以对侧缺口绕过保护。

首次建立管理记录时，只跳过已证明完全不存在的无关旧目录；损坏登记、现存对象身份未知、悬空链接或路径无法解析仍不能当作无人管理。[安装状态观察](../../../services/buildr/src/modules/installation/application/product-installation-status.ts)仍返回两侧登记与局部诊断，观察结果不解除管理保护，也不改写对侧登记。

SQLite 的一次事务（Transaction）只保护其内的表更新。文件变更有独立的备份与恢复，不能把它们与 Git、进程、发布平台说成一次全局提交。已经核实的代码交付、记录完成、应用生效和资源清理分别成立。

中断现场应保留操作记录、备份及当前文件。自动回滚（Rollback）与手动恢复都先校验整组目标、备份和控制文件路径，再在具体删除或复制前复核；路径出现不安全链接或操作中的根目录身份发生变化时，保留可用现场并停止相关写入，不因旧回执仍在就机械重放。

实现边界见[数据库迁移](../../../services/buildr/src/infrastructure/sqlite/workspace-sqlite.ts)、[文件事务](../../../services/buildr/src/infrastructure/filesystem/workspace-mutation.ts)与[OpenSpec 恢复](../../../services/buildr/src/modules/openspec/application/openspec-converge.ts)。

## 数据保全与恢复

本节供更新、换机器或恢复失败现场时查阅，不是首次使用的准备清单。路径相对实际工作空间（Workspace）。

| 保留什么 | 位置与要点 |
| --- | --- |
| 资料、规则（Rule）、技能（Skill）与代码 | 保留实际来源、各 Git 仓库、未提交成果和独立工作树（Worktree） |
| 任务（Task）、审查（Review）与验证（Verification）记录 | `.buildr/local/workspace.sqlite`；停止全部写入后复制，保留当时仍存在的 `-wal`、`-shm` |
| 复盘正文与每日演进 | `.buildr/local/task-retrospectives/`、`.buildr/daily-progress/`；SQLite 没有这些正文副本，重新生成不等于恢复 |
| 未完成操作 | `.buildr/mutations/` 及相关恢复记录；同时保留记录、备份与当前文件 |
| 安装及目录归属 | 核对实际应用数据目录与管理记录；不能当作跨机器通用配置 |

先记录当前版本、程序入口、目标版本与未完成操作，停止相关命令和应用写入，再复制到新的受保护目录。关闭浏览器不等于退出 Buildr；SQLite 使用预写日志（WAL），只复制运行中的主文件不能保证一致。当前没有统一备份或云端恢复工具。核对文件清单和重要记录，在副本上检查 SQLite 完整性，再更新并检查一项代表工作。副本可能含业务内容或凭证，应保留到新版本已实际使用。

较早版本的升级会退役旧执行、研发、环境、收尾聚合及部分复盘数据。新版首次可写打开 SQLite 时执行待迁移项，并清理旧 `.buildr/asset-review/`、`.buildr/local/task-execution-records/`；有价值的旧内容应提前另存。迁移逐项提交，后续失败不撤回此前结果，安装旧程序也不会降级 SQLite 数据。

更新失败时保留现场和副本，再判断修复或恢复，不覆盖唯一现场。换机器时先迁移可移植资料，再准备工具，单独核对本机记录与实际路径。完整位置见前文；迁移依据见[数据库维护](../../../services/buildr/src/infrastructure/sqlite/workspace-sqlite.ts)。当前产品边界见[已知限制](../../../services/buildr/docs/known-limitations.md)。
