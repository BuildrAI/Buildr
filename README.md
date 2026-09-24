# Buildr

中文 | [English](README.en.md)

## 人、企业与智能体（Agent）共同工作的基础设施

Buildr 把项目资料、代码位置和经过验证的工作方法组织在一起。人可以查看、维护这些内容并参与判断，智能体（Agent）据此理解目标、选择方法并推进工作。

你向智能体（Agent）提出目标，在 Buildr Web 中查看资料、进展和成果。积累下来的事实和方法由个人或企业掌握，可以跨任务、跨智能体（Agent）复用，减少重复解释背景和从头摸索的成本。

## 可以怎样用

- **从想法推进到交付。** 在同一个智能体（Agent）对话中梳理需求、形成方案，再推进实现、验证和交付。Buildr 组织各阶段可用的资料与方法，你参与关键判断并给予必要授权。
- **让不同岗位基于同一份资料协作。** 产品人员维护需求和业务规则，设计、开发和测试人员通过各自的智能体（Agent）查找相关资料与代码。发现问题后修正对应资料，后续工作从更新后的依据继续。
- **把做成事情的方法留下来。** 将经过验证的发布步骤、测试经验或业务处理方式整理成技能（Skill），连同相关资料持续维护。后续的任务和参与者可以复用这些方法，更换智能体（Agent）时也能保留已有积累。

## 快速开始

把这份 README 交给智能体（Agent），让它帮你完成安装和准备。下面的示例可以直接发给它。参与 Buildr 自身开发，见下方[自举说明](#buildr-自举self-bootstrapping开发者与协作者)。

### 1. 安装 Buildr

告诉智能体（Agent）：

> 参考 https://github.com/BuildrAI/Buildr，帮我安装 Buildr。

智能体（Agent）按[安装与初始化说明](projects/product/services/buildr/docs/cli-reference.md#首次使用)完成安装和验证。在 macOS 或 Windows 上，也可以让它安装 Buildr Web 启动器（Launcher）。

### 2. 初始化工作空间（Workspace）

工作空间（Workspace）是你和智能体（Agent）共同使用的工作目录。安装后，告诉智能体（Agent）你希望使用哪个目录；也可以先在使用智能体（Agent）的应用中打开目标目录，再说：

> 初始化 Buildr 工作空间。

有些应用把打开目录称为“打开项目”。这里选择的是本地目录，Buildr 中的项目（Project）则用于组织某项业务或长期工作。

通常，将共同维护、由同一方管理的工作内容放在一个工作空间（Workspace）中。个人或小企业可以先从一个开始；较大的企业再按业务单元或事业部划分。

### 3. 直接开始工作

初始化完成后，直接告诉智能体（Agent）你的目标，例如：

> 把这个需求梳理成方案，结合已有资料完成实现和验证，准备交付。

智能体（Agent）会根据目标创建或选择项目（Project）；涉及代码、应用或模块时，再关联相应的服务（Service）和代码库。你也可以在 Buildr Web 中查看资料与进展，维护这些对象及其关联。

工作完成后，说“收尾”，由智能体（Agent）完成已授权的交付和整理。

### 以后需要更新时

在目标工作空间（Workspace）的对话中，告诉智能体（Agent）：

> 更新 Buildr 和工作空间。

当前版本主要在本机运行。工作资产（Work Asset）以文件保存，可通过 Git 协作；任务（Task）等过程记录保存在本机数据库，不会自动跨机器同步。完整能力与适用范围见[当前能力与边界](projects/product/knowledge/docs/capabilities.md)。

## 为什么需要 Buildr

企业拥有文档、代码、数据和软件，但把它们用于具体工作，仍需要人去寻找、理解和串联。关键做法常留在个人经验里；即使写成文档，后来的人也需要重新理解和尝试。

**拥有生产资料，不等于拥有持续运用这些资料的能力。** 对个人也一样：背景散落在代码仓、文档和对话中，换一次任务或智能体（Agent），就可能需要重新整理和解释。

智能体（Agent）能够处理复杂信息、辅助思考和执行工作，Buildr 则组织它开展工作所需的资料、方法和使用入口。人和智能体（Agent）可以在已有积累上继续工作，也可以把实践中得到的新认识和方法补充进来，让下一次工作有更好的起点。

## 使命与愿景

**使命：** 组织分散的工作资料与专业方法，让人和智能体（Agent）基于共同的依据协作，把工作做好。

**愿景：** 让个人借助智能体（Agent）拓展能力，让企业把积累转化为能够传承、不断成长的组织能力。

## 三方如何共同工作

| 参与者 | 负责什么 | Buildr 提供的支持 |
|------|----------------|------------------|
| 人 | 提出目标与想法，参与讨论，作出决定、给予授权并验收成果 | 查看资料、进展与成果，参与维护和判断 |
| 企业 | 组织工作并承担责任，维护属于企业的长期资产 | 持续维护资料、经验和方法，供成员与智能体（Agent）发现和复用 |
| 智能体（Agent） | 理解目标、查找依据、选择方法，执行工作并交付成果 | 可发现、可核对的资料与方法，以及可用的工具和明确的授权边界 |

三方使用的是同一套工作资料与方法：企业持续维护它们，人参与完善和判断，智能体（Agent）根据当前目标选择相关内容开展工作。

工作中经过确认、值得复用的内容，可以继续维护为工作资产（Work Asset）。个人可以从自己的项目和方法开始，企业则在日常协作中积累和完善这些资产。

## Buildr 自举（Self-Bootstrapping）：开发者与协作者

**Buildr 也用自身来组织开发工作。** 本仓库就是它的开发工作空间（Workspace），保存产品设计、研发方法和代码。普通用户按前面的安装步骤开始使用即可。

参与开发时，获取本仓库，在使用智能体（Agent）的应用中打开仓库根目录，告诉它：

> 我想参与 Buildr 开发，请阅读仓库规则和产品开发说明，准备当前源码的开发环境。

这是已有的工作空间（Workspace），不要当作空目录重新初始化。产品治理事实位于 `projects/product/`，可执行实现位于 `projects/product/services/buildr/`，Buildr Web 前端位于 `projects/product/services/buildr-web/`。

开发使用仓库内的 `projects/product/buildr`，不依赖或替换本机全局安装的 `buildr`；依赖、构建和测试命令从相应服务（Service）目录执行。具体位置见[产品开发入口](projects/product/README.md)，开始修改前阅读[贡献指南](CONTRIBUTING.md)。

## 深入阅读

| 你想了解什么 | 阅读入口 |
|--------------|----------|
| 了解产品 | [产品说明](projects/product/knowledge/docs/overview.md)：协作关系、详细场景与工作组织；[当前能力与边界](projects/product/knowledge/docs/capabilities.md)：已经能做什么；[产品方向](projects/product/docs/roadmap/product-directions.md)：下一步往哪里走 |
| 开始使用 | [日常使用手册](projects/product/knowledge/docs/guides/usage.md)：表达目标、参与判断和接续工作；[命令与适配参考](projects/product/services/buildr/docs/cli-reference.md)：手动操作及深入使用入口 |
| 参与开发 | [产品开发入口](projects/product/README.md)：源码与开发位置；[当前知识](projects/product/knowledge/README.md)：架构、代码地图与技术图；[贡献指南](CONTRIBUTING.md)：参与约定 |

[安全报告](SECURITY.md) · [MIT License](LICENSE) · [GitHub Issues](https://github.com/BuildrAI/Buildr/issues)
