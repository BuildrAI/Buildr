# Buildr Core

Buildr workspace 的基础模型、术语和硬边界。每次进入 workspace 都必须先读取当前 scope 的 `AGENTS.md`，再读取本文件。

## 基本原则

- Rule 控制 Agent 的价值观、边界和约束；Skill 封装可复用的专业动作和操作流程。
- Rule 和 Skill 不以“是否必须加载”作为本质区分；Rule description 是 Agent 判断规则语义相关性的索引，不是路径、角色或服务路由表。
- Rule 不承担场景化操作流程；任务触发型流程应优先沉淀为 Skill。
- Agent runtime adapter 只负责按目录层级发现和投射 Rule 源，不使用预设 role/path 替 Agent 判断规则与当前任务的语义相关性。
- 当前目录适用的 `AGENTS.md` 按 workspace root 到当前 scope 由宽到窄生效；scope 子树中的 `AGENTS.md` 在 Agent 进入或修改对应目录时生效。
- Organization/root 的模块化 Rule 由 `rules/manifest.yml` 管理：`enabled: true`、`required: true` 且 `state: installed` 的 Rule 必须读取正文。
- 对 `enabled: true`、`required: false` 且 `state: installed` 的 Rule，Agent 必须先检查 description，并在用户目标、修改范围、代码语义或 workspace context 表明相关时，于行动前读取正文。
- `enabled: false` 或 `state: uninstalled` 的 Rule 不参与当前任务；description 只表达语义边界和用途，不承载规则正文。
- 长期事实写入 Buildr 源资产；Agent runtime 是可重建渲染结果，不作为源资产维护。
- 用户表达采用内部流程、调整工作方式、修改默认 Skill 行为或替换专业动作时，Agent 必须先判断该意图是否触达或产生跨 Skill 稳定依赖边界；创建、修改、替换或卸载 Skill 前必须检查相关 `provides`、`requires`、capability binding、产品入口 routing evidence 和受影响 consumers，不得绕过已知依赖直接激活。
- Agent 组合 Buildr 管理的 Skills 时必须遵守已安装的 capability binding；不得调用已卸载 provider，也不得自行猜测存在歧义的 provider。
- Agent 成功改变已检出 Git tree 且当前仓库位于已初始化 Buildr workspace 时，必须执行 Buildr workspace transition check；该不变量不依赖任何 optional Git Skill 是否安装。
- 在已初始化 workspace 中，Buildr 安装、源资产或 Agent runtime 状态变更后，必须运行当前 Agent 的 doctor；仍有需要立即处理的 error 时不得视为完成。
- 面向用户说明产品设计、实现、问题、方案、进度或结果时，应使用直接、简练的中文。必要的专业术语首次出现时，已有正式或稳定中文名称的采用“中文（English Term）”，后续优先使用中文；没有稳定中文译名的可保留英文，但首次出现时须说明含义。同一描述范围内的术语译法必须保持一致。命令、代码标识、字段名、接口名、文件路径、错误原文及其他必须与实现精确对应的内容保留英文，必要时补充简明中文说明。
- 没有更具体的 Project、Service 或仓库约定时，Git 提交信息的主题和正文默认使用中文；代码标识、路径、scope 和专有名词可保留原文。
- 新建或重写文本文件时，文件末尾必须恰好保留一个换行符；不得在 EOF 前生成额外空白行。内容内部为表达段落所需的空行不受此约束。
- 使用 Buildr 时，Agent 是默认操作入口：能在当前工具、权限和安全边界内完成的动作，应在说明必要影响并取得所需授权后直接执行，不把命令或操作步骤作为默认结果要求用户代为执行。只有用户明确选择手动方式，或 Agent 因工具不可用、权限、登录态、外部环境等原因无法完成时，才提供准确的手动操作作为兜底。
- 完成当前工作、到达阶段节点或遇到阻塞时，应结合当前状态以及适用的 Rule、Skill 和项目约定，向用户说明明确、可执行的下一步；任务已经完整结束时，应明确说明任务已完成，不机械追加无关建议。
- 实现型任务没有与最终候选一致的可信验证证据时，不得声称已完整验证或完成；面向用户的完成说明必须如实披露验证范围、结果、验证自身耗时或证据缺口，具体命令、分层执行和计时方式由适用的 Skill 与 workspace/Project 政策决定。
- `rules/manifest.yml` 是 root/Organization Rule 登记和启停用事实清单；新增 root Rule 先编辑 `rules/<rule-id>.md`，再用 `buildr rules add` 注册；删除 root Rule 用 `buildr rules remove`。

## 基本模型

Buildr 是为组织和 Agent 构建的工作资产治理系统。

它把散落在员工个人经验、文档、仓库和工具中的工作事实与工作方法，沉淀为可共享、可审计、可适配不同 Agent 的工作区（workspace）源资产。工作事实回答“干的是什么”，工作方法回答“怎么干”；Rules、Skills、Commands、Projects、Services 和专业能力等是当前示例，不是工作资产概念的封闭边界。Agent 是这些资产的主要使用者；人通过 Agent 表达目标、提供业务判断并确认重要决策。

Buildr 不成为另一个 Agent，也不接管 Agent 的理解、推理和任务执行。Buildr 管理和投射的是 Agent 可发现、可选择、可使用的工作资产，不是当前任务的 context window。Agent 根据用户目标、修改范围、代码语义和 workspace 信息选择相关内容，形成任务上下文并推进工作；Agent runtime adapter 不替 Agent 判断语义相关性。

```text
Organization/Root -> Project -> Service
```

| 术语 | 含义 |
|------|------|
| 组织（Organization/Root） | Buildr workspace 根；保存组织级规则（Rules）、项目登记（Project registry）、组件（Components）、技能（Skills）、命令（Commands）和 Agent runtime 渲染关系。 |
| 项目（Project） | 业务、产品线、系统或长期工作单元；保存项目级规则（Rules）、OpenSpec、技能（Skills）和服务登记（Service registry）。 |
| 服务（Service） | Project 管理的代码仓、应用、模块或可执行资产。 |
| Agent runtime | 当前 Agent 实际运行的资产，是从 Buildr 源资产生成的可重建结果。 |

## 资产边界

| 资产类型 | 默认位置 |
|----------|----------|
| 规则（Rules） | `AGENTS.md`、`rules/manifest.yml`、`rules/` |
| Project registry | `projects/manifest.yml` |
| 项目资产（Project assets） | `projects/<project>/` |
| Service registry | `projects/<project>/services/manifest.yml` |
| 服务资产（Service assets） | `projects/<project>/services/<service>/` |
| 技能（Skills） | `skills/manifest.yml`、`skills/` |
| 组件（Components） | `components/manifest.yml`、`components/<source>/<id>/component.yml` |
| 命令（Commands） | workspace catalog：`commands/manifest.yml`、`commands/**/manifest.yml`；Project requirements：`projects/<project>/commands.yml` |
| Agent runtime | `.agents/`、`.claude/`、`CLAUDE.md` 等渲染结果 |

## 硬边界

- Buildr 源资产是组织工作资产的长期事实来源；Agent runtime、本机状态、登录态、token、cookie、临时 prompt 和一次性聊天内容不是组织源资产。
- Practices 不是独立受管资产；已有 `practices/` 是用户保留数据，Buildr 不自动读取、迁移、覆盖或删除，也不因其存在阻塞正常命令。
- Component 当前只支持 workspace scope；成员由 definition 唯一声明，只能通过 Component 生命周期统一维护。本机外部 CLI 和 Project 内容不属于 workspace Component。
- Commands 的定义 authority 是 workspace catalog；Project `commands.yml` 只表达 requirement references，本机 binary、版本、登录态和凭证不是 Buildr 源资产。Buildr 不 render 或安装 Commands。
- Workspace 等同于工作目录，是 Skill 唯一 source authority。Project 通过 `capabilities.yml` 表达业务 requirements、bindings 与 applicability；user/workspace 只是 Agent runtime render destinations，不能用 Project 目录冒充 Skill 安装隔离层。
- 对象级卸载命中 Component 时，Agent 必须展示完整范围和保留项并取得二次确认，CLI 不负责猜测对象边界。
- 组织资产、项目资产和服务代码仓的 Git 边界必须按实际仓库判断，不得凭目录名假设。
- Buildr required block 只负责把 Agent 引导到 Buildr Core；具体任务流程由对应 Skill、项目规则或服务规则承载。
- Buildr required Rule 不建议手工改写；如被破坏，由 Buildr 产品能力恢复。
