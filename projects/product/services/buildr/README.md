# Buildr

中文 | [English](https://github.com/BuildrAI/Buildr/blob/main/README.en.md)

## 让已有积累参与下一次工作

Buildr 把项目资料、代码位置和经过验证的工作方法组织在一起。人可以查看、维护这些内容并参与判断，智能体（Agent）据此理解目标、选择方法并推进工作。

你可以用它减少重复解释项目背景，沿业务与代码的关系查找依据，在另一段对话或另一种智能体（Agent）工具中接续工作，也可以把做成事情的方法保存为可复用的技能（Skill）。个人或企业掌握长期源资产，代码、文件和外部系统继续承载真实成果。

## 开始第一项工作

把这份说明交给正在使用的智能体（Agent），告诉它：

> 帮我开始使用 Buildr：检查本机安装和 npm 官方仓库中的可用版本，说明正式版与候选版的区别并按我的选择安装；确认或创建目标工作空间，用普通语言引导我组织项目和已有代码，完成必要检查后继续我想推进的工作。

智能体（Agent）负责检查 Node.js、安装命令行工具（CLI）、确认目录、初始化和读取最终诊断。已经给出目标和目录时可直接继续；准备成功后，你应能说明要做什么，并在 Buildr Web 中看到相应工作范围。

也可以通过 Buildr Web 登记已有工作空间（Workspace），查看资料、进展、相关代码和需要判断的事项，再把具体目标交给智能体（Agent）。页面保存的答复不会自动启动智能体（Agent）；继续工作时仍需让它读取当前事实。

### 工作范围怎样组织

| 对象 | 说明 |
|---|---|
| 工作空间（Workspace） | 人与智能体（Agent）共同工作和发现资料的范围 |
| 项目（Project） | 一项业务、产品、系统或长期工作，保存目标与业务事实 |
| 服务（Service） | 承担实现职责，可以被多个项目（Project）引用 |
| 代码库实例（Repository Instance） | 实际使用哪份代码及其来源，一个实例可以承载多个服务（Service） |

没有代码也可以开展项目（Project）范围的工作。目录嵌套不决定业务归属，登记代码来源也不代表代码已经克隆或环境已经可用。

## 安装与维护入口

产品通过 npm 分发，包名是 `@buildr-ai/buildr`。运行它的 Node.js 必须满足 `>=24.15.0 <25`；安装包不会自动下载另一套 Node.js。工作空间（Workspace）中按需声明的受管 Node.js 只供该范围拥有的子进程使用，不能替代产品安装所需的 Node.js。

正式版轨道（Stable Track）使用 npm 的 `latest` 标签，候选版轨道（Candidate Track）使用 `next` 标签。先查询实际版本及其 `engines`，再安装选定版本；文档标题和源码中的版本号不证明该版本已经发布。如果 `latest` 仍指向预发布版本，它不能作为正式版已发布的证据。

- [安装与初始化](docs/cli-reference.md#首次使用)：查询渠道、安装、确认目录、初始化与打开页面。
- [命令参考](docs/cli-reference.md)：维护工作范围、长期资产、任务（Task）与诊断。
- [运行时适配参考](docs/agent-runtime-adapters.md)：当前支持的工具、发现入口及刷新要求。
- [恢复指南](docs/bootstrap-guide.md)：技能（Skill）不可用时也可运行 `buildr bootstrap guide`。

macOS 与 Windows 可按需安装 Buildr Web 启动器（Launcher）；它依赖同一 npm 安装和兼容的 Node.js。其他平台通过 `buildr web --target "<dir>"` 打开本机页面。

## 当前能力与边界

Buildr 管理长期事实、方法、来源和关系，为人提供阅读与受控维护入口，为智能体（Agent）提供可组合的技能（Skill）和命令行工具（CLI）。当前支持 `claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy`；投射成功仍需结合各工具的刷新与加载条件使用。

任务（Task）保存目标、状态和当前工作摘要（Work Context）；审查（Review）与验证（Verification）分别保存实际结论和依据。Buildr Web 按“任务需求、方案设计、开发实现、任务收尾”组织相关内容，帮助人查看成果并参与判断。记录完成不替代代码交付、测试执行或外部系统中的真实结果。

当前以本机使用为主：长期源资产可以通过文件与 Git 协作，任务（Task）等结构化记录、每日演进和复盘正文不自动跨机器同步。完整企业权限、远程多人协作、云服务和独立对话执行入口尚不属于当前承诺。

深入了解见[产品说明](../../knowledge/docs/overview.md)、[当前能力与边界](../../knowledge/docs/overview.md)和[已知限制](docs/known-limitations.md)。这些文档以唯一源码维护；正式安装包中的说明链接由构建过程固定到对应发布源码。
