# Buildr 当前使用边界

本页说明当前产品的适用条件、数据范围和尚未提供的能力。安装及首次使用见[命令参考](cli-reference.md#首次使用)，工具接入见[运行时适配参考](agent-runtime-adapters.md)。发布是否完成以 npm 官方仓库和对应发布结果为准，本文不保存候选版准备进度或历史发布失败记录。

## 安装、平台与版本

- npm 是产品分发渠道。运行产品的 Node.js 必须满足 `>=24.15.0 <25`；工作空间（Workspace）声明的精确受管 Node.js 有独立用途，不能替代此安装要求。
- Buildr Web 是浏览器中的本机界面。macOS 与 Windows 可显式安装依赖同一 npm 安装的启动器（Launcher）；当前不发布无需 Node.js 的独立桌面安装包，也不提供菜单栏、开机启动、静默自动更新或系统通知。
- 页面不扫描磁盘或跨工作空间（Workspace）聚合全部资源，使用者需要明确登记工作目录。关闭浏览器不等于退出服务；使用页面“退出 Buildr”或终止对应进程。
- 正式版轨道（Stable Track）对应 `latest`，候选版轨道（Candidate Track）对应 `next`。已安装时用 `buildr update check --json` 核对两条轨道；首次安装先查询 npm 官方仓库。标签指向预发布版本不代表正式版已发布，已有安装不会自动切轨或降级。

## 本机数据与协作

- 长期源资产由文件与 Git 管理。本机 SQLite 保存任务（Task）、工作摘要（Work Context）、审查（Review）及验证（Verification）等结构化记录；这些数据不进入 Git，也不自动跨机器同步。
- 每日演进和复盘正文同样属于本机资料。复制源资产或克隆代码库不等于迁移完整工作现场；完整企业权限、远程多用户协作和跨机器自动恢复尚未完整交付。
- 父子任务（Parent/Child Task）仅支持同一工作空间（Workspace）中的单父关系和多个直接子项，不是通用依赖图。待办不含排期、责任人或优先级，也不会自动创建 OpenSpec 变更或执行工作。
- 旧 `.buildr/tasks/<task-id>/` 文件不读取、迁移或双写。复盘正文位于当前机器的 `.buildr/local/task-retrospectives/`，任务（Task）只保存正文摘要和决定状态；它不自动采集耗时或词元（Token），不保存结构化行动项或跨工作空间（Workspace）汇总。
- 可写打开数据库会执行待迁移内容，并清理旧 `.buildr/asset-review/` 与 `.buildr/local/task-execution-records/`。较早候选版的旧研发、环境、收尾和复盘记录也有退役迁移；每项迁移分别提交，不保证整批失败后全部回滚。需要保留旧内容时，必须在新版首次写入前保存副本。详见[数据保全与升级](../../../knowledge/docs/guides/getting-started.md#更新与数据保护)。
- 人在页面中保存答复后，智能体（Agent）在继续工作时读取；答复不会自动唤醒执行。任务（Task）完成记录不替代实际交付，清理或可选自举激活（Self-bootstrap Activation）失败也不撤销已成立的交付事实。

## 智能体（Agent）接入

- 当前支持 `claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy`。自动检查证明 Buildr 的投射和维护行为，不能证明目标工具已在当前版本、目录或对话中加载文件。
- TRAE Work 需要在桌面设置中启用对应规则（Rule）导入；WorkBuddy 通过 `CODEBUDDY.md` 中明确的读取指令发现规则（Rule）。刷新方法和已观察版本见[运行时适配参考](agent-runtime-adapters.md)，不要把缺少现场加载证据当作所有工作都不可继续。
- 工具内部的管理员、系统和插件技能（Skill）不能被统一枚举。Buildr 只检查自身管理候选的可观察同名项；`partial` 表示可见范围有限，不证明全局唯一，也不单独成为健康警告。
- 当前不自动接管外部技能（Skill）所有权；即使内容相同，`--replace` 也不能覆盖不属于 Buildr 的资源。冲突时保留现场，按已确认范围重命名、移除或停用相关资源。
- 不支持的运行时（Runtime）只阻止依赖该适配器（Adapter）的动作。对象或内容归属不明时停止相关写入，其他安全工作可继续。

## 工作资产与专业执行

- 组件（Component）只支持工作空间（Workspace）范围，没有项目（Project）或服务（Service）级组件（Component）、远程目录、依赖求解或可执行钩子（Hook）。
- 命令（Command）只声明和诊断外部工具，不负责安装、升级或登录。智能体（Agent）仍需在实际环境和授权内完成专业执行。
- 远端技能（Skill）当前只支持 `resolved.kind: skill-url` 指向单个原始 `SKILL.md`，不推测相邻目录；未声明完整性摘要（Integrity）时允许投射，但诊断会警告。
- 当前全局资产模型中，服务（Service）引用代码库实例（Repository Instance），项目（Project）引用服务（Service）。Git 来源、远端与集成分支（Integration Branch）是声明，登记或修改它们不执行克隆、拉取、合并或变基；真实代码仍需单独准备和核对。
- OpenSpec 接入固定支持 1.13.0。归档使用 `openspec converge`；独立规范同步使用对应上游技能（Skill）并保留变更。`openspec convergence inspect` 只用于尚未结束的收敛现场，不提供归档后的长期审计；旧格式恢复记录不自动成为新版本的写入授权。旧 `openspec audit` 和阶段命令已删除，历史成果从归档材料、正式规范与 Git 读取。
