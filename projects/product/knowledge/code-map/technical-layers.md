# 技术层、对象与代表方法

本地图用工作空间（Workspace）模块的一条业务路径解释分层，再定位跨模块装配、恢复与前端状态的关键边界。完整能力目录见[服务与工程地图](system-services-assets.md)；任务、知识、投射与验证的详细实现由各自专题地图维护。

下列后端路径相对 `projects/product/services/buildr/`；前端链接明确指向另一服务（Service）。目录只列理解职责所需的代表文件，不是源码镜像。

## 一例完整模块：工作空间与对象关系

关系写入从命令行（CLI）或网页进入同一应用；应用核对整组登记的已观察版本，领域模型判断对象及引用是否合法，数据访问保存清单。真实代码位置、Git 状态与登记是不同事实，保存登记不会自动准备代码。详细关系和前端操作见[对象关系地图](project-service-repositories.md)。

- **[`src/modules/workspace/`](../../services/buildr/src/modules/workspace/)**：身份、来源、登记与组成。
  - [`module.ts`](../../services/buildr/src/modules/workspace/module.ts)：私有装配和公开能力选择，不拥有用例。
  - **`interfaces/`**：解析输入并展示结果。
    - [`cli/asset-catalog.ts`](../../services/buildr/src/modules/workspace/interfaces/cli/asset-catalog.ts)：`assets` 输入、帮助与输出适配。
    - [`http/`](../../services/buildr/src/modules/workspace/interfaces/http/)：网页登记及详情的路由、协议与响应校验。
  - **`application/`**：组织业务判断、版本核对与读写。
    - [`asset-relationships-application.ts`](../../services/buildr/src/modules/workspace/application/asset-relationships-application.ts)：对象创建、引用关系与移除边界。
    - [`workspace-query-application.ts`](../../services/buildr/src/modules/workspace/application/workspace-query-application.ts)：`getWorkspace` 等只读展示结果。
    - [`workspace-command-application.ts`](../../services/buildr/src/modules/workspace/application/workspace-command-application.ts)：登记、更新、迁移与请求根解析。
    - [`workspace-operations.ts`](../../services/buildr/src/modules/workspace/application/workspace-operations.ts)：初始化与恢复编排。
    - [`registry-maintenance.ts`](../../services/buildr/src/modules/workspace/application/registry-maintenance.ts)：登记发现、旧服务迁移与修复。
  - **`domain/`**：不依赖输入输出的结构与约束。
    - [`asset-relationships.ts`](../../services/buildr/src/modules/workspace/domain/asset-relationships.ts)：项目（Project）、服务（Service）、代码库实例（Repository Instance）及引用校验。
    - [`source-root.ts`](../../services/buildr/src/modules/workspace/domain/source-root.ts)：来源与所有权规则。
  - **`persistence/`**：保存格式、读取与来源映射。
    - [`asset-catalog-repository.ts`](../../services/buildr/src/modules/workspace/persistence/asset-catalog-repository.ts)：读取当前或兼容登记，组成关系视图。
    - [`asset-composition-repository.ts`](../../services/buildr/src/modules/workspace/persistence/asset-composition-repository.ts)：总览只读投影与局部来源诊断。
    - [`workspace-manifest-repository.ts`](../../services/buildr/src/modules/workspace/persistence/workspace-manifest-repository.ts)：工作空间（Workspace）声明读写。
    - [`workspace-registry-repository.ts`](../../services/buildr/src/modules/workspace/persistence/workspace-registry-repository.ts)：本机已登记目录读写。
  - **`infrastructure/`**：本模块专用技术协作。
    - [`workspace-source-filesystem.ts`](../../services/buildr/src/modules/workspace/infrastructure/workspace-source-filesystem.ts)：来源暂存、复制和发布。
    - [`workspace-source-git.ts`](../../services/buildr/src/modules/workspace/infrastructure/workspace-source-git.ts)：明确来源的 Git 操作。
    - [`workspace-management-fence.ts`](../../services/buildr/src/modules/workspace/infrastructure/workspace-management-fence.ts)：管理身份、锁与冲突保护。

工作空间（Workspace）不反向绑定全部任务查询。资产模块只取得明确的 `WORKSPACE_ASSET_SUPPORT`，不取得全部业务和测试方法。

项目文档图片由[项目应用](../../services/buildr/src/modules/workspace/application/project-application.ts)复读登记与来源，任务图片由[材料应用](../../services/buildr/src/modules/task/materials/application/task-materials-application.ts)及[项目读取器](../../services/buildr/src/modules/task/materials/application/task-project-document-reader.ts)选择同一本机或候选根。共享[图片文件读取](../../services/buildr/src/infrastructure/filesystem/markdown-images.ts)只负责真实正文引用、有界普通文件、类型签名与前后观察，不拥有任务作用域或登记。前端[图片链接与失败状态](../../services/buildr-web/src/lib/markdownImages.ts)提前过滤明确非法路径，实际身份和权限仍由应用决定。

## 外部系统接入

[外部系统连接](../docs/architecture/external-connections.md)解释声明、实例、账号和专业职责。本节定位这些职责的当前实现；约束见[通用运行规范](../../openspec/specs/connection-skill-runtime/spec.md)、[实例规范](../../openspec/specs/connection-instance-files/spec.md)及[独立查询规范](../../openspec/specs/mysql-query/spec.md)。

### 内置专业技能与独立查询

- **[独立 MySQL 查询（mysql-query）](../../services/buildr/src/modules/mysql-query/)** — 消费明确绑定的实例；保留单条只读执行约束，不拥有团队连接配置。
  - [访问与结果约束（domain/mysql.ts）](../../services/buildr/src/modules/mysql-query/domain/mysql.ts) — MySQL 访问配置、认证、结果类型和输入校验。
  - [只读执行内核（infrastructure/mysql-client.ts）](../../services/buildr/src/modules/mysql-query/infrastructure/mysql-client.ts) — `createMySqlClient` 提供测试、结构读取及查询，`prepareReadOnlySql` 保留单条只读约束。
  - [查询应用（mysql-query-application.ts）](../../services/buildr/src/modules/mysql-query/application/mysql-query-application.ts) — 核对准确内置来源、完整认证及当前版本，提供结构读取和查询。
  - [本机偏好（query-preferences.ts）](../../services/buildr/src/modules/mysql-query/persistence/query-preferences.ts) — 独立 SQLite 表及偏好版本，不保存查询结果。
  - [专业接入程序（mysql-connection-program.ts）](../../services/buildr/src/modules/mysql-query/interfaces/program/mysql-connection-program.ts) — `buildr-mysql` 的私有上下文（Context）、测试和数据库发现；主包携带运行依赖。
  - [开发辅助命令（tools/development/programs/）](../../services/buildr/tools/development/programs/) — 源码桥接与 macOS 开发启动器（Development Launcher）的进程私有入口，使用已选 Node.js 调用同一程序，保留默认 npm `buildr` 的独立身份。
  - [命令入口（mysql-query-cli.ts）](../../services/buildr/src/modules/mysql-query/interfaces/cli/mysql-query-cli.ts)及[网页入口（mysql-query-http.ts）](../../services/buildr/src/modules/mysql-query/interfaces/http/mysql-query-http.ts) — 同一查询应用的输入输出适配。
- **[独立查询前端（mysql-query）](../../services/buildr-web/src/features/mysql-query/)** — 连接目录使用的查询组件（Component）、库表浏览、客户端（Client）、编辑器、结果与本机布局；库表浏览与当前数据库选择解耦，客户端固定本次实例及观察版本。
- [MySQL 接入方法](../../services/buildr/resources/workspace/skills/connections/mysql-connection/SKILL.md)、[Kibana 日志方法](../../services/buildr/resources/workspace/skills/connections/kibana-connection/SKILL.md)及[XXL-JOB 调度方法](../../services/buildr/resources/workspace/skills/connections/xxl-job-connection/SKILL.md) — 三份完整内置技能源分别维护专业对象定位、操作、结果和局限。

查询代表链路为连接页 → 独立查询客户端（Client）→ `MySqlQueryApplication` → `ConnectionSkillsApplication.useSelected` → MySQL 专用客户端（Client）。通用内部端口只向装配的查询能力交接已核验认证，不建立可公开读取密码的接口（API）。

### 通用接入与执行

连接页面的后台目录请求由 [在途共享读取（directory-reads.ts）](../../services/buildr/src/modules/connection-skills/application/directory-reads.ts) 合并到已有有界读取池；[后台入口（read-worker.ts）](../../services/buildr/src/web/http/read-worker.ts) 只加载目录源读取，其他完整应用在 [按需应用入口（read-worker-applications.ts）](../../services/buildr/src/web/http/read-worker-applications.ts) 中加载。实例与认证的当前投影继续由连接应用负责。

接入方法使用普通技能（Skill）源。`agent-assets` 的公开端口 `AGENT_ASSETS_SOURCE_READ` 提供清单及有界、安全的文件读取；连接目录（Connection Catalog）读取当前声明，不启动程序、不探测版本、不复制技能正文。`connectionDefinitions` 透传已有登记、资源交付及投射链，来源方法与程序安装分别观察。实例以技能源身份、定义编号、来源及配置版本绑定，类别（Category）不推导业务动作。共享文件和本机认证的边界以当前实例规范为准。

连接技能源统一登记 `path: connections/<skill-id>`，完整目录为 `skills/connections/<skill-id>/`。新增本地源与受管资源使用同一规范；非标准位置登记给出明确诊断。它是已有技能（Skill）树的专用分组，不增加加载器。

- **[技能声明接入（connection-skills）](../../services/buildr/src/modules/connection-skills/)** — 逐实例文件、个人组、声明管理及通用执行；不拥有专业业务命令。
  - [模块装配（module.ts）](../../services/buildr/src/modules/connection-skills/module.ts) — 使用工作空间（Workspace）和资产公开端口装配命令、网页与应用。
  - **`domain/`** — 声明、实例及输入约束。
    - [声明与字段校验（definition.ts）](../../services/buildr/src/modules/connection-skills/domain/definition.ts) — 受限字段、程序和只读槽位，`authentication.allowedSources` 限定认证来源，`authorization` 声明独立个人授权；`presentation` 编排字段及连接环境展示，`hooks.inputs` 定义发现输入。
    - [实例身份与观察（instance.ts）](../../services/buildr/src/modules/connection-skills/domain/instance.ts) — 绑定输入、观察冲突和安全诊断。
    - [选择名称（field-labels.ts）](../../services/buildr/src/modules/connection-skills/domain/field-labels.ts) — 有界展示记录的严格保存、容错读取、编号匹配及公开秘密遮蔽，不参与远端身份。
  - **`application/`** — 当前来源及用例。
    - [重建目录与精确选择（catalog.ts）](../../services/buildr/src/modules/connection-skills/application/catalog.ts) — `list/resolve` 核对技能入口、声明、来源、停用和兼容版本；入口与有效声明分阶段批读，局部失败不改绑。
    - [连接管理与运行（connection-skills-application.ts）](../../services/buildr/src/modules/connection-skills/application/connection-skills-application.ts) — 共同目录、来源约束、独立保存与观察核对；`authorize` 按当前观察接收新个人组，`migrateAuth/relocateAuth` 显式保全迁移，普通读取不返回秘密。密码方法可显式单字段查看，授权方法不公开内部字段。
  - [团队文件与本机认证（persistence/files.ts）](../../services/buildr/src/modules/connection-skills/persistence/files.ts) — 普通文件边界、原子替换、逐实例锁；个人密文在规范工作空间私有忽略目录，密钥留本机应用目录，旧路径只读兼容及显式迁移；实例配置不进入本机 SQLite。
  - [专业程序启动（infrastructure/program.ts）](../../services/buildr/src/modules/connection-skills/infrastructure/program.ts) — 随附及独立程序定位、显式版本检查、私有进程间通信（IPC）、业务标准输入（Standard Input）、超时和有界秘密输出。
  - [个人授权程序（infrastructure/authorization-program.ts）](../../services/buildr/src/modules/connection-skills/infrastructure/authorization-program.ts) — 独立授权上下文不交接旧认证，私有结果唯一且正常退出才交给应用；抑制普通输出，处理取消、超时及进程清理。
  - [所选来源解析（infrastructure/workspace.ts）](../../services/buildr/src/modules/connection-skills/infrastructure/workspace.ts) — 唯一登记目录维护配置入口，以 Git 公共目录证明关联代码工作树（Git Worktree）；独立克隆（Clone）及多个来源显式冲突。
  - [命令入口（interfaces/cli/connection-skills-cli.ts）](../../services/buildr/src/modules/connection-skills/interfaces/cli/connection-skills-cli.ts) 与 [网页入口（interfaces/http/connection-skills-http.ts）](../../services/buildr/src/modules/connection-skills/interfaces/http/connection-skills-http.ts) — 同一应用的输入输出适配。
- [资产公开源读取（connection-skill-source.ts）](../../services/buildr/src/modules/agent-assets/application/connection-skill-source.ts) — 验证已登记源目录、入口名称、相对文件及实际路径，提供逐项和有界批量读取，不从陈旧投射猜执行程序。
- [严格文件读取（verified-readonly-file.ts）](../../services/buildr/src/infrastructure/filesystem/verified-readonly-file.ts) — 持有根目录和叶文件句柄，批量证明读前、读后内核位置及逐项文件身份，保留单文件兼容和局部失败边界。
- [Nacos 完整技能源（nacos-connection）](../../services/buildr/resources/workspace/skills/connections/nacos-connection/) — 独立说明、接入声明、程序和详细方法；资源映射安装到 `skills/connections/nacos-connection/`。
- [接入制作指引（connection-authoring）](../../services/buildr/resources/workspace/skills/buildr/connection-authoring/) — 指导制作标准目录、声明、程序及验证，不承载真实实例配置。
- [资产影响只读端口（connection-impact.ts）](../../services/buildr/src/modules/agent-assets/application/connection-impact.ts) — 一次装配连接引用回调，取消登记及内置卸载披露编号、名称与文件；读取故障作为诊断，不阻源操作或删除实例、认证。
- **[连接页面（connection-skills）](../../services/buildr-web/src/features/connection-skills/)** — 先选择系统，再按声明填写地址、允许来源的账号与业务范围；仅个人模式直接使用本机账号，双来源模式保留独立个人区。
  - [页面（ConnectionSkillsPage.tsx）](../../services/buildr-web/src/features/connection-skills/pages/ConnectionSkillsPage.tsx) — 实例列表、新增入口与局部诊断；首次或明确刷新仅请求共同目录，保存和删除局部更新，隔离迟到读取。
  - [列表摘要（connection-skill-summary.ts）](../../services/buildr-web/src/features/connection-skills/connection-skill-summary.ts) — 优先使用匹配的选择名称，地址及其余范围压为两逻辑行，不调用外部发现。
  - [编辑抽屉（ConnectionSkillEditDrawer.tsx）](../../services/buildr-web/src/features/connection-skills/components/ConnectionSkillEditDrawer.tsx) — 装配系统选择、声明允许的认证入口、环境展示、显式迁移与底部操作，主测试选择准确候选来源。
  - [编辑状态（useConnectionSkillEditor.ts）](../../services/buildr-web/src/features/connection-skills/useConnectionSkillEditor.ts) — 维护两组草稿及独立观察版本、保存、测试、迟到响应与冲突。
  - [系统选择（ConnectionSystemPicker.tsx）](../../services/buildr-web/src/features/connection-skills/components/ConnectionSystemPicker.tsx) — 类别分组与系统选项，同系统多个方法时才选择接入方式。
  - [连接表单（ConnectionTeamForm.tsx）](../../services/buildr-web/src/features/connection-skills/components/ConnectionTeamForm.tsx) — 按声明编排配置与当前主来源的完整认证、发现业务范围，未列字段通用回落。
  - [个人账号（ConnectionPersonalAuthentication.tsx）](../../services/buildr-web/src/features/connection-skills/components/ConnectionPersonalAuthentication.tsx) — 默认折叠、明确覆盖状态、独立测试和保存。
  - [已保存个人秘密（ConnectionSavedPersonalSecrets.tsx）](../../services/buildr-web/src/features/connection-skills/components/ConnectionSavedPersonalSecrets.tsx) — 显式单字段查看、默认隐藏、按当前对象及观察清空，隔离迟到响应且不回填认证草稿。
  - [浏览器授权（ConnectionBrowserAuthorization.tsx）](../../services/buildr-web/src/features/connection-skills/components/ConnectionBrowserAuthorization.tsx)及[授权状态（useConnectionAuthorization.ts）](../../services/buildr-web/src/features/connection-skills/useConnectionAuthorization.ts) — 首次授权、重新授权及取消；新增先保存无认证配置壳，内部认证字段不进入表单，关闭或目标变化时丢弃迟到结果。

实际操作为“智能体（Agent）发现绑定 → 读取专业技能（Skill）及程序帮助 → 通用入口启动程序 → 所选程序访问真实系统”。程序写前请求本机上下文再次校验，通用宿主不审批业务；Nacos 随附程序另维护远端版本、授权及结果。MySQL 另由独立查询应用消费同一明确实例，所有入口保留观察版本及只读边界。

## 服务本地运行

一个服务（Service）保存一份已验证运行定义，所有检出目录共用它；每次启动是独立实例。规范见[本地运行要求](../../openspec/specs/service-runtime-operations/spec.md)，本轮任务组合、真实连接与 QA 退场依据[重构设计](../../openspec/changes/archive/2026-10-22-refactor-service-local-runtime/design.md)。本模块组织本机运行事实，代码观察仍由 `code` 提供，真实业务验证由智能体（Agent）执行并按任务验证记录。

- **[`src/modules/service-runtime/`](../../services/buildr/src/modules/service-runtime/)** — 服务本地运行的确定性能力。
  - [模块装配（module.ts）](../../services/buildr/src/modules/service-runtime/module.ts) — 组合工作空间（Workspace）资产、代码检出观察与任务范围；目录由服务端解析，不接收任意路径，不依赖部署连接应用。
  - **`domain/`** — [运行定义（runtime-definition.ts）](../../services/buildr/src/modules/service-runtime/domain/runtime-definition.ts)校验已验证启动方式与 `local.backends` 逐后端连接声明，旧 `backend` 单声明与 `environments` 兼容读取；[运行记录（runs.ts）](../../services/buildr/src/modules/service-runtime/domain/runs.ts)保存状态、代码及归属快照、实际端口与逐后端连接，归一读取旧单连接记录，未知旧字段不推断为干净或人工启动；[工作树身份（worktrees.ts）](../../services/buildr/src/modules/service-runtime/domain/worktrees.ts)描述真实检出与任务归属。
  - **`application/`** — [单项运行（service-runtime-application.ts）](../../services/buildr/src/modules/service-runtime/application/service-runtime-application.ts)负责目录与来源核对、单实例启动、等待就绪、停止、逐后端连接目标解析（显式实例、同范围唯一、远程回落）、先校验再停启及日志读取；就绪后端筛选复用于启动与候选展示。[任务运行（service-task-runtime-application.ts）](../../services/buildr/src/modules/service-runtime/application/service-task-runtime-application.ts)按真实任务范围选择单个或多个服务，逐个等待所选后端再启动依赖它的前端，明确返回部分成功或复用，不隐式启动未选服务；[读取视图（service-runtime-view.ts）](../../services/buildr/src/modules/service-runtime/application/service-runtime-view.ts)合成服务目录概览、详情及按声明后端分组的本地目标候选，定义损坏只降级该服务。
  - **`persistence/`** — 定义来自工作空间（Workspace）的 `services/<service-code>/runtime.yml`；[运行存储（runs-repository.ts）](../../services/buildr/src/modules/service-runtime/persistence/runs-repository.ts)维护 `.buildr/local/service-runtime/` 本机快照与日志位置。旧用户配置及部署历史保留，不作为当前部署能力。
  - **`infrastructure/`** — [托管进程（managed-process.ts）](../../services/buildr/src/modules/service-runtime/infrastructure/managed-process.ts)负责独立进程、可验证身份、输出、存活、停止子进程及端口/HTTP 就绪检查；[共享运行锁（runtime-lock.ts）](../../services/buildr/src/modules/service-runtime/infrastructure/runtime-lock.ts)协调实例状态与端口，迟到检查不能恢复已停止或失败实例；[任务目录关联（task-worktree-association.ts）](../../services/buildr/src/modules/service-runtime/infrastructure/task-worktree-association.ts)将当前任务提供者证据与真实 Git 检出身份核对，无法读取的无关仓库不阻止有效任务服务启动。
  - [命令入口（service-runtime-cli.ts）](../../services/buildr/src/modules/service-runtime/interfaces/cli/service-runtime-cli.ts)与[网页入口（service-runtime-http.ts）](../../services/buildr/src/modules/service-runtime/interfaces/http/service-runtime-http.ts) — 适配同一应用。命令启动等待就绪，网页启动返回当前状态后继续读取；任务使用 `task-show`、`task-start`，切换使用 `restart`，停止与重启均使用准确运行编号。

前端 **[`features/service-runtime/`](../../services/buildr-web/src/features/service-runtime/)** 在现有服务目录、详情双栏和任务工作路径中共用实例事实，工作台只读汇总继续跳转。页面展示代码来源、分支（Branch）、提交（Commit）、改动、入口、时间、端口、逐后端连接及日志；服务编辑与创建抽屉登记服务 `type`（仅 `frontend`/`backend`，界面显示「前端」「后端」），「打开」只对 frontend 类型显示。启动/切换对话框按声明后端分组列出全部已就绪实例（来源、分支、地址、同范围标记），每个后端独立选择默认自动、具体实例或远程测试地址；任务组合对话框保留服务勾选及整体本地/远程选项。打开真实地址使用新浏览器页签（Tab）。已就绪和连接快照都不等于业务验证完成。请求及数据操作由[客户端](../../services/buildr-web/src/features/service-runtime/api/service-runtime-api.ts)和[读取钩子](../../services/buildr-web/src/features/service-runtime/hooks/useServiceRuntime.ts)隔离，页面可见时轮询发现外部运行变化。

智能体（Agent）从[产品技能入口](../../services/buildr/resources/runtime/skills/buildr/SKILL.md)发现能力，具体方法在[服务本地运行](../../services/buildr/resources/runtime/skills/buildr/references/local-services.md)。QA 部署页面、计划、提交及专属适配器暂停；独立外部系统操作继续由通用连接和用户专业技能（Skill）承担，不删除用户连接。

## 对象装配与跨模块依赖

| 入口 | 代表职责 |
| --- | --- |
| [`bootstrap/runtime.ts`](../../services/buildr/src/bootstrap/runtime.ts) | `createRuntime` 创建技术运行时（Runtime）并安装模块；`runtimeProvide` 读取具名能力，`runtimeContributions` 汇集入口贡献 |
| [`bootstrap/module-registry.ts`](../../services/buildr/src/bootstrap/module-registry.ts) | `install`、`provide`、`contributions` 校验依赖、提供者唯一性与装配顺序 |
| [`bootstrap/cli/registry.ts`](../../services/buildr/src/bootstrap/cli/registry.ts) | 将各模块贡献组合为唯一命令目录、帮助和分发入口 |

确需延后连接的依赖由上述装配中的一次性绑定器（Binder）处理，以当前代码为准，不另列易漂移的成员清单。生产运行时（Runtime）不暴露 `createTask`、`doctor` 等扁平业务方法；测试需要便利入口时使用 [`runtime-harness.ts`](../../services/buildr/test/helpers/runtime-harness.ts)。

资产装配逐项注入局部依赖，只公开调用方需要的方法。`AGENT_ASSETS_DIAGNOSTICS_READ` 只提供检查；`inspectPackageBuiltins` 固定以检查模式调用所属能力，诊断方不能请求同步写入。来源见[资产装配](../../services/buildr/src/modules/agent-assets/module.ts)和[诊断装配](../../services/buildr/src/modules/diagnostics/module.ts)。

投射的应用与计划交给唯一协调器执行；适配声明不反向导入执行器，也不直接写删文件。协调器保留冲突预检、比较模式、记录最后提交及旧回执迁移恢复，不因此承诺所有文件异常下的全局回滚。详见[投射地图](skill-projection.md)。

## OpenSpec 接入与恢复

任务关联读取先由任务应用选择受信任副本，再委托 `OPENSPEC_QUERY` 查内容；全局列表直接使用 OpenSpec 查询，不经过任务，也不扫描工作树（Worktree）。`task_changes` 关系仍归任务模块，OpenSpec 不反向依赖任务，见[任务地图](task-system.md)。

| 技术职责 | 唯一实现入口与边界 |
| --- | --- |
| 内容查询 | [`change-query.ts`](../../services/buildr/src/modules/openspec/application/change-query.ts)：列表、详情、活动及归档定位、产物和原型读取 |
| 用例组织 | [`openspec-application.ts`](../../services/buildr/src/modules/openspec/application/openspec-application.ts)：解析项目（Project）及变更（Change），组织校验与收敛 |
| 上游解析 | [`upstream-openspec.ts`](../../services/buildr/src/modules/openspec/application/upstream-openspec.ts) 与[工作进程](../../services/buildr/src/modules/openspec/application/upstream-openspec-worker.ts)：用锁定上游解析增量、形成预期内容并校验，不自行写主规范 |
| 归档与恢复 | [`openspec-converge.ts`](../../services/buildr/src/modules/openspec/application/openspec-converge.ts)：核对输入后调用上游归档并回读；[恢复模型](../../services/buildr/src/modules/openspec/application/convergence-model.ts)和[当前观察](../../services/buildr/src/modules/openspec/application/convergence-observer.ts)比较修改前、预期与实际内容；未知状态保留现场 |
| 只读预检 | [`openspec-convergence-preflight.ts`](../../services/buildr/src/modules/openspec/application/openspec-convergence-preflight.ts)：核对活跃冲突与归档输入，不代替正式归档 |

OpenSpec 只通过 `AGENT_ASSETS_OPENSPEC_SUPPORT` 获取所需资产能力，具体签名与筛选由[资产模块](../../services/buildr/src/modules/agent-assets/module.ts)中的 `OpenSpecAssetSupport` 和 `createOpenSpecAssetSupport` 维护，不注入完整私有资产对象。恢复机制保护可核对现场，不承诺整个上游归档原子写入。

## 前端技术层

前端不复制后端所有层次。[`features/`](../../services/buildr-web/src/features/) 内的业务客户端、请求状态、组件和页面按需要建立；共享传输在 [`api/client.ts`](../../services/buildr-web/src/api/client.ts)，协议类型来自生成目录。应用壳与功能各自持有状态，不互相复制。

后台代码观察的[跨页面共享等待](../../services/buildr-web/src/features/code/api/shared-source-control-watch.ts)在浏览器支持相关能力时，使用浏览器跨页面互斥锁（Web Locks）和同源广播通道（BroadcastChannel），让同一工作空间（Workspace）只占用一个等待连接；仅相同观察游标（Cursor）共享通知，关闭持有页面后由其他页面接续。通用请求在发出前禁用浏览器缓存（Browser Cache），避免当前读取在缓存入口排队。

- **共同展示与入口隔离**：[`AppShellView.tsx`](../../services/buildr-web/src/app/AppShellView.tsx) 和 [`AppNavigationItem.tsx`](../../services/buildr-web/src/app/AppNavigationItem.tsx) 提供展示；正式入口接入真实数据，已授权原型可复用展示并注入模拟数据，不能调用真实写入。
- **连续阅读与当前事实**：已访问页面保留筛选、滚动和局部输入；[项目资料阅读钩子（Hook）](../../services/buildr-web/src/lib/useMarkdownDocumentViewer.ts)只接受当前请求世代，重置、切换项目和卸载使先前读取失效，历史从实际初始文档开始。本地存储（localStorage）只保存偏好，不可用时不应阻断工作；保留页面不等于业务数据最新，保存仍需版本检查。
- **共享内容区与来源身份**：[`WorkspacePages.tsx`](../../services/buildr-web/src/app/WorkspacePages.tsx)组合保留路由和 [`WorkspacePaneHost.tsx`](../../services/buildr-web/src/app/WorkspacePaneHost.tsx)；工作台、工作空间与代码共用同一条页面页签集，代码页签进入该页签集而文件页签仍留在代码页内部。`WorkspacePaneHost` 以页面来源 `ownerPath` 与局部对象键区分右侧标签，滚动身份则采用页面来源和真实资料 `identity`。[`WorkspaceStage.tsx`](../../services/buildr-web/src/components/WorkspaceStage.tsx)将原领域内容传送到固定目标，宿主在同一槽位挂载目标并切换显示，不复制数据或编辑器。菜单请求带递增序号，同一路径仍能恢复中间页面，右侧资料选择保持独立。
- **暂看与领域操作**：[`WorkspacePaneContext.tsx`](../../services/buildr-web/src/app/WorkspacePaneContext.tsx)分开临时显示与正式选择；领域的 `objectContent` 适配显示对象、原选择和可见性，已打开对象按稳定身份保留挂载。[`pageTabs.tsx`](../../services/buildr-web/src/app/pageTabs.tsx)的 `WorkspaceViewTransientContext`将暂看语义传入领域，[`FileEditingPane.tsx`](../../services/buildr-web/src/components/file-editing/FileEditingPane.tsx)据此抑制自动聚焦，保留用户明确编辑、原保存与冲突处理。悬停不提交正式选择，局部展开及明确打开资料通过原回调生效；代码区内部布局不由此宿主替换。
- **文件搜索与位置保留**：[`file-code-search.ts`](../../services/buildr-web/src/components/file-editing/file-code-search.ts)只为当前编辑视图提供匹配高亮和选中行，不修改正文或撤销记录。[`FileCodeEditor.tsx`](../../services/buildr-web/src/components/file-editing/FileCodeEditor.tsx)处理明确的字符定位请求，重新显示同一视图不会重放旧锚点；[`ReadOnlyFileCodeEditor.tsx`](../../services/buildr-web/src/components/file-editing/ReadOnlyFileCodeEditor.tsx)保留分段真实行号与匹配字符偏移，显示状态已初始化时避免重复重建。正文相对链接由原文件来源解析，代码页面的工作对象链接进入真实目标页面。
- **路由与文章编辑退出**：[启动入口](../../services/buildr-web/src/main.tsx)通过单个数据路由器（Data Router）继续装配原有 [App 地址树](../../services/buildr-web/src/App.tsx)，不增加加载器或路由数据缓存。[文章导航边界](../../services/buildr-web/src/features/publication/publication-navigation.ts)按实际路由判断同一工作空间壳是否保留；独立原型页属于释放边界。[文章编辑面板](../../services/buildr-web/src/features/publication/components/ArticleEditorPanel.tsx)持有唯一草稿与保存状态，离开释放现场的位置前复用放弃确认，保存中取消退出且不重放；同工作空间普通导航保持面板。浏览器刷新或关闭只请求原生离开提醒，不承诺未保存内容持久恢复。
- **指令与请求时效**：生成的智能体（Agent）指令只对应当前输入。目标或范围变化后旧指令失效，迟到请求不能恢复旧结果；上下文切换释放旧表单，生成失败也不回退到旧指令。
- **局部失败与草稿**：任务材料按需读取，某项失败不隐藏其他可读成果。共用抽屉外观不代表所有表单已经具有相同草稿保护；保存、错误和保留输入仍由各功能负责。
- **原型与侧读**：原型以 `sandbox="allow-scripts"` 隔离，不能继承主页面会话（Session）。说明和清单共用 [`SideReadingPanel.tsx`](../../services/buildr-web/src/components/SideReadingPanel.tsx) 及[阅读状态](../../services/buildr-web/src/components/useSideReading.ts)；任务内、独立阅读及可选说明解析见[任务地图](task-system.md#原型阅读怎样落到实现)，不新增一份业务状态。

正式规则见[前端约束](../../services/buildr-web/AGENTS.md)。前端阅读、交互和源状态分别核验，逻辑通过不能代替浏览器验收。

## 技术机制与结果边界

通用[文件机制](../../services/buildr/src/infrastructure/filesystem/)提供路径、原子替换、独占锁、身份及写入恢复；[SQLite 机制](../../services/buildr/src/infrastructure/sqlite/)提供连接、迁移和事务（Transaction）；[进程调用](../../services/buildr/src/infrastructure/process.ts)保存结构化结果。这些机制不拥有业务约束；具体数据与恢复边界见[数据设计](../docs/architecture/buildr-data-design.md)。

[诊断应用](../../services/buildr/src/modules/diagnostics/application/doctor-application.ts)组合检查，[结果模型](../../services/buildr/src/modules/diagnostics/application/result-model.ts)表达发现、健康和修复计划；[安装状态](../../services/buildr/src/modules/installation/application/product-installation-status.ts)与[更新应用](../../services/buildr/src/modules/installation/application/cli-update.ts)分别保存实际观察和更新结果。诊断、安装成功与当前运行实例已采用仍是不同事实。

npm 软件包更新后，安装模块通过窄端口（Port）委托[网页更新交接](../../services/buildr/src/web/application/update-web-handoff.ts)，以新登记的精确 Node.js 与软件包入口启动独立进程并核对运行身份；[实例生命周期](../../services/buildr/src/web/application/instance-lifecycle.ts)唯一拥有启动锁、同一安装实例的认证退出和新版启动。引导装配（Bootstrap）只连接能力，不复制交接策略。网页未运行时不启动，切换失败保留已经成立的安装更新结果。

Buildr Web 页面内的分阶段更新由[更新任务应用](../../services/buildr/src/modules/installation/application/update-flow.ts)承载：[本机记录](../../services/buildr/src/modules/installation/infrastructure/update-flow-store.ts)按安装路径隔离，以比较并交换（Compare and Swap，CAS）及原子写入保留目标、阶段和成功事实，记录不授予安装权限。`prepare` 核对安装凭据和发布登记后下载，`apply` 经用户确认后复核权限，再安装、[检查及修复已有启动入口](../../services/buildr/src/modules/installation/application/update-launcher.ts)、委托网页交接。`recover` 绑定任务与版本，仅重试失败环节；启动入口或网页恢复失败保留安装结果。实际运行版本来自进程启动身份，不能以磁盘版本冒充；新进程读取记录并重新核验安装及启动入口。开发源码只模拟状态流转，预览实例拒绝三个写入口；[更新 HTTP 接口](../../services/buildr/src/modules/installation/interfaces/http/update-flow-http.ts)提供状态读取、准备、应用和恢复。

前端[更新入口](../../services/buildr-web/src/features/installation/components/UpdateEntry.tsx)通过顶部更多菜单主动检查，发现更新或有待继续事项时才显示图标。[更新弹窗](../../services/buildr-web/src/features/installation/components/UpdateDialog.tsx)与原型共用组件，[视图状态](../../services/buildr-web/src/features/installation/lib/update-view.ts)分别呈现安装、启动入口、重连和版本核验结果。[更新观察](../../services/buildr-web/src/features/installation/hooks/useUpdateFlow.ts)轮询任务，断开时保留弹窗等待新会话（Session），页面恢复后核验实际运行版本；开发模拟通过既有重启接口重启实例。

任务协作记录保存在 SQLite，恢复、迁移与边界见[任务地图](task-system.md)与[数据设计](../docs/architecture/buildr-data-design.md)。工程包检查仍在 `tools/verification/`，不归资产应用或诊断所有。
