# Buildr Core

Buildr workspace 的通用硬约束。按 root → Project → Service 读取当前 scope 的 `AGENTS.md`。

## 基本原则

- Rule 只承载价值观、权威/授权边界、约束和结果不变量；root、Project 或 Service `AGENTS.md` 只能增加当前 scope 的这些内容。
- Rule 不承担 Skill 路由、命令序列、生命周期、重跑/恢复、报告模板或专业状态/Result。Rule 可以命名唯一 owner 和禁止绕过的不变量，但不得复制其流程或当前状态。
- Skill description 发现用户意图，Skill body 承担流程，capability binding 选择 provider，Project declaration 声明能力、适用性和证明范围，Skill/Application 维护状态与 Result；Rule 不得成为第二权威。
- Rule description 只索引语义相关性，不路由路径、角色或 Service。required installed Rule 必须读取；optional installed Rule 语义相关时读取；disabled 或 uninstalled Rule 不生效。
- Agent runtime adapter 只按目录发现和投射 Rule；不替 Agent 判断语义相关性。runtime 是可重建结果，不是源资产。
- Buildr 采用宽而薄的治理：只有继续推进会造成越权、错误对象写入、未经授权的外部或不可逆副作用、证据失真或完成误报时才关闭式失败。其他可恢复的不确定性必须如实报告事实、风险和下一步，并保留 Agent 的安全判断与推进空间；不得把辅助证明、工具偏好或推荐工作方式固化为不必要的硬门禁。
- 创建、修改、替换或卸载 Skill 前必须判断跨 Skill 依赖，并检查相关 `provides`、`requires`、capability binding、入口 routing evidence 和 consumers；不得绕过已知依赖直接激活。
- Agent 组合 Buildr 管理的 Skills 时必须遵守已安装的 capability binding；不得调用已卸载 provider，也不得自行猜测存在歧义的 provider。
- 已初始化 workspace 的 Git tree 改变后必须执行 workspace transition check；Buildr 安装、源资产或 Agent runtime 改变后必须运行当前 Agent 的 doctor。未清除需立即处理的 error，不得视为完成。
- 面向用户使用直接、简练的中文。专业术语使用中文或“中文（English Term）”；无稳定译名时使用“中文释义（English Term）”。命令、标识、路径、错误原文和产品名可保留英文。
- 没有更具体的 Project、Service 或仓库约定时，Git 提交信息的主题和正文默认使用中文；代码标识、路径、scope 和专有名词可保留原文。
- 新建或重写文本文件时，最后一个非空字符后必须且只能保留一个换行符。文件末尾不得存在空白行。正确：`...\n`；错误：`...\n\n`。该限制只针对文件末尾，不限制正文内部的合理空行。
- Agent 是默认操作入口；取得必要授权后直接执行。仅在用户选择手动方式或 Agent 受工具、权限、登录态、外部环境阻塞时提供手动步骤。
- 没有与最终候选一致的验证证据，不得声称完整验证或完成；完成说明必须报告验证范围、结果、耗时和缺口。
- `rules/manifest.yml` 是 root/Organization Rule 的登记与启停用 authority；维护流程由 Skill 承载。

## 基本模型

Buildr 管理源资产和运行时投射；Agent 负责理解、推理和执行。Buildr 不保存 context window。

```text
Organization/Root -> Project -> Service
```

| 术语 | 含义 |
|------|------|
| 组织（Organization/Root） | workspace 根；拥有组织 Rules、registries、Components、Skills、Commands 和 runtime 投射关系。 |
| 项目（Project） | 业务、产品线、系统或长期工作单元；拥有 Project Rules、OpenSpec、capability/applicability context 和 Service registry。 |
| 服务（Service） | Project 管理的代码仓、应用、模块或可执行资产。 |
| Agent runtime | 从源资产生成的可重建运行入口。 |

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

- Buildr 源资产是长期事实；runtime、本机状态、凭证、临时 prompt 和一次性聊天不是源资产。
- Practices 不是独立受管资产；已有 `practices/` 是用户保留数据，Buildr 不自动读取、迁移、覆盖或删除，也不因其存在阻塞正常命令。
- Component 只支持 workspace scope；definition 唯一声明成员，成员只随 Component 生命周期维护。本机 CLI 和 Project 内容不属于 Component。
- Commands 定义权威是 workspace catalog；Project `commands.yml` 只引用 requirement。本机 binary、版本、登录态和凭证不是源资产，Buildr 不安装或 render Commands。
- Workspace 是 Skill 唯一源；Project `capabilities.yml` 只表达 requirements、bindings 和 applicability，runtime destination 不是源。
- 对象级卸载命中 Component 时，Agent 必须展示完整范围和保留项并取得二次确认，CLI 不负责猜测对象边界。
- 组织资产、项目资产和服务代码仓的 Git 边界必须按实际仓库判断，不得凭目录名假设。
- Buildr required block 只引用 Core；Project/Service `AGENTS.md` 只增加 scope 约束，任务流程由 Skill 承载。
- Buildr required Rule 由 Buildr 管理，不得手工改写；损坏时由 Buildr 恢复。
