# 技能如何成为可用的工作方法

Buildr 把可复用的工作方法保存在技能（Skill）中，再为不同智能体（Agent）生成可发现的入口。维护者修改源文件；使用者从自己的工具中调用。源文件、派生入口和本次执行结果分别核对，不能用“文件生成成功”代替“工具已加载”或“工作已完成”。

## 从源文件到智能体（Agent）入口

普通技能（Skill）的源位于工作空间（Workspace）的 `skills/`，由 `skills/manifest.yml` 登记。内置方法、本地方法和随组件（Component）安装的外部方法都走同一条路径；只有产品入口 `buildr` 直接来自安装包。

![技能源文件如何成为可发现入口](../../archify/flows/skill-projection.html)

主线是：源文件与附件 → 组合内容增强和局部依赖 → 生成工具入口并保存归属回执 → 智能体（Agent）按需发现。[单独打开投射图](../../archify/flows/skill-projection.html)可查看各节点依据。

生成过程保持源文件独立：`SKILL.md` 可以组合增强内容，`references/`、`scripts/`、`assets/` 等附件按原始字节和可执行状态投射。各适配器（Adapter）共享组合逻辑，只改变目标根、诊断身份和启用信息。项目（Project）的 `capabilities.yml` 保存适用性、需求和选择，不另外保存技能（Skill）副本。

因此，调整工作方法应修改源目录，再通过同步生成目标入口。直接修改 `.agents/skills` 等派生目录，不能成为可持续维护的办法。完整实现见[技能投射代码地图](../../code-map/skill-projection.md)；需要逐节点查看时，可打开[投射关系图](../../archify/flows/skill-projection.html)。

## 两种组合方式，解决不同问题

**内容增强**用于补充一段说明。例如给外部 OpenSpec 方法补充 Buildr 的协作边界。组件（Component）通过 `skillFragments` 选择前置、后置或指定插槽（`prepend`、`append`、`slot`）；增强只进入派生正文，不改写外部源文件。

**能力依赖**用于表达另一项方法必须提供的稳定保证。例如一次 Git 操作需要确定对象、授权范围和结果证据。调用方（Consumer）声明 `requires`，能力契约（Capability Contract）说明最低保证，绑定（Binding）选择提供者（Provider）。它允许组织替换工作方式，同时保留协作边界。

提供者（Provider）的全文不会复制进调用方（Consumer）；智能体（Agent）在执行相关动作前读取契约和已选方法。仅在正文提到另一种方法、或一次工作读了多份说明，不构成依赖。

| 要改变什么 | 维护位置 |
| --- | --- |
| 一份方法自己的步骤或例子 | 对应源目录，不必新建契约（Contract） |
| 为另一份方法补充局部说明 | 组件（Component）的内容增强 |
| 替换协作方法，同时保持输入、副作用和结果保证 | 能力契约（Capability Contract）、提供者声明及绑定（Binding） |
| 确定一个项目（Project）采用哪些方法 | `capabilities.yml` |

声明格式、解析顺序和替换入口见[能力契约参考](../../../services/buildr/docs/skill-capability-contracts.md)。

以知识维护为例，`current-knowledge-maintenance` 的正文和 `references/` 一起维护、交付。OpenSpec 组件（Component）为相关调用方（Consumer）提供协作说明并声明知识维护依赖；生成入口时，只向调用方（Consumer）加入它需要的局部绑定，具体方法仍从已选提供者（Provider）的完整文件读取。这样可以分别更新知识维护方法与 OpenSpec 协作说明，也能在保留契约保证的前提下替换方法，不必在每个调用方（Consumer）中复制正文。来源见[组件声明](../../../services/buildr/resources/workspace/components/buildr/openspec/component.yml)与[知识维护技能（Skill）](../../../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/SKILL.md)。

## 执行说明与诊断证据分开放

派生的 `SKILL.md` 需要让智能体（Agent）和人都能直接阅读，因此只包含源正文、适用增强、当前依赖的状态、契约路径、已选提供者（Provider）的入口，以及必要的停止说明。完整关系图、摘要、文件清单和来源证据放在诊断及投射回执（Projection Receipt）中，不塞进每一份方法正文。

| 当前依赖状态 | 本次怎样继续 |
| --- | --- |
| 没有声明依赖 | 按当前方法执行 |
| `ready` | 结构可路由；读取已选方法，核对实际对象和授权后执行 |
| `degraded` | 可选增强缺失；按正文规定的基础路径继续，说明缺口 |
| `blocked` | 暂停依赖该能力的动作，诊断原因；其他安全工作继续 |

这些状态只说明能否使用一项能力，不证明工作结果。产品入口 `buildr` 也遵守这一边界：只有 Buildr 管理意图命中时才加载，不在所有用户输入之前运行，也不替其他专业方法统一分发。

需要排查完整能力关系时，诊断命令返回契约、绑定、调用方（Consumer）、候选与已选提供者（Provider）、原因和后续动作：

```bash
buildr doctor --agent <agent> --target <workspace> --json --detail full
```

`<agent>` 应来自实际宿主身份或用户指定的维护目标。路径、生成标记和回执不能证明当前使用了哪个宿主。

## 回执保留“哪些文件由谁管理”

工作空间（Workspace）和用户层的投射回执（Projection Receipt）分别位于：

```text
<workspace>/.buildr/agent-runtime/workspace/<adapter>/skill-projection-ownership-receipts/
<home>/.buildr/agent-runtime/user/<adapter>/skill-projection-ownership-receipts/
```

回执保存来源、渲染摘要、受管文件清单、完整性与可执行状态；有依赖时，还保存契约摘要、来源依据（Provenance）和绑定快照。它属于本机控制数据，不是源方法，也不放进派生技能（Skill）目录。

这份所有权记录用于避免误删别人的文件。标准共享根 `.agents/skills` 的所有权统一记为 `agents-standard`，目录相同不等于当前适配器（Adapter）拥有它。已退役品牌（`cursor`、`qoder`、`trae`、`trae-work`、`workbuddy`）不再有专用技能根；它们遗留的厂商规则桥、厂商技能镜像与回执由退役处理按所有权证明清理，可证明属于 Buildr 的删除，无法证明的保留并报告。

派生正文可以依据当前源重新生成，旧所有权却不能仅凭内容相似重建。遇到冲突应保留现场，核对实际归属；投射成功后仍应分别确认工具能发现入口、当前会话已采用方法，以及实际目标是否完成。

本文依据[投射规范](../../../openspec/specs/workspace-first-runtime-projection/spec.md)、[资源规范](../../../openspec/specs/buildr-package-assets/spec.md)和代码地图列出的实现；适配器（Adapter）的全部平台分支不在本章展开。
