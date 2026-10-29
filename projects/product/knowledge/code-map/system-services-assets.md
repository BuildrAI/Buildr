# 服务与工程目录地图

从产品能力找到唯一实现入口，再区分源码、工程工具、生成结果和交付内容。产品路径相对 `projects/product/`，发布技能（Skill）路径相对工作空间根；[技术架构](../docs/architecture/technical.md)解释协作边界，[模块内部地图](technical-layers.md)用代表实现说明分层，不在这里镜像完整文件树。

## 后端产品模块

| 要修改的能力 | 实现入口 | 责任与深入入口 |
| --- | --- | --- |
| 工作空间（Workspace）、项目（Project）、服务（Service）与代码库（Repository） | [workspace/module.ts](../../services/buildr/src/modules/workspace/module.ts) | 身份、来源、登记、组成与受管写入；见[关系地图](project-service-repositories.md) |
| 代码目录、文件与源代码管理 | [code/module.ts](../../services/buildr/src/modules/code/module.ts) | 已登记来源的全量或单库读取、提交说明、直接 Git 提交与推送；[远程获取应用](../../services/buildr/src/modules/code/application/code-fetch-application.ts)绑定已观察代码库（Repository）和检出身份，按真实仓库去重并隔离失败，[引用发布](../../services/buildr/src/modules/code/infrastructure/code-fetch-refs.ts)将内部临时获取结果原子发布到远程跟踪引用（Remote-tracking Ref），保留当前分支（Branch）和工作内容；[比较用例](../../services/buildr/src/modules/code/application/source-control-application.ts)核对来源与观察版本，[图片读取](../../services/buildr/src/modules/code/infrastructure/source-control-image-reader.ts)按磁盘、索引及完整提交（Commit）组织新旧侧，保持缺侧与读取失败的区别 |
| 内部智能体（Agent）对话宿主 | [agent-service/module.ts](../../services/buildr/src/modules/agent-service/module.ts) | 装配私有库 `@buildr-ai/buildr-agent`，交接已登记工作空间（Workspace）与任务（Task）身份，提供本机认证下的 HTTP/事件流；不直接导入服务私有文件 |
| 外部连接（Connection）与专业工具 | [connection-skills/module.ts](../../services/buildr/src/modules/connection-skills/module.ts) 与 [mysql-query/module.ts](../../services/buildr/src/modules/mysql-query/module.ts) | 通用模块维护声明绑定、实例及完整账号，专业方法访问外部系统；MySQL 查询独立维护只读执行和本机偏好，受控变更由接入程序按连接策略执行，见[连接地图](technical-layers.md#外部系统接入) |
| 任务（Task）、答复、审查、验证与工作树（Worktree） | [task/module.ts](../../services/buildr/src/modules/task/module.ts) | 各项独立协作事实及 Git 位置；见[任务地图](task-system.md) |
| 工作台（Workbench） | [workbench/module.ts](../../services/buildr/src/modules/workbench/module.ts) | 有界组合已有事实，独立保存个人计划、关注、收藏与最近访问 |
| 服务本地运行 | [service-runtime/module.ts](../../services/buildr/src/modules/service-runtime/module.ts) | 服务级运行定义、按实际检出目录的受管实例、任务范围单项与组合启动、真实连接目标和日志；各入口共享当前事实，QA 部署入口暂停，见[本地运行分层](technical-layers.md#服务本地运行) |
| 任务关联变更 | [task/change/module.ts](../../services/buildr/src/modules/task/change/module.ts) | 核对任务关联与受信任副本，委托 OpenSpec 读取，不拥有规范正文 |
| OpenSpec | [openspec/module.ts](../../services/buildr/src/modules/openspec/module.ts) | 变更读取、冲突检查、上游归档接入与恢复；见[接入边界](technical-layers.md#openspec-接入与恢复) |
| 工作资产（Work Asset） | [agent-assets/module.ts](../../services/buildr/src/modules/agent-assets/module.ts) | 技能（Skill）、命令（Command）、组件（Component）、能力选择与投射；规则（Rule）经 `AGENTS.md` 层级维护，本模块只保留存量登记与文件的兼容诊断；见[投射地图](skill-projection.md) |
| 用户项目测试声明 | [project-testing/module.ts](../../services/buildr/src/modules/project-testing/module.ts) | 维护 `verification.yml`，不执行用户测试；见[验证地图](verification-framework.md) |
| 安装、更新与版本提示 | [installation/module.ts](../../services/buildr/src/modules/installation/module.ts) | 安装身份、npm 启动器（Launcher）、版本查询与更新 |
| 工作区产物（Artifact）登记与处置 | [artifact-lifecycle/module.ts](../../services/buildr/src/modules/artifact-lifecycle/module.ts) | `.buildr/local/artifacts/` 文件式产物清单、scratch 根发现、即时处置状态与逐项核验清扫；`artifact` 命令族属 agent-machine 表面，登记为描述性可选动作 |
| Doctor 诊断 | [diagnostics/module.ts](../../services/buildr/src/modules/diagnostics/module.ts) | 聚合只读检查，不注入业务写入者 |
| 知识阅读 | [knowledge/module.ts](../../services/buildr/src/modules/knowledge/module.ts) | 范围、目录、正文、图示与来源读取；见[知识地图](knowledge-maintenance.md) |
| 文章（Publication） | [publication/module.ts](../../services/buildr/src/modules/publication/module.ts) | 文章与资源读写；现有接口不代表首版体验已经完成验收 |

具体能力标识及公开端口以各入口的导出和贡献声明为准，不在文章中再维护一份完整成员清单。

## 后端服务（Backend Service）的工程边界

- **[`services/buildr/src/`](../../services/buildr/src/)**：产品源码。
  - [`bootstrap/`](../../services/buildr/src/bootstrap/) 创建技术运行时（Runtime）、装配模块、汇集命令与诊断入口。
  - [`modules/`](../../services/buildr/src/modules/) 按上表的业务职责组织。
  - [`web/`](../../services/buildr/src/web/) 管理本机实例与预览生命周期、会话（Session）、静态托管和请求分发；同身份重启由 `web/http` 的重启端口交给 `web/application` 的后继进程编排，复用更新交接的启动锁、观察摘要与认证退出，不执行 npm 安装归属断言。[`preview-reuse.ts`](../../services/buildr/src/web/application/preview-reuse.ts) 与同目录 facet 实现承接 `web preview start --reuse development[:facet,…]` 的来源解析、facet 注册、播种/复用/刷新和结果汇总；写入限定在预览实例根，`web preview stop --purge` 的安全校验也由预览生命周期维护。
  - [`infrastructure/`](../../services/buildr/src/infrastructure/) 提供文件、SQLite、Git、进程、网络与资源定位，不接管业务规则。
- **[`resources/`](../../services/buildr/resources/)**：文件型交付来源。清单声明工作空间（Workspace）及运行时（Runtime）映射，安装资源和文本契约各自维护；[资源职责](../../services/buildr/docs/cli-architecture.md#文件型交付资源)集中解释。
- **[`tools/`](../../services/buildr/tools/)**：进入 Git 的工程程序，包括构建、协议生成、固定环境、验证准备及性能基准。独立性能基准不默认执行。
- **`skills/buildr-release/scripts/`（工作空间根）**：发布协调、产包与恢复，由发布技能（Skill）维护。
- **[`test/`](../../services/buildr/test/)**：用例、测试准备与测试执行支撑。测试族、选择及证据责任见[测试工具地图](product-verification-tools.md)，不与产品 `project-testing` 模块混用。
- `build/`、`web-dist/`：被 Git 忽略的派生结果；后者同时是前端构建产物和后端托管内容。
- [`bin/buildr.mjs`](../../services/buildr/bin/buildr.mjs) 是薄入口；[`package.json`](../../services/buildr/package.json) 保存依赖、命令、公开导出与打包声明，配置不在地图中复制。

`tools/build/` 是构建程序，服务根 `build/` 是构建结果；`package/` 已无源码或输出职责。公开测试库由 `@buildr-ai/buildr/test-context` 指向 `build/test-context/public.js` 和类型声明。正式打包可生成旧根文件的兼容转发，不把它恢复成手工源码。

## 智能体服务（Agent Service）的工程边界

- **[`services/buildr-agent/`](../../services/buildr-agent/)**：与主包统一发行的私有库，维护内部对话和执行接入；提供独立执行进程（Agent Process），没有单独的公开 npm 发布或额外安装步骤。
  - [`src/index.ts`](../../services/buildr-agent/src/index.ts) 与 [`src/contracts.ts`](../../services/buildr-agent/src/contracts.ts)：唯一公开应用入口、宿主（Host）依赖、视图、执行器（Executor）和独立控制契约；主包按包名消费。核心装配位于 [`application/agent-service.ts`](../../services/buildr-agent/src/application/agent-service.ts)，独立承载不反向导入公开入口。
  - [`src/execution-contracts.ts`](../../services/buildr-agent/src/execution-contracts.ts)、[`src/operation-schemas.ts`](../../services/buildr-agent/src/operation-schemas.ts)和[`src/process/`](../../services/buildr-agent/src/process/)：三组版本化契约（Contract）、唯一通用声明、公共客户端（Client）、独立承载、持有锁、保留运行单元（Runtime Unit）和空闲版本交接；Buildr 不直接持有执行核心。
  - [`src/application/connection-application.ts`](../../services/buildr-agent/src/application/connection-application.ts)：独立接入、官方登录尝试、账号和模型检查、程序及配置绑定与资源释放。
  - [`src/application/preparation-application.ts`](../../services/buildr-agent/src/application/preparation-application.ts)：准备尝试、发现与选择、独立安装、登录接续及取消；刷新按准确尝试查询，不改绑已有上下文。
  - [`src/executors/program-manager.ts`](../../services/buildr-agent/src/executors/program-manager.ts) 与 [`program-policy.ts`](../../services/buildr-agent/src/executors/program-policy.ts)：本机来源发现、ChatGPT App 身份和签名、固定官方包独立安装及共享版本策略；浏览器工具不在此处安装。
  - [`src/application/conversation-application.ts`](../../services/buildr-agent/src/application/conversation-application.ts)：普通或任务对话、预览与受理、参与者接续、历史归并、状态观察及准确控制。
  - [`src/application/conversation-events.ts`](../../services/buildr-agent/src/application/conversation-events.ts)：带代次与游标的事件流，补读仍以私有库为准。
  - [`src/domain/agent-state.ts`](../../services/buildr-agent/src/domain/agent-state.ts) 与 [`src/persistence/conversation-repository.ts`](../../services/buildr-agent/src/persistence/conversation-repository.ts)：交互身份、状态边界和 SQLite；不写任务数据库或工作空间（Workspace）源资产。[`src/persistence/connection-relocation.ts`](../../services/buildr-agent/src/persistence/connection-relocation.ts) 是预览沿用连接的唯一重定位入口：只读取来源 `connections` 表，重写数据根前缀并重建原生绑定，不复制会话、附件或交接材料。
  - [`src/executors/`](../../services/buildr-agent/src/executors/)：Codex 应用服务（App Server）、DSH 完整本机网页宿主（Web Host）、Qoder 软件开发工具包（SDK）及原生命令行（CLI）的协议、进程和上下文。`native-process.ts` 只承担隔离环境、程序核验及私有进程通信。
  - [`tools/build.ts`](../../services/buildr-agent/tools/build.ts) 与 [`test/`](../../services/buildr-agent/test/)：严格编译公开包及服务独立检查；`build/` 是派生运行结果。

服务（Service）不是自研的 Buildr 智能体（Agent）。未来自研执行者可以实现同一公开契约，当前只有三家原生适配。单次生成复用统一模型（Model）配置；旧登记和外部桌面关系已退役。恢复和图形界面（GUI）与对话界面（Talk UI）边界见[内部技术层](technical-layers.md#内部对话与原生执行)。

## 前端服务（Frontend Service）的工程边界

- **[`services/buildr-web/src/features/`](../../services/buildr-web/src/features/)**：功能拥有自己的页面、业务请求、完整交互与状态。只按实际需要建立 `pages/`、`components/`、`hooks/`、`api/`，不要求目录对称。
  - **[`code/`](../../services/buildr-web/src/features/code/)**：具体工作树（Worktree）的文件、差异（Diff）与固定历史阅读。源代码管理与资源管理器保留“列表/树 + 阅读区”两栏；源代码管理在阅读区顶部固定“未提交变更 / 提交历史”两个视图页签，左栏保留紧邻列表的同名切换；两处入口各自独立，页签只切换右侧阅读视图、左栏切换只切换列表，只有在列表中选择文件、比较层或提交时阅读区才切到该对象所属视图，每个视图一次只显示一个差异、临时完整文件或提交详情，不创建文件页签；切换视图恢复各自的文件或固定提交现场。资源管理器沿用多文件页签，两处展开阅读只显示图标，源代码管理的展开按钮位于阅读区视图页签行右端。[`SourceControlImagePreview.tsx`](../../services/buildr-web/src/features/code/components/SourceControlImagePreview.tsx)消费已核对比较结果的新旧图片及缺侧，在共享阅读壳内按宽度显示；图片格式、字节和版本由后端读取负责，页面不猜路径或替换来源。
  - **[`agent-conversations/`](../../services/buildr-web/src/features/agent-conversations/)**：全局内部对话、统一历史、独立账号、发送预览、工具与授权问题、停止和状态核对；[文本产品动作](../../services/buildr-web/src/features/agent-conversations/conversation-product-action.ts)与手工首条发送共用提交身份和恢复，通过共享上下文（Context）承接服务运行配置，不感知配置业务；使用独立客户端（Client），不复用一次生成登记。
  - **[`service-runtime/`](../../services/buildr-web/src/features/service-runtime/)**：服务目录本地摘要、服务详情及任务本地验证共用实例事实与操作；启动可选单项或多项及前端连接目标，日志按实例阅读，工作台保持只读汇总；数据操作由同一客户端隔离，QA 页面及客户端退场。
- **[`src/app/`](../../services/buildr-web/src/app/)**：应用壳和跨页组合。[`AppPrimaryNavigation.tsx`](../../services/buildr-web/src/app/AppPrimaryNavigation.tsx) 保持最左侧一级图标列和二级菜单悬停、固定；[`AppNavigation.tsx`](../../services/buildr-web/src/app/AppNavigation.tsx) 与 [`navigation.ts`](../../services/buildr-web/src/app/navigation.ts) 管理各区菜单；[`AppLayout.tsx`](../../services/buildr-web/src/app/AppLayout.tsx) 将全局对话停靠在右侧或一级图标列左侧，不改原中右工作屏的展开与折叠；[`WorkspacePages.tsx`](../../services/buildr-web/src/app/WorkspacePages.tsx) 保留页面实例及各自路由位置，并维护工作台、工作空间与代码共用的页面页签集；代码页签进入该页签集，文件页签仍留在代码页内部。宿主（Host）分别保存打开列表与有序固定偏好，关闭页面保留其固定位置；[`workspace-pages.ts`](../../services/buildr-web/src/app/workspace-pages.ts) 负责可信页面解析、固定区前置及两区排序边界，[`PageTabStrip.tsx`](../../services/buildr-web/src/app/PageTabStrip.tsx) 提供左侧固定操作、拖动与键盘排序，激活页面保持个人顺序。[`WorkspacePaneHost.tsx`](../../services/buildr-web/src/app/WorkspacePaneHost.tsx) 汇集已打开页面与右侧对象，持有中右显示和暂看选择。[`WorkspacePaneContext.tsx`](../../services/buildr-web/src/app/WorkspacePaneContext.tsx) 提供固定内容目标注册及明确展开回调，数据和草稿仍由领域入口持有。
  - [`WorkspaceStage.tsx`](../../services/buildr-web/src/components/WorkspaceStage.tsx)：适配页面及对象内容，通过传送门（Portal）连接固定目标；其 `WorkspacePaneStage` 负责分屏比例、收起及按真实身份保存滚动。内嵌详情不注册第二宿主（Host），代码区沿用自己的内部布局。
  - [`CollapsedPaneTabs.tsx`](../../services/buildr-web/src/components/CollapsedPaneTabs.tsx) 与 [`usePanePeek.ts`](../../services/buildr-web/src/components/usePanePeek.ts)：呈现竖向标签、单标签展开与整栏恢复，管理悬停延迟、点击保持、输入聚焦及键盘退出；不拥有领域数据或文件保存。
- **[`src/api/`](../../services/buildr-web/src/api/)**：共享传输、会话（Session）和当前请求范围，不组装各功能业务客户端。
- [`src/components/`](../../services/buildr-web/src/components/)、[`src/lib/`](../../services/buildr-web/src/lib/)：真实跨功能复用的展示和纯逻辑；功能私有状态留在原处。
- [`App.tsx`](../../services/buildr-web/src/App.tsx)、[`index.html`](../../services/buildr-web/index.html)、[`vite.config.ts`](../../services/buildr-web/vite.config.ts)：分别维护路由、页面壳与会话（Session）注入位置、构建配置。
- [`test/`](../../services/buildr-web/test/) 同时有前端逻辑检查和独立浏览器检查；不能将逻辑检查通过当成真实页面已验证。

当前可见入口以路由和导航为准，不从目录名推断页面已经开放。前端沿用 Ant Design 5 和随构建交付的资源，不依赖远程界面脚本。状态、安全和正式页面与原型的共享边界见[前端技术层](technical-layers.md#前端技术层)。

## DSH 插件服务的工程边界

- **[`services/dsh-plugin/plugin/`](../../services/dsh-plugin/plugin/)**：正式版与开发版共用源码；`src/client.tsx` 登记侧栏、来源列、详情和 Buildr 标签页，`src/orchestration.ts` 管理右侧标签复用，`bridge.ts` 与 `process.ts` 负责对应 Buildr 安装发现、健康查询与启动。旧桌面生成与会话导航桥已退役。`activation.ts` 与 `activation-client.ts` 让合作版本在同一运行域共享业务资格；`composition/` 从当前原声明派生可撤销的增强组件，不持久写入包内模块地址。
- **[`tools/`](../../services/dsh-plugin/tools/)**：核对 DSH 软件开发工具包（SDK）基线；`build-package.ts` 组合薄入口与全部增强组件，`verify-package.ts` 核验完整包字节并用真实装载器（Loader）验证入口。独立版本及产物准备由工作空间根的 `skills/buildr-release/scripts/dsh-plugin/release.ts` 负责。
- **[`test/`](../../services/dsh-plugin/test/)**：入口、发现、进程、来源界面、业务资格及真实装载器（Loader）装卸的单元与集成检查。被忽略的 `build/` 保存构建结果及候选压缩包（Tarball）；官方桌面采用另以真实应用验收。

该服务与 Buildr 主包共用代码库（Repository），却拥有自己的包版本与发布事实；Buildr 主包候选不包含插件产物。发布与安装边界见[独立插件流程](../docs/flows/dsh-plugin-release.md)。

## 构建与消费

| 来源 | 生成者与结果 | 消费者 |
| --- | --- | --- |
| 后端模块的 HTTP 协议定义（Schema） | [`tools/codegen/contracts/`](../../services/buildr/tools/codegen/contracts/) → 两个服务（Service）的 `build/generated/` | 类型检查和前端编译 |
| [测试上下文公共入口](../../services/buildr/src/infrastructure/testing/context-runtime/public.ts) | [`test-context-build.ts`](../../services/buildr/tools/testing/test-context-build.ts) → `build/test-context/public.js` 与声明 | 包清单的公开子路径 |
| 智能体服务（Agent Service）源码与锁定依赖 | [`buildr-agent/tools/build.ts`](../../services/buildr-agent/tools/build.ts) → 私有库 `build/`；[`prepare-development-agent.ts`](../../services/buildr/tools/development/prepare-development-agent.ts) → 主包 `node_modules/@buildr-ai/buildr-agent/` 的公开入口及完整运行依赖 | 主包按 `@buildr-ai/buildr-agent` 导入；[`agent-package.ts`](../../services/buildr/tools/build/agent-package.ts) 将同一准备结果放入正式负载 |
| 前端源码 | Vite → `buildr/web-dist/` | 后端托管与正式安装包 |
| 后端源码、资源、网页与公开测试库 | [`application-payload.ts`](../../../../skills/buildr-release/scripts/application-payload.ts) → 应用负载（Application Payload）与 npm 交付物 | 正式安装及发布检查 |
| DSH 插件源码与已核验 SDK | [`build-package.ts`](../../services/dsh-plugin/tools/build-package.ts) → 可搬移完整组合包；[`release.ts`](../../../../skills/buildr-release/scripts/dsh-plugin/release.ts) → 候选压缩包 | 官方 DSH 插件管理器；不进入 Buildr 主包 |

源码准备顺序为：在 `services/buildr-agent/` 使用 `../buildr/tools/development/run-development-npm ci --ignore-scripts` 安装锁定依赖，再用该入口 `run build`；随后在 `services/buildr/` 使用 `tools/development/run-development-npm ci --install-links`，由主包准备入口物化私有库。原生 Codex、DSH、Qoder 程序另按真实安装发现，不随客户端依赖自动下载。声明见[preparation.yml](../../preparation.yml)。

浏览器与候选构建各用隔离暂存目录，逻辑产物名称不变。测试适配器可准备夹具，真实网页仍由生产装配托管。构建产物存在不证明安装、发布或用户工作空间（Workspace）已经采用。

提交说明的[生成请求](../../services/buildr/src/modules/code/application/code-generation.ts)维护有界运行与取消，通过[统一模型能力](../../services/buildr-agent/src/model-access/application.ts)执行；[旧数据清理](../../services/buildr/src/modules/installation/infrastructure/retire-legacy-agent-data.ts)只删除固定的 Buildr 自有旧登记与关系。
