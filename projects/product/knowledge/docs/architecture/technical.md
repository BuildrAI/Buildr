# Buildr 怎样实现

Buildr 是本机优先的智能体（Agent）工作系统。两个服务（Service）协作提供同一产品：`services/buildr` 负责命令、业务能力、文件与数据库、本机网页托管及 npm 分发；`services/buildr-web` 负责 React 页面与交互。当前两者位于同一 Git 仓库，分别维护依赖和构建配置。

本章从一次操作走进实现，再解释代码怎样分工。数据字段见[数据设计](buildr-data-design.md)，具体文件见[服务与工程目录](../../code-map/system-services-assets.md)及[模块内部地图](../../code-map/technical-layers.md)。

## 一次操作怎样到达真实数据

![调用、数据与副作用责任](../../archify/flows/capability-data-responsibility.html)

调用主线是：命令行（CLI）或网页入口 → 所属应用用例 → 领域判断与数据访问 → 文件、SQLite 或外部工具。[单独打开关系图](../../archify/flows/capability-data-responsibility.html)可逐项查看。

入口负责解析输入和展示结果，应用用例负责业务判断与调用顺序，数据访问负责格式和读写。因此，网页与命令行（CLI）不能各自维护一份任务状态或业务规则。诊断读取这些能力的当前结果，不取得它们的写入权。

开发入口 `projects/product/buildr` 委托 `services/buildr/bin/buildr.mjs`；正式 npm 命令也从后者进入。`src/bootstrap/cli/main.ts` 处理进程错误及内部安装动作，`registry.ts` 创建技术运行时（Runtime）、汇集命令目录并分发。开发检出不会覆盖 PATH 上的正式 `buildr`。

网页通过功能自己的客户端（Client）发起请求。`src/web/http/router.ts` 处理会话（Session）、静态托管及分发，业务协议和处理函数留在所属模块的 `interfaces/http/`。正式安装只需要打包后的网页，不需要前端源码或 Vite 开发服务器。

请求进入分发前，先校验主机（Host）与本机服务实际监听的地址和端口一致；页面、静态文件及业务读取共用这一边界。写入仍另行校验来源与会话（Session），不能用其中一项代替其他保护。

## 代码按职责放在哪里

后端 `src/` 有四个主要目录：

| 目录 | 负责什么 |
| --- | --- |
| `bootstrap/` | 创建技术对象、装配模块、汇集命令和诊断入口 |
| `modules/` | 产品能力及其业务判断、数据访问和协议入口 |
| `web/` | 本机应用与预览进程、会话（Session）、静态文件和请求分发 |
| `infrastructure/` | 通用路径、文件、SQLite、Git、进程、网络和资源定位 |

模块内部按实际需要使用领域层（Domain）、应用层（Application）、数据访问层（Persistence）、专属基础设施（Infrastructure）和接口层（Interface）。没有相应职责时不建空层，也不为相似字段重复建立数据对象。

两个服务（Service）沿用同一[产品术语表](../glossary.md)，不各自重新定义任务、验证或工作范围。

依赖从接口层（Interface）进入应用层（Application），再到领域判断或数据访问。领域层（Domain）不依赖上层或输入输出；应用层（Application）不解析命令参数、不打印终端结果，也不直接导入其他模块内部文件。`module.ts` 负责私有装配。

`createRuntime()` 通过模块登记（Module Registry）检查依赖顺序与提供者唯一性。模块间以 `runtimeProvide()` 取得具名能力，以 `runtimeContributions()` 汇集命令、HTTP 和诊断。任务与变更、资产与诊断的两处真实循环通过一次性绑定器（Binder）解决：`TASK_CHANGE_BINDER`、`AGENT_ASSETS_DIAGNOSTICS_BINDER`。它们不能重新引入一个随处可写的全局业务对象。

## 哪个模块拥有哪项事实

| 模块目录（位于 `src/modules/`） | 主要职责 |
| --- | --- |
| `workspace/` | 工作空间（Workspace）、项目（Project）、服务（Service）和代码库实例（Repository Instance）的身份、来源与关联；受管文件写入 |
| `task/` | 任务记录、工作摘要（Work Context）、审查（Review）、验证（Verification）、父子关系和工作树（Worktree） |
| `task/change/` | 组合当前任务范围内的 OpenSpec 变更读取 |
| `task/daily-progress/` | 保存和读取每日演进，查询本身不扫描 Git |
| `workbench/` | 聚合已有工作事实，保存个人计划、关注、收藏等偏好 |
| `knowledge/` | 读取知识目录、导航、正文、图示及来源 |
| `agent-assets/` | 规则（Rule）、技能（Skill）、命令（Command）、组件（Component）、能力选择与投射 |
| `project-testing/` | 维护用户项目的 `verification.yml`，不执行其中声明的测试 |
| `openspec/` | 变更查询、冲突检查、上游归档接入与中断恢复 |
| `installation/` | npm 安装身份、更新、版本感知及正式启动器（Launcher） |
| `diagnostics/` | 聚合各模块只读诊断，形成 Doctor 结果 |
| `publication/` | 文章增改删及资源上传、读取；功能仍暂停完善 |

包资源清单由资产模块读取；项目与服务登记由工作空间（Workspace）模块维护。资产同步可以在同一次受管写入中调用登记维护，但不因此成为登记的第二个写入者。文章和每日演进的现有接口不代表它们已完成首发体验验收，状态见[能力范围](../overview.md)。

## 网页怎样保持连续阅读和可靠编辑

前端以 `src/features/<feature>/` 组织页面、组件、钩子（Hook）和业务客户端（Client）；`src/app/` 组合应用壳、导航和跨页状态；`src/api/` 只保留共享请求、会话（Session）和工作范围。跨功能组件与工具放在 `src/components/`、`src/lib/`，不重新承担业务状态。

页面标签页（Tab）保留已访问页面的筛选、滚动和草稿，关闭页面或切换工作空间（Workspace）后释放。浏览器本地存储（localStorage）保存偏好；不可用时应只失去恢复偏好的能力。保留页面不等于数据永远最新，编辑前仍需读取当前事实，并带上已观察版本保存。

工作概览中的答复只保存人的决定，不自动启动智能体（Agent）。任务详情按需读取工作摘要（Work Context）、审查（Review）、验证（Verification）和成果；局部读取失败不应隐藏其他可读内容。界面原型（UI Prototype）通过 `sandbox="allow-scripts"` 的隔离页面读取，不继承主页面会话（Session），也不代替正式页面验收。

交给智能体（Agent）的生成指令只对应当前输入。修改目标或范围后，旧指令立即失效；较早请求迟到也不能恢复旧结果。切换工作空间（Workspace）或操作上下文时释放旧表单，重新生成失败时不回退到旧指令。

通用抽屉 `DrawerShell` 统一外观，表单仍负责自己的保存和错误处理，不能假定所有表单已经有相同的草稿保护。前端采用 Ant Design 5，资源随构建交付，不依赖远程脚本。具体页面入口以 [`App.tsx`](../../../services/buildr-web/src/App.tsx)、[`AppNavigation.tsx`](../../../services/buildr-web/src/app/AppNavigation.tsx) 和[前端规则](../../../services/buildr-web/AGENTS.md)为准。

## 写入保护和失败边界

| 对象 | 当前保护方式 | 不能据此推断什么 |
| --- | --- | --- |
| 任务记录与关系 | 同一 SQLite 事务（Transaction），写入比较记录摘要 | 数据库提交不证明 Git 或外部系统已经交付 |
| 多个受管源文件 | 管理锁、操作记录、修改前镜像和恢复 | 多文件操作不是跨进程、数据库和外部系统的全局事务（Transaction） |
| 智能体（Agent）派生入口 | 文件清单、完整性和所有权回执（Ownership Receipt），冲突显式处理 | 内容相似不赋予删除或覆盖权限 |
| OpenSpec 主规范 | 锁定上游生成和校验预期内容，由上游 `openspec archive` 写入；Buildr 回读并保留恢复依据 | 不承诺整个上游归档为原子写入 |
| 本机实例与启动器（Launcher） | 产品身份、运行配置（Profile）及进程归属 | 名字或端口相同不证明属于当前安装 |

文件访问仍需核对真实路径与作用范围，恢复前还要重新核对当前对象。局部失败只影响依赖它的动作；已经从 Git、文件或实际系统核实的交付事实，不因内部登记失败而被否定。详细数据位置见[数据设计](buildr-data-design.md)。

## 生成、验证与发布

项目开发和构建使用 `.node-version` 指定的 Node.js `24.15.0`，通过 `tools/development/run-development-node` 或 `run-development-npm` 进入。依赖、准备方式和验证范围以各服务的包清单及项目声明为准，不从当前机器偶然可用的工具推断。

| 内容 | 源与结果 |
| --- | --- |
| HTTP 类型 | 后端模块维护协议模式（Schema）；`tools/codegen/contracts/` 生成两端数据传输对象（DTO） |
| 网页 | 前端构建输出到后端 `web-dist/`；正式验收使用隔离构建并由 Buildr HTTP 托管 |
| 文件型资产 | `resources/workspace/`、`resources/runtime/` 及 `resources/manifest.yml` 定义交付来源和映射 |
| 测试库 | `tools/testing/test-context-build.ts` 生成 `build/test-context/` |
| 安装包 | `tools/release/application-payload.ts` 构建运行闭包，包清单和资源清单限制 npm 文件集合 |

`build/` 与 `web-dist/` 是被 Git 忽略的生成结果；`package/` 已无职责。`tools/build/launcher/` 构建开发启动器（Launcher），正式安装行为归 `installation/`。工程工具位于 `tools/`，Buildr 自测选择与执行位于 `test/verification/`，不成为用户项目的执行引擎。

`buildr package check` 是开发维护命令，需要检出目录里的 `tools/verification/package-check.ts`；它不是安装包用户的健康检查入口。用户命令使用安装包运行闭包，诊断使用 Doctor。

类型检查、前端构建、逻辑测试、浏览器交互、安装与跨平台检查分别证明不同边界。日常采用与改动匹配的检查；正式发布还要核对冻结源码、完整候选（Candidate）和唯一压缩包。入口与限制见[Buildr 产品验证](verification-framework.md)，发布操作见[发布流程](../flows/open-source-release.md)。
