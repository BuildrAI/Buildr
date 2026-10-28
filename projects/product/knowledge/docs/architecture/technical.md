# Buildr 怎样实现

本文帮助开发者判断改动属于哪里、会影响哪些事实，以及需要分别验证什么。Buildr 由四个服务（Service）协作：`services/buildr` 负责命令、业务能力、文件与 SQLite、本机网页宿主（Host）和 Buildr npm 分发；`services/buildr-web` 负责 React 页面与交互；`services/buildr-agent` 负责独立配置、统一对话与原生执行接入，以私有包提供独立执行进程（Agent Process）及公共客户端（Client），随主包统一发行；`services/dsh-plugin` 独立构建、验证和发布 DSH 桌面插件。四者共用一个 Git 代码库（Repository），保持明确源码与构建边界，沿用同一[产品术语表](../glossary.md)。

整体组成见[系统全景图](../../archify/system/buildr-system-overview.html)，下面按调用与写入职责展开。

## 一次操作怎样到达真实数据

![调用、数据与副作用责任](../../archify/flows/capability-data-responsibility.html)

一次写入从命令行接口（CLI）或网页进入所属应用用例。入口解析输入、展示结果；应用核对对象身份、已观察版本与业务条件；数据访问层（Persistence）读写所属文件或 SQLite。网页和命令入口使用同一应用，不各自保存一份任务状态或业务规则。诊断读取当前结果，不取得业务写入权。

开发入口 `projects/product/buildr` 委托服务（Service）的薄入口；正式 npm 命令进入同一产品。开发检出不能覆盖 PATH 上的正式 `buildr`。网页由功能客户端发起请求，本机宿主处理会话（Session）、静态文件及分发，业务协议仍由所属模块维护。

请求分发前，主机（Host）必须与本机服务实际监听的地址和端口一致；页面、静态文件和业务读取共用该边界。写入另外校验来源与会话（Session），不能用一项校验代替其他保护。入口及模块定位见[服务与工程地图](../../code-map/system-services-assets.md)。

## 职责怎样划分

后端启动装配、业务模块、本机网页宿主和通用技术机制各有边界。接口进入应用，再到领域判断或数据访问；领域层（Domain）不依赖上层或输入输出，应用层（Application）不解析终端参数，也不直接导入其他模块内部文件。模块只在存在真实职责时建立相应层次。

模块装配核对依赖顺序和提供者唯一性，以具名能力协作；确实需要延后连接时使用一次性绑定器（Binder），不恢复一个随处可写的全局业务对象。具体模块、连接点和一例完整调用见[模块内部地图](../../code-map/technical-layers.md)，本章不重复成员清单。

登记、资产同步、任务记录与个人偏好各有写入者。资产同步可以组合登记维护，却不取得登记的第二写入权；工作台（Workbench）聚合已有事实，也不因此拥有它们。用户项目测试声明用于发现与选择检查，不是 Buildr 的通用测试执行引擎。数据归属和本机状态见[数据设计](buildr-data-design.md)。

前端按功能维护页面、业务请求和完整交互，应用壳只组合导航及真正跨页共享的状态。缓存页面、筛选或草稿不表示数据一直最新；编辑前仍需核对当前事实，保存时比较已观察版本。工作摘要（Work Context）中的答复不自动启动智能体（Agent），界面原型（UI Prototype）不能继承正式页面的写入能力。具体状态与隔离边界见[前端技术层](../../code-map/technical-layers.md#前端技术层)。

内部对话由 `buildr-agent` 的独立执行进程（Agent Process）维护，Buildr 的 `agent-service` 模块只装配宿主能力（Host Capabilities）及网页 HTTP/事件映射，通过公共客户端（Client）连接后台；普通退出只释放连接。账号、对话和原生上下文绑定保存在本机运行配置（Profile）的私有交互库，原生凭据留各家独立配置；任务状态和文件成果不转移到此库。Codex 应用服务（App Server）、DSH 完整本机网页宿主（Web Host）、Qoder 软件开发工具包（SDK）与命令行（CLI）各自执行和恢复。同一对话保存统一可见历史，各参与者分别恢复自己的原生上下文；未知执行不自动重发。前端全局对话功能可停靠右侧或一级导航最左侧，原有中右工作屏继续独立展开与折叠。职责和恢复边界见[智能体接入](agent-integration.md)。

提交说明由 `code` 准备有界材料和生成请求，调用 `buildr-agent` 的统一模型（Model）能力。账号与模型来源显式固定，不提供工具、不创建持久对话；业务和界面分别校验来源及草稿版本，提交与推送继续直接调用 Git。

外部桌面会话（Session）关联和旧生成后台已退役。内部对话继续可选关联任务（Task），不成为任务状态或成果权威；详见[智能体（Agent）接入架构](agent-integration.md)。

外部系统接入由 `connection-skills` 管理准确绑定的实例、团队配置与本机个人认证，页面与命令使用同一应用。专业技能（Skill）维护各系统的对象定位、操作与结果判断；MySQL 查询由独立模块承接。通用执行负责交接当前实例和私有认证，专业程序负责真实系统的授权及校验。对象分工与核心边界集中在[外部系统连接](external-connections.md)，实现位置见[连接代码地图](../../code-map/technical-layers.md#外部系统接入)。

## 写入保护和失败边界

| 对象 | 当前保护 | 不能据此推断什么 |
| --- | --- | --- |
| 任务记录与关系 | 同一 SQLite 事务（Transaction），写入比较记录摘要 | 数据库提交不证明 Git 或外部系统已经交付 |
| 多个受管源文件 | 管理锁、操作记录、修改前镜像和恢复 | 不是跨进程、数据库和外部系统的全局事务（Transaction） |
| 内部对话与执行 | 对话及配置比较已观察版本；发送记录独立请求身份，控制绑定参与者、执行与宿主代次 | 断线不证明未受理，模型中断不证明全部命令停止；恢复不能重发或复用旧授权 |
| 智能体（Agent）派生入口 | 文件清单、完整性和所有权回执（Ownership Receipt），冲突显式处理 | 内容相似不赋予覆盖或删除权限 |
| OpenSpec 主规范 | 锁定上游生成、校验并写入，Buildr 回读并保留恢复依据 | 不承诺整个上游归档为原子写入 |
| 本机实例与启动器（Launcher） | 产品身份、运行配置（Profile）及进程归属 | 名字或端口相同不证明属于当前安装；同身份重启也先核对接管观察摘要再请求旧实例认证退出 |

文件访问核对真实路径和作用范围，恢复前重新观察当前对象。局部失败只影响依赖它的动作；已经从 Git、文件或实际系统核实的交付，不因内部登记失败而被否定。数据位置与恢复条件集中在[数据设计](buildr-data-design.md)。

## 一次构建怎样成为同一份产品

后端协议定义生成两端数据传输对象（DTO）；前端源码构建为后端托管的 `web-dist/`；文件资源按清单选入运行负载。正式安装消费打包后的运行文件、网页和资源，不要求完整源码树或 Vite 开发服务器。更新 Buildr 因而包含网页，但正在运行的旧实例和工作空间（Workspace）采用结果仍需分别确认。

源码准备先在 `services/buildr-agent/` 使用 `../buildr/tools/development/run-development-npm ci --ignore-scripts`，再运行同一入口的 `run build`，然后在 `services/buildr/` 使用 `tools/development/run-development-npm ci --install-links`。主包准备将编译后的公开入口及锁定运行依赖物化到自己的 `node_modules/@buildr-ai/buildr-agent/`，正式负载按该公开包复制，不回退读取相邻源码。对应入口与声明见[构建地图](../../code-map/system-services-assets.md#构建与消费)及[准备声明](../../../preparation.yml)。

工程工具属于 `tools/`，普通生成结果属于被 Git 忽略的 `build/` 和 `web-dist/`。正式用户命令不加载开发工具；`buildr package check` 需要开发检出，不能作为安装后健康检查。测试库、协议生成与打包来源见[构建与消费地图](../../code-map/system-services-assets.md#构建与消费)，资源边界见[命令架构](../../../services/buildr/docs/cli-architecture.md#文件型交付资源)。

开发环境由[准备声明](../../../preparation.yml)、[Node.js 版本](../../../.node-version)和对应服务（Service）的包清单确定。类型检查、逻辑测试、真实页面交互、安装包消费和目标平台证据分别证明不同边界；构建通过不能替代其他验收。日常按改动选择已有检查，正式发布另行固定源码、完整候选（Candidate）和唯一产物，见[产品验证](verification-framework.md)与[发布流程](../flows/open-source-release.md)。

执行后台（Execution Backend）另以内容摘要保留编译包、完整依赖和 Node.js；主程序版本与后台实际版本分别观察。空闲切换不覆盖活动文件，预览和离线维护共用后台持有边界，详见[进程连接与切换](agent-integration.md#主程序与执行后台怎样连接)。
