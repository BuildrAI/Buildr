# 开始使用 Buildr

[阅读目录](../README.md) · [日常使用](usage.md)

**智能体（Agent）安装并引导，用户在网页中配置，再打开工作空间（Workspace）开始工作。** 不需要先学习命令或完整操作手册。

## 安装与引导

把项目链接交给正在使用的智能体（Agent）：

> 请参考 https://github.com/BuildrAI/Buildr 帮我安装 Buildr 和 Buildr Web 启动器。安装后，向我解释工作空间、项目、服务和代码库，然后打开 Buildr Web，引导我完成配置。需要准备目录或代码时，请协助处理。

智能体（Agent）核对环境与当前发布版本，安装官方包 `@buildr-ai/buildr`，并检查 Buildr Web 能否打开。macOS 和 Windows 可安装 Buildr Web 启动器（Launcher），其他平台通过本机网页使用。具体命令供智能体（Agent）查阅[安装参考](../../../services/buildr/docs/cli-reference.md#首次使用)，接入范围见[适配参考](../../../services/buildr/docs/agent-runtime-adapters.md)。

## 理解关系，在网页中配置

智能体（Agent）结合你的工作解释四个概念：

| 名称 | 回答什么 | 例子 |
| --- | --- | --- |
| 工作空间（Workspace） | 这组工作共用哪些资料和方法？ | 团队的工作目录 |
| 项目（Project） | 我们要实现什么业务目标？ | 订单管理系统 |
| 服务（Service） | 哪一部分负责实现？ | 订单后端、管理前端 |
| 代码库（Repository） | 这部分代码实际在哪里？ | 已有的前后端代码目录 |

智能体（Agent）打开 Buildr Web，引导你配置工作空间（Workspace）信息、建立项目（Project），按需关联服务（Service）和代码库（Repository）；不涉及代码时，可以只准备项目（Project）及资料。已有内容尽量复用，需要准备目录或代码时由智能体（Agent）协助，关系不清时由它解释。

一个服务（Service）可以被多个项目（Project）引用；代码库实例（Repository Instance）记录本机的实际代码位置。登记关联不会自动移动或克隆代码，代码准备由智能体（Agent）处理。更详细的关系见[工作如何组织](../architecture/project-service-repositories.md)。

也可以在理解概念后继续通过对话配置，例如：

> 我在开发订单管理系统，需求资料在……，后端代码在……，前端代码在……。请帮我建立项目并关联已有代码，保留原目录和已有内容。

## 打开工作空间（Workspace），开始工作

配置完成后，在智能体（Agent）工具中打开对应的工作空间（Workspace）目录，直接提出目标：

> 为订单列表增加按状态筛选，沿用现有界面和测试方式。完成后说明改动与验证结果，并更新相关资料。

智能体（Agent）读取当前资料和方法，按目标实施并验证。你参与业务取舍，通过 Buildr Web 查看资料、进展和成果；完成后说“收尾”，继续已授权的交付与整理。网页与对话共享工作依据，不需要用户在两处重复登记。

具体执行仍在智能体（Agent）工具中。若需要准备目录、代码或刷新工具以发现新安装的技能（Skill），由智能体（Agent）处理并说明最少必要动作。

## 更新与接续

在对应工作空间（Workspace）中告诉智能体（Agent）：

> 更新 Buildr 和工作空间，检查 Buildr Web 能正常打开。更新完成后，再收尾。

更新 Buildr 包括包内的 Buildr Web；已有启动器（Launcher）的绑定随同核对。更新工作空间（Workspace）同步其中的工作资产和当前智能体（Agent）入口。用户不需要再单独请求更新网页；智能体（Agent）分别核对产品更新和工作空间（Workspace）同步的实际结果。

日常工作见[日常使用](usage.md)；更新前的资料保护见[数据保全](data-and-upgrades.md)；安装或显示异常见[排查问题](troubleshooting.md)。
