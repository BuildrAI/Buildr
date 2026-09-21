# Buildr 数据全景与领域设计

Buildr 不只是把工作记录存进数据库。它同时管理可共享的工作资产、本机的协作记录，以及把资产交给不同智能体（Agent）使用时产生的受管文件。理解它的数据设计，首先要知道：**某项信息表达什么事实、谁拥有它、哪里保存原文，以及变化后哪些地方必须跟着变化。**

本文面向希望理解和修改 Buildr 的人，覆盖当前产品的数据领域，不描述未来云端、多租户或跨机器同步方案。结构依据当前实现与正式规范；数据库通过在空的内存 SQLite 中顺序执行 `0000` 至 `0034` 迁移核对，未读取本机真实任务内容。示例只解释关系，不是新增业务规则。

## 怎样阅读

| 想回答的问题 | 入口 |
| --- | --- |
| Buildr 有哪些数据，为什么分开保存？ | 本文，按领域连续阅读 |
| 实际有哪些表，字段和关联是什么？ | [数据库表设计](buildr-database-tables.md)与[实体关系图（Entity Relationship Diagram，ERD）](../../archify/data/workspace-sqlite-erd.html) |
| 本机安装、运行、恢复记录在哪里，哪些不能删？ | [本机数据与恢复边界](buildr-local-data.md) |
| 项目、服务和实际代码为什么不是目录树？ | [项目、服务与代码库如何协作](project-service-repositories.md) |

![数据领域与事实归属](../../archify/data/buildr-data-domains.html)

总图是阅读地图，不是数据库表图：框可以表示文件里的对象，箭头只表达标明的关系。完整的表级约束单独在数据库图中呈现，避免把文件引用误画成数据库外键（Foreign Key）。

## 一、先区分“存在哪里”和“是否原始事实”

这两个问题不能混为一谈。保存在本机的东西未必是缓存（Cache），能够重新生成的东西也未必允许直接删除。

| 数据 | 保存位置 | 表达的事实 | 能否仅凭其他数据还原 |
| --- | --- | --- | --- |
| 身份、登记、规则、技能、组件、项目声明 | 文件，主要为 YAML 与 Markdown | 长期定义、选择和约束 | 不能从数据库完整还原；以源文件及其版本记录为依据 |
| 任务、工作摘要、人的答复、审查与验证 | 每个工作空间（Workspace）的 SQLite | 本机已登记的协作事实 | 不能从代码提交或聊天完整还原 |
| 规范、变更材料和知识文章 | OpenSpec 与 `knowledge/` 文件 | 产品承诺、方案及面向人的解释 | 原文是成果；不把“可以重写文章”当作无损恢复 |
| 运行时投射（Runtime Projection） | 对应智能体（Agent）的目录 | 由当前源资产组合出的可发现入口 | 正文可按源生成，但覆盖和清理由所有权证据约束 |
| 搜索索引（Search Index） | SQLite 的 `task_search` 及内部辅助表 | 加速查找，不增加业务事实 | 可从 `tasks` 重建；不等于整个数据库可重建 |
| 安装登记、投射回执、恢复现场 | 本机或工作空间（Workspace）中的 JSON/YAML 等文件 | 管理归属、实际操作结果、恢复所需信息 | 不应假定可从目录外观重新猜出 |
| 当前分支、进程是否存活、外部工具是否登录 | Git、进程与外部工具的实时观察 | 此刻实际发生什么 | 重新观察，不用旧记录替代 |

文件与 SQLite 是存储方式；原始事实、派生结果和实时观察是事实性质。两条轴交叉存在，这也是本文不只画数据库图的原因。

## 二、工作范围：先知道“这是什么”，再找到“它在哪里”

设想两个项目（Project）共用一个支付服务（Service），这个服务（Service）与另一个实现模块又位于同一个代码库。复制目录树会把“谁需要它”和“代码放在哪里”混在一起；Buildr 用独立身份和引用表达这两种关系。

### 四类对象

| 对象 | 人需要理解的关键字段 | 关系与保存位置 |
| --- | --- | --- |
| 工作空间（Workspace） | `id`、`name`、`description` | 治理和本机结构化数据的范围；身份在 `.buildr/workspace.yml` |
| 项目（Project） | `id`、`workspaceId`、`code`、`name`、`description`、`source`、`serviceIds` | 业务目标与治理材料所在位置；登记在 `projects/manifest.yml` |
| 服务（Service） | `id`、`workspaceId`、`code`、`name`、`description`、`type`、`repositoryId`、`modulePath` | 实现职责；全局模型登记在根部 `services/manifest.yml` |
| 代码库实例（Repository Instance） | `id`、`workspaceId`、`code`、`name`、`description`、`source` | 具体代码位置及稳定 Git 来源；登记在 `repositories/manifest.yml` |

`id` 是稳定身份，`code` 是可读定位，名称用于显示，路径用于找到实际文件；它们不是同一个东西。同一类别在当前工作空间（Workspace）内不允许重复的 `id` 或 `code`。

- 一个项目（Project）可以引用零到多个服务（Service），同一个服务（Service）可以被多个项目（Project）引用；关系保存在 `serviceIds`，没有唯一父项目这一业务含义。
- 一个服务（Service）必须引用一个代码库实例（Repository Instance）；一个代码库实例（Repository Instance）可以承载零到多个服务（Service）。`modulePath` 在代码库内定位模块，空字符串表示根部。
- 两份代码即使使用同一个远端地址，也不自动成为同一个代码库实例（Repository Instance）。应按真实目录和 Git 身份判断。
- 稳定的来源、远端和集成分支可以登记；当前分支、提交位置、未提交修改及远端偏移属于观察结果，不保存为恒定业务属性。

### 当前仍需识别的旧登记

实现仍能读取项目内的 `services/manifest.yml`（`buildr.services/v2`），它保存 `projectId` 和 `source`。在尚未显式迁移的工作空间（Workspace）中，读取会把这些旧记录组合成新关系视图，而不是静默写入全局清单。全局模型使用 `buildr.services/v3` 与 `buildr.repositories/v1`；只存在其中一个文件会被视为不完整现场。

因此，看见旧文件里的 `projectId`，不能推断新的服务（Service）模型必须从属于唯一项目（Project）；也不能因为新模型已被支持，就声称每个现有工作空间（Workspace）都已完成迁移。任务范围里仍可使用 `project/service` 定位，兼容引用不等于重新引入唯一父子关系。

### 修改的影响

关系应用一次核对整组清单的已观察版本，再写入变更。移除项目（Project）登记不等于删除代码；删除服务（Service）登记会同时移除各项目（Project）对它的引用，但不因此删除代码库。登记、准备实际目录和操作 Git 是不同动作。

依据：[关系模型与完整性约束](../../../services/buildr/src/modules/workspace/domain/asset-relationships.ts)、[清单读取与旧登记映射](../../../services/buildr/src/modules/workspace/persistence/asset-catalog-repository.ts)、[关系写入与删除](../../../services/buildr/src/modules/workspace/application/asset-relationships-application.ts)、[工作空间元数据](../../../services/buildr/src/modules/workspace/persistence/workspace-manifest-repository.ts)。

## 三、工作资产：原文、登记和安装组合不是同一份数据

例如，一项审查方法不只是 `SKILL.md`：它还可能带有模板、脚本、能力声明，并由某个组件（Component）统一安装。理解这组数据，需要区分内容、身份、组合和管理归属。

| 数据对象 | 保存什么 | 主要文件与关联 |
| --- | --- | --- |
| 规则（Rule） | 当前范围必须遵守的约束；登记说明何时应读、是否启用和是否必需 | 各范围的 `AGENTS.md`、`rules/manifest.yml` 与其引用的 Markdown 原文 |
| 技能（Skill） | 可复用的方法正文及随附资源；登记保存身份、来源和启用选择 | 根部 `skills/manifest.yml` 指向源目录；目录包含 `SKILL.md`、必要附件 |
| 组件（Component） | 一组工作资产的安装、更新和卸载边界 | `components/manifest.yml` 引用组件定义；`component.yml` 说明成员、完整性和增强关系 |
| 内容增强（Skill Contribution） | 哪段附加正文组合进哪个技能（Skill） | 组件（Component）拥有的片段，指定前置、后置或插槽位置；组合结果进入派生正文，不改写原始正文 |
| 命令定义（Command Definition） | 外部工具是什么、如何识别与诊断 | `commands/**/manifest.yml` 中的定义集合；项目（Project）的 `commands.yml` 只引用定义并说明需要的版本和必需性 |

技能（Skill）的 `id` 用于清单定位；`assetIdentity` 表示这项资产，`sourceIdentity` 表示来源。两个同名目录不天然是同一项资产，两份来源相同的文件也不自动取得同一管理归属。

普通技能（Skill）的源只在工作空间（Workspace）维护。项目（Project）的 `capabilities.yml` 用于需求、选择和适用性，不是另一套技能源目录；产品入口 `buildr` 由安装包直接提供，是明确的特殊来源。

组件（Component）可以把多项成员作为一组交付，但不是任意可执行插件。成员完整性、唯一归属和引用关系都影响安装与删除：卸载不能把用户文件或其他管理者的同路径文件一并清掉。外部工具的可执行文件、凭证、登录态和个人配置不保存在命令定义中，也不会因为登记了工具需求就自动安装工具。

依据：[技能清单与身份](../../../services/buildr/src/modules/agent-assets/persistence/skill-manifest.ts)、[规则登记](../../../services/buildr/src/modules/agent-assets/persistence/rule-manifest-repository.ts)、[命令登记](../../../services/buildr/src/modules/agent-assets/persistence/command-manifest-repository.ts)、[技能体系详解](buildr-skill-system.md)。

## 四、能力与声明：区分“提供什么”“选择谁”和“这次做成没有”

一个方法声明需要审查能力，不意味着某次审查已经执行。这里有三层不同的数据。

### 能力关系

能力身份由名称和版本共同确定。技能（Skill）的 `provides` 表示能提供什么，`requires` 表示依赖什么；能力契约（Capability Contract）给出输入义务、最低保证、副作用、授权与结果证据，绑定（Binding）选择实际提供者（Provider）。

`skills/manifest.yml` 登记能力契约（Capability Contract）及绑定（Binding）；契约原文在清单指定文件中。`capabilities.yml` 可以表达项目（Project）级需求和选择。解析器据当前文件形成依赖图，并将当前消费者（Consumer）需要的那部分信息写进派生入口；不会把提供者（Provider）的整份正文复制进每个消费者（Consumer）。

`ready` 在这里表示结构可路由，不表示“已经运行成功”，更不是对当前动作的通用授权。

### 准备与验证声明

| 数据 | 身份与核心内容 | 不代表什么 |
| --- | --- | --- |
| `preparation.yml` | `entries[].id`、适用范围、工作目录、可执行入口和参数 | 不代表依赖已安装，也不创建一份统一的任务环境状态 |
| `verification.yml` | `testing[].id`、覆盖范围、源码和测试根、完整入口、选择指引、环境要求 | 不代表任何一次测试已经通过 |
| 验证报告 | 任务（Task）、被验证内容的身份、引用的声明版本、实际检查、结果与缺口 | 不决定任务（Task）完成、代码交付或发布 |

例如，测试地图声明“这里有完整回归入口”；报告则记录“针对这份内容运行了哪些检查、哪些未覆盖”。把二者合并，会让一份长期配置错误地成为某次执行成功的证明。

依据：[能力清单校验](../../../services/buildr/src/modules/agent-assets/persistence/skill-manifest.ts)、[本项目准备声明](../../../preparation.yml)、[本项目测试地图](../../../verification.yml)、[声明体系解释](buildr-project-declaration-system.md)。

## 五、协作记录：一个任务，不是一张包办所有事实的大表

人提出“完善支付错误提示”，随后讨论方案、答复问题、修改代码、审查并验证。它们围绕同一个任务（Task），但分别回答不同问题，更新频率和有效性也不同。

| 对象 | 回答的问题 | 一项任务（Task）对应多少份 |
| --- | --- | --- |
| 顶层记录 | 为什么做、涉及哪里、父子关系、当前状态与最终结果是什么？ | 一份 `tasks` 记录，范围和变更引用放在关联表 |
| 工作摘要（Work Context） | 进展如何、下一步是什么、现在是否需要人处理？ | 零或一份当前记录 |
| 方案审查与完成审查（Task Review） | 对哪份对象作了何种检查、发现什么、未覆盖什么？ | 每种类型零或一份当前结果；被替换的结果进入历史 |
| 任务验证（Task Verification） | 实际执行了哪些检查、针对哪份内容、结论如何？ | 零或一份当前报告，没有独立的验证历史表 |
| 复盘文档 | 完成后有什么观察，用户是否已决定继续行动？ | 固定位置的一份本机 Markdown；顶层记录只登记摘要和决定状态 |

### 顶层状态不是执行流水账

顶层记录使用 `todo`、`active`、`completed`、`abandoned` 四种状态。需求、设计、实现、验收等当前节点属于工作摘要（Work Context）的 `stage`，不扩展顶层状态；也不能据此推断必须走完一条固定流水线。

父子关系由 `parent_task_id` 表达，一项任务（Task）至多有一个直接父任务（Task），父任务（Task）可有多个直接子任务（Task）。数据库禁止自指，应用进一步检查关系和完成条件。父任务（Task）完成还要保存总体验收、对子项的处置和明确授权依据，不能仅用“子项数量归零”代替。

更正已经结束的记录，会把原结果及更正原因放入 `result_history_json`。这不是所有字段变更的通用事件日志，更不是 Git 提交历史。恢复为进行中也不会撤销已经发生的代码交付。

### 人的意见有自己的身份和版本

工作摘要（Work Context）保存 `progress`、`nextStep`、可选 `stage` 及一个可空的待处理事项。事项有 `id`、种类、原因和 `pending|resolved` 状态；答复包含人的原意与记录时间。保存答复同时核对事项身份及已观察版本，避免人刚回答的问题被旧请求覆盖。

读取摘要或文档不会自动修改状态；人的答复也不会自动执行下一步、发布产品或完成任务（Task）。完整聊天记录仍由会话系统保存，不复制进数据库。

### 当前结果和历史结果各有用途

审查结果用 `(task_id, review_type)` 区分 `planning` 与 `completion`，每种类型独立更新。覆盖前的旧结果在同一数据库事务（Transaction）中进入 `task_review_history`；历史用于回看，不替代当前结论。

验证报告保存内容身份、声明引用、实际检查、未覆盖项与 `passed|not-passed|incomplete`。读取时可以根据当前内容和地图判断适用性；`passed` 不是永远有效的标签。数据库旁的查询字段用于筛选，必须与报告正文一致，不能分别解释为两套结果。

复盘正文位于 `.buildr/local/task-retrospectives/<task-id>.md`。先写文件，再登记其摘要；数据库与文件并非跨介质原子写入。读取时发现文件缺失或摘要不符应报告差异，不能静默替换正文，也不能把“打开过”当作“用户已决定”。

### 工作台保存的是个人组织方式

`workbench_preferences` 保存置顶、计划、关注、收藏和最近访问等条目，由 `kind` 与 `object_key` 共同定位。把任务（Task）放进计划列表不等于激活它；把资源收藏移除也不等于删除原资源。这里的对象定位是应用层关联，不是数据库外键（Foreign Key）。

依据：[顶层记录](../../../services/buildr/src/modules/task/domain/task.ts)、[工作摘要结构](../../../services/buildr/src/modules/task/work-context/domain/work-context.ts)、[审查写入与历史](../../../services/buildr/src/modules/task/persistence/task-review-repository.ts)、[验证报告结构](../../../services/buildr/src/modules/task/domain/task-verification.ts)、[真实表与约束](buildr-database-tables.md)。完整协作过程见[任务系统架构](task-system.md)。

## 六、规范与知识：关系入口不能变成另一份正文

OpenSpec 的 `specs/` 保存当前产品承诺，`changes/` 保存某次变更的提案、设计、差量规格和执行清单，归档保留那次变更的材料。任务（Task）引用变更身份，不把这些材料装进一张任务表。

`knowledge/` 里的文章、图示和代码地图（Code Map）面向理解。它们引用当前规范、代码、登记和已确认决定，不能替代这些来源；规范和实现不一致时，应把区别写出来，而不是只修文章让它们看起来一致。

知识索引（Knowledge Index）`knowledge/index.yml` 组织四类内容：

- `objects`：读者想了解的主题，可形成阅读层级。
- `artifacts`：实际文章、图或地图，引用所属主题和来源。
- `sources`：具体代码、规范、技能（Skill）或证据路径。
- `relations`：谁解释谁、依据谁、实现谁等关系。

正文仍保存在 `path` 指定的文件中。`graphSource` 指向可维护图源，展示文件由图源生成；索引（Index）不会保存一份脱离文件的文章副本。页面读取当前成果，阅读不触发内容写回。知识文章也不是能随意丢弃的缓存（Cache）：重新分析源码不保证还原同样的解释、取舍和阅读组织。

本篇与数据库附录共同维护当前数据视角；不因一次任务（Task）重新建立一套术语、规范或全局数据登记库。依据：[知识索引结构与引用校验](../../../services/buildr/src/modules/knowledge/domain/knowledge-index.ts)、[知识建设与维护](knowledge-maintenance.md)、[OpenSpec 变更过程](../flows/openspec-change-lifecycle.md)。

## 七、本机运行：目录里有记录，不等于那里就是长期资产

安装登记回答“这次运行属于哪个产品安装”；预览记录回答“这个进程属于哪个隔离位置”；工作树（Worktree）登记回答“哪些代码目录由这项任务（Task）创建”；投射回执回答“哪些文件由哪个管理者生成”。这些不是任务（Task）成功与否的第二份总状态。

同样，每日演进是围绕明确日期和提交范围形成的本机阅读成果，不是自动覆盖全项目全部活动的审计记录。诊断结果则是在特定时刻对已知数据的观察，不应把一次健康检查永久写成资产属性。

文件位置、作用域、写入者、丢失影响和恢复边界集中在[本机数据与恢复边界](buildr-local-data.md)。它与数据库附录互补：前者解释 SQLite 之外的本机数据，后者解释表内结构。

## 八、数据正确性由几种边界共同保护

### 身份正确，再谈路径正确

业务引用先指向对象身份；文件访问还需校验真实路径、范围与符号链接（Symbolic Link）。一个名称相同的目录、一份旧回执、相同远端地址，都不能单独证明这是当前要修改的对象。

### 核对版本，避免覆盖刚发生的变化

任务（Task）、工作摘要（Work Context）、审查与验证分别带有已观察的摘要版本。写入时比较当前值，冲突就保留现场并重新读取。文件型关系清单也会在受管写入前再次检查整组已观察内容。这里保护的是具体对象，不要求整个工作空间（Workspace）所有数据处于一个统一版本。

### 数据库关系和文件关系不能假装成同一种约束

SQLite 通过主键（Primary Key）、外键（Foreign Key）、唯一性和检查约束（Check Constraint）保护表内结构；应用继续校验状态、引用、报告内容和授权。文件里的项目（Project）、服务（Service）和 OpenSpec 变更不在同一个数据库里，相关引用由应用解析与检查。

例如，旧项目（Project）已不再可用，不应让一个结构有效的任务（Task）完全不可读。返回局部诊断与保留既有记录，是两件可同时成立的事；不应自动删除无法解析的历史引用。

### 事务范围必须说清楚

SQLite 的一次事务（Transaction）可以同时保护本次表更新；源资产的多文件受管写入有独立的暂存、备份和恢复机制。它们不构成横跨 Git、文件、数据库、进程和发布平台的一次全局事务（Transaction）。

因此，“记录完成”“代码交付”“应用生效”“资源已清理”应分别核对。某一步失败不得改写其他已经成立的事实。

依据：[SQLite 连接、只读边界与迁移](../../../services/buildr/src/infrastructure/sqlite/workspace-sqlite.ts)、[协作记录版本保护](../../../services/buildr/src/modules/task/work-context/persistence/work-context-repository.ts)、[验证写入一致性](../../../services/buildr/src/modules/task/persistence/task-verification-repository.ts)、[关系清单写入](../../../services/buildr/src/modules/workspace/application/asset-relationships-application.ts)。

## 九、从一项修改反查影响

| 准备改变什么 | 必须一起想清楚什么 |
| --- | --- |
| 对象身份、可读代号或代码位置 | 现有引用如何继续定位、目录是否真实存在、是否涉及同一 Git 边界；不能靠字符串替换推断迁移完成 |
| 增加协作字段或改变含义 | 哪个对象拥有它、是否需要数据库迁移（Database Migration）、读取与写入是否一致、界面是否仍展示同一事实 |
| 改变报告或声明格式 | 格式版本、旧数据如何读取、哪些已存在的报告不再能证明当前内容 |
| 修改技能（Skill）源文件 | 组件（Component）成员完整性、能力关系、需要重新生成的入口及其所有权 |
| 删除登记或清理本机文件 | 删除的是引用、正文、派生文件还是恢复证据；有没有其他对象或运行中的进程仍需要它 |
| 移动知识文章或图源 | 阅读索引（Knowledge Index）、正文链接、展示与来源是否仍指向同一成果 |

**判断数据设计是否讲清楚的标准不是表是否画满，而是读者能沿着一个对象，从业务含义找到身份、关联、存储、修改约束和丢失影响。** 数据库图提供精确结构，本文提供理解这些结构所需的上下文；两者不能互相替代。
