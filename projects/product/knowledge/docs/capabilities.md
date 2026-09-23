# Buildr 当前能力与边界

本页说明已经交付的能力、适用范围及深入阅读入口，不把长期愿景视为当前功能。三方协作与工作组织方式见[产品说明](overview.md)，未来方向见[产品方向汇总](../../docs/roadmap/product-directions.md)；职责边界依据[产品定位规范](../../openspec/specs/agent-first-product-positioning/spec.md)，具体行为见各专题引用的规范与当前实现，单次工作是否完成仍需实际验证。

## 当前能力入口

### 工作范围与资产管理

- 登记工作空间（Workspace）、项目（Project）、服务（Service）和代码库实例（Repository Instance），连接业务目标、实现职责与真实代码位置。服务（Service）可以被多个项目（Project）引用，代码库实例（Repository Instance）也可以承载多个服务（Service），不是固定的目录树归属。详细关系见[项目、服务与代码库如何协作](architecture/project-service-repositories.md)。
- 管理规则（Rule）、技能（Skill）、命令（Command）和组件（Component）等长期资产，提供来源与范围管理、适配、内容保全、冲突检查和诊断。工作空间（Workspace）内只有被明确组织、登记或纳入治理的长期事实与方法才属于工作资产（Work Asset），不是所有文件都自动受管。
- 技能（Skill）在工作空间（Workspace）中维护，可投射到用户层或当前工作空间（Workspace）层；命令（Command）声明和检查外部工具，不替代安装、登录或专业执行。具体机制见[Buildr 技能体系](architecture/buildr-skill-system.md)与[命令参考](../../services/buildr/docs/cli-reference.md)。

### 不同智能体工具的适配

当前支持 7 种智能体运行时适配器（Agent Runtime Adapter）：`claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work`、`workbuddy`。

适配负责将受管规则（Rule）、技能（Skill）等内容组织到目标工具需要的发现入口，不把全部项目资料复制进去，也不保证目标工具已经在当前版本或对话中加载了这些内容。各工具的安装、加载条件与限制见[运行时适配说明](../../services/buildr/docs/agent-runtime-adapters.md)。

### 任务协作与可接续结果

- 保存任务（Task）的目标、范围、关系与状态，通过工作摘要（Work Context）保留当前进展、下一步和需要人处理的事项，支持后续参与者重读当前事实后继续工作。
- 审查（Review）与验证（Verification）结果分别保存结论、依据与未覆盖项；验证（Verification）报告关联实际检查过的内容，内容变化后需重新判断结果是否适用。
- 根据真实目标选择独立工作树（Worktree）、OpenSpec、专业检查、交付与复盘等能力，不把所有工作强制装进同一套固定步骤。OpenSpec 管理提案、设计、任务清单、规范（Specification）及变更材料；智能体（Agent）负责理解、选择方法和执行，Buildr 保存必要事实并保护具体动作。

任务（Task）记录不代替代码、文件或外部系统中的真实成果，也不证明工作已经交付。各应用（Application）只维护自身必要事实与动作安全；继续工作前，智能体（Agent）需要重新核对实际来源。详细过程见[从需求讨论到任务收尾](architecture/task-system.md)、[任务收尾](flows/task-closeout.md)与[父任务协调](flows/task-parent-coordination.md)。

### Buildr Web 与知识阅读

Buildr Web 在本机浏览器中提供工作范围、项目（Project）、服务（Service）、知识文档、技术图、任务（Task）及相关成果的组织和查看入口，让人通过结构化、可视化的内容参与维护和判断。相关页面与命令行接口（CLI）使用同一组产品能力，不各自维护一套业务事实。

任务（Task）详情按需读取工作摘要（Work Context）、审查（Review）与验证（Verification）结果；页面不代替执行测试，不自行写入专业报告，也不提供独立的智能体（Agent）执行或对话管理。知识阅读使用当前成果正文，不要求将外部真实成果全部搬进 Buildr。阅读与维护方式见[当前知识入口](../README.md)和[日常使用手册](guides/usage.md)。

### 测试指导与项目每日演进

- `project-testing` 指导智能体（Agent）按真实技术栈建设测试；`verification.yml` 保存已有测试体系的地图，智能体（Agent）直接调用项目工具执行检查，Buildr 维护有意义的验证（Verification）报告，而不是统一的测试执行平台。通用方法见[测试建设与使用](architecture/workspace-testing-and-verification-framework.md)，Buildr 自身的检查体系见[产品验证框架](architecture/verification-framework.md)。
- 项目每日演进基于明确范围内的 Git 提交，回答新增、更新、删除与弊端，记录来源、观察范围及未覆盖部分。自己的提交可以关联本机任务（Task），其他人的提交也保留展示；读取页面不会重新生成摘要，也不内置定时执行。它是独立的本机工作摘要，不等于当前知识、验证（Verification）或跨机器共享数据，见[项目每日演进](flows/project-daily-progress.md)。

### 安装与发布

产品通过 npm 分发。Buildr Web 的平台启动入口由用户在本机显式安装，依赖同一 npm 安装与兼容的 Node.js，不是独立桌面应用或另一套产品安装渠道。

Buildr 自身的发布流程使用明确源码、候选制品、Git 与目标平台的实际结果确认发布；任务（Task）完成记录不能替代发布事实。详细步骤与恢复边界见[发布流程](flows/open-source-release.md)，未来能力不能从历史发布方案中推断。

## 当前使用边界

- **本机使用与共享分开。** 长期源资产通过文件与 Git 协作；任务（Task）等结构化记录保存在对应工作空间（Workspace）的本机 SQLite 中，不自动跨机器同步，也不是可复制的组织协作数据库。项目每日演进与复盘正文同样属于本机资料。
- **企业目标不等于企业平台已经完整交付。** 完整企业权限、云服务、远程多用户协作与跨机器自动恢复不属于当前完整承诺。
- **工作依据需要持续核对。** 工具适配成功不代表资料完整或智能体（Agent）必然正确使用；结果仍受来源质量、目标工具、环境、权限和实际检查影响。
- **后续接入与已有能力分开。** 通用工作环境（Work Environment）与工作流（Workflow）的进一步抽象，以及更广泛的产研系统接入，见[产品方向汇总](../../docs/roadmap/product-directions.md)。

更具体的工具差异、安装条件和产品限制见[已知限制](../../services/buildr/docs/known-limitations.md)，本机数据归属见[本机数据与恢复边界](architecture/buildr-local-data.md)。

## 按问题深入

- 理解概念：[术语表](glossary.md)与[产品架构](architecture/product.md)。
- 定位实现：[架构入口](architecture/index.md)、[技术架构](architecture/technical.md)与[全项目代码地图](../code-map/README.md)。
- 查看关系：[技术图](../archify/index.md)。
- 了解服务职责：[Buildr Service](services/buildr.md)与[Buildr Web Frontend Service](services/buildr-web.md)。
- 跟进变更：[OpenSpec 变更生命周期](flows/openspec-change-lifecycle.md)。

旧 `task-boards/` 与 `task-cockpits/` 仅作为历史材料保留，不再新建或维护，也不替代当前任务（Task）、专业结果、知识说明、规范（Specification）及实际成果。
