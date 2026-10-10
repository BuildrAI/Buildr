# 服务与工程目录地图

从产品能力找到唯一实现入口，再区分源码、工程工具、生成结果和交付内容。下列路径相对 `projects/product/`；[技术架构](../docs/architecture/technical.md)解释协作边界，[模块内部地图](technical-layers.md)用代表实现说明分层，不在这里镜像完整文件树。

## 后端产品模块

| 要修改的能力 | 实现入口 | 责任与深入入口 |
| --- | --- | --- |
| 工作空间（Workspace）、项目（Project）、服务（Service）与代码库（Repository） | [workspace/module.ts](../../services/buildr/src/modules/workspace/module.ts) | 身份、来源、登记、组成与受管写入；见[关系地图](project-service-repositories.md) |
| 代码目录、文件与源代码管理 | [code/module.ts](../../services/buildr/src/modules/code/module.ts) | 已登记来源的读取、提交说明、直接 Git 提交与推送；[比较用例](../../services/buildr/src/modules/code/application/source-control-application.ts)核对来源与观察版本，[图片读取](../../services/buildr/src/modules/code/infrastructure/source-control-image-reader.ts)按磁盘、索引及完整提交（Commit）组织新旧侧，保持缺侧与读取失败的区别 |
| 本机智能体（Agent）接入与统一生成 | [agent-operations/module.ts](../../services/buildr/src/modules/agent-operations/module.ts) | 登记、默认选择、执行（Run）及单进程生命周期；具体提供者负责 Codex 应用服务（App Server）与 DSH 智能体客户端协议（ACP），不承载提交规范或持久会话平台 |
| 任务（Task）、答复、审查、验证与工作树（Worktree） | [task/module.ts](../../services/buildr/src/modules/task/module.ts) | 各项独立协作事实及 Git 位置；见[任务地图](task-system.md) |
| 项目每日演进 | [task/daily-progress/](../../services/buildr/src/modules/task/daily-progress/) | 同一任务装配入口中的独立能力；保存本机摘要并关联提交和任务，见[使用与边界](../docs/flows/project-daily-progress.md) |
| 工作台（Workbench） | [workbench/module.ts](../../services/buildr/src/modules/workbench/module.ts) | 有界组合已有事实，独立保存个人计划、关注、收藏与最近访问 |
| 任务关联变更 | [task/change/module.ts](../../services/buildr/src/modules/task/change/module.ts) | 核对任务关联与受信任副本，委托 OpenSpec 读取，不拥有规范正文 |
| OpenSpec | [openspec/module.ts](../../services/buildr/src/modules/openspec/module.ts) | 变更读取、冲突检查、上游归档接入与恢复；见[接入边界](technical-layers.md#openspec-接入与恢复) |
| 工作资产（Work Asset） | [agent-assets/module.ts](../../services/buildr/src/modules/agent-assets/module.ts) | 规则（Rule）、技能（Skill）、命令（Command）、组件（Component）、能力选择与投射；见[投射地图](skill-projection.md) |
| 用户项目测试声明 | [project-testing/module.ts](../../services/buildr/src/modules/project-testing/module.ts) | 维护 `verification.yml`，不执行用户测试；见[验证地图](verification-framework.md) |
| 安装、更新与版本提示 | [installation/module.ts](../../services/buildr/src/modules/installation/module.ts) | 安装身份、npm 启动器（Launcher）、版本查询与更新 |
| Doctor 诊断 | [diagnostics/module.ts](../../services/buildr/src/modules/diagnostics/module.ts) | 聚合只读检查，不注入业务写入者 |
| 知识阅读 | [knowledge/module.ts](../../services/buildr/src/modules/knowledge/module.ts) | 范围、目录、正文、图示与来源读取；见[知识地图](knowledge-maintenance.md) |
| 文章（Publication） | [publication/module.ts](../../services/buildr/src/modules/publication/module.ts) | 文章与资源读写；现有接口不代表首版体验已经完成验收 |

具体能力标识及公开端口以各入口的导出和贡献声明为准，不在文章中再维护一份完整成员清单。

## 后端服务（Backend Service）的工程边界

- **[`services/buildr/src/`](../../services/buildr/src/)**：产品源码。
  - [`bootstrap/`](../../services/buildr/src/bootstrap/) 创建技术运行时（Runtime）、装配模块、汇集命令与诊断入口。
  - [`modules/`](../../services/buildr/src/modules/) 按上表的业务职责组织。
  - [`web/`](../../services/buildr/src/web/) 管理本机实例与预览生命周期、会话（Session）、静态托管和请求分发。
  - [`infrastructure/`](../../services/buildr/src/infrastructure/) 提供文件、SQLite、Git、进程、网络与资源定位，不接管业务规则。
- **[`resources/`](../../services/buildr/resources/)**：文件型交付来源。清单声明工作空间（Workspace）及运行时（Runtime）映射，安装资源和文本契约各自维护；[资源职责](../../services/buildr/docs/cli-architecture.md#文件型交付资源)集中解释。
- **[`tools/`](../../services/buildr/tools/)**：进入 Git 的工程程序，包括构建、协议生成、固定环境、验证准备、性能基准及发布恢复。独立性能基准不默认执行。
- **[`test/`](../../services/buildr/test/)**：用例、测试准备与测试执行支撑。测试族、选择及证据责任见[测试工具地图](product-verification-tools.md)，不与产品 `project-testing` 模块混用。
- `build/`、`web-dist/`：被 Git 忽略的派生结果；后者同时是前端构建产物和后端托管内容。
- [`bin/buildr.mjs`](../../services/buildr/bin/buildr.mjs) 是薄入口；[`package.json`](../../services/buildr/package.json) 保存依赖、命令、公开导出与打包声明，配置不在地图中复制。

`tools/build/` 是构建程序，服务根 `build/` 是构建结果；`package/` 已无源码或输出职责。公开测试库由 `@buildr-ai/buildr/test-context` 指向 `build/test-context/public.js` 和类型声明。正式打包可生成旧根文件的兼容转发，不把它恢复成手工源码。

## 前端服务（Frontend Service）的工程边界

- **[`services/buildr-web/src/features/`](../../services/buildr-web/src/features/)**：功能拥有自己的页面、业务请求、完整交互与状态。只按实际需要建立 `pages/`、`components/`、`hooks/`、`api/`，不要求目录对称。
  - **[`code/`](../../services/buildr-web/src/features/code/)**：具体工作树（Worktree）的文件、差异（Diff）与固定历史阅读。[`SourceControlImagePreview.tsx`](../../services/buildr-web/src/features/code/components/SourceControlImagePreview.tsx)消费已核对比较结果的新旧图片及缺侧，在共享阅读壳内按宽度显示；图片格式、字节和版本由后端读取负责，页面不猜路径或替换来源。
  - **[`agents/`](../../services/buildr-web/src/features/agents/)**：全局接入列表、默认选择与统一生成控件；显示接入方式、原生配置来源及最近实际确认值，不复制业务生成或 Git 写入规则。
- **[`src/app/`](../../services/buildr-web/src/app/)**：应用壳和跨页组合。[`AppNavigation.tsx`](../../services/buildr-web/src/app/AppNavigation.tsx) 与 [`navigation.ts`](../../services/buildr-web/src/app/navigation.ts) 管理导航；[`WorkspacePages.tsx`](../../services/buildr-web/src/app/WorkspacePages.tsx) 保留已访问页面，[`WorkspaceStage.tsx`](../../services/buildr-web/src/components/WorkspaceStage.tsx) 组织主副阅读区。
- **[`src/api/`](../../services/buildr-web/src/api/)**：共享传输、会话（Session）和当前请求范围，不组装各功能业务客户端。
- [`src/components/`](../../services/buildr-web/src/components/)、[`src/lib/`](../../services/buildr-web/src/lib/)：真实跨功能复用的展示和纯逻辑；功能私有状态留在原处。
- [`App.tsx`](../../services/buildr-web/src/App.tsx)、[`index.html`](../../services/buildr-web/index.html)、[`vite.config.ts`](../../services/buildr-web/vite.config.ts)：分别维护路由、页面壳与会话注入位置、构建配置。
- [`test/`](../../services/buildr-web/test/) 同时有前端逻辑检查和独立浏览器检查；不能将逻辑检查通过当成真实页面已验证。

当前可见入口以路由和导航为准，不从目录名推断页面已经开放。前端沿用 Ant Design 5 和随构建交付的资源，不依赖远程界面脚本。状态、安全和正式页面与原型的共享边界见[前端技术层](technical-layers.md#前端技术层)。

## DSH 插件服务的工程边界

- **[`services/dsh-plugin/plugin/`](../../services/dsh-plugin/plugin/)**：正式版与开发版共用源码；`src/client.tsx` 登记侧栏、来源列、详情和 Buildr 标签页，`src/orchestration.ts` 管理右侧标签复用，`bridge.ts` 与 `process.ts` 负责对应 Buildr 安装发现、健康查询与启动。`activation.ts` 与 `activation-client.ts` 让合作版本在同一运行域共享业务资格；`composition/` 从当前原声明派生可撤销的增强组件，不持久写入包内模块地址。
- **[`tools/`](../../services/dsh-plugin/tools/)**：核对 DSH 软件开发工具包（SDK）基线；`build-package.ts` 组合薄入口与全部增强组件，`verify-package.ts` 核验完整包字节并用真实装载器（Loader）验证入口；`release.ts` 检查独立版本及准备同一完整产物。
- **[`test/`](../../services/dsh-plugin/test/)**：入口、发现、进程、来源界面、业务资格及真实装载器（Loader）装卸的单元与集成检查。被忽略的 `build/` 保存构建结果及候选压缩包（Tarball）；官方桌面采用另以真实应用验收。

该服务与 Buildr 主包共用代码库（Repository），却拥有自己的包版本与发布事实；Buildr 主包候选不包含插件产物。发布与安装边界见[独立插件流程](../docs/flows/dsh-plugin-release.md)。

## 构建与消费

| 来源 | 生成者与结果 | 消费者 |
| --- | --- | --- |
| 后端模块的 HTTP 协议定义（Schema） | [`tools/codegen/contracts/`](../../services/buildr/tools/codegen/contracts/) → 两个服务（Service）的 `build/generated/` | 类型检查和前端编译 |
| [测试上下文公共入口](../../services/buildr/src/infrastructure/testing/context-runtime/public.ts) | [`test-context-build.ts`](../../services/buildr/tools/testing/test-context-build.ts) → `build/test-context/public.js` 与声明 | 包清单的公开子路径 |
| 前端源码 | Vite → `buildr/web-dist/` | 后端托管与正式安装包 |
| 后端源码、资源、网页与公开测试库 | [`application-payload.ts`](../../services/buildr/tools/release/application-payload.ts) → 应用负载（Application Payload）与 npm 交付物 | 正式安装及发布检查 |
| DSH 插件源码与已核验 SDK | [`build-package.ts`](../../services/dsh-plugin/tools/build-package.ts) → 可搬移完整组合包；[`release.ts`](../../services/dsh-plugin/tools/release.ts) → 候选压缩包 | 官方 DSH 插件管理器；不进入 Buildr 主包 |

浏览器与候选构建各用隔离暂存目录，逻辑产物名称不变。测试适配器可准备夹具，真实网页仍由生产装配托管。构建产物存在不证明安装、发布或用户工作空间（Workspace）已经采用。
