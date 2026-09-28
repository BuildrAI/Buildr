# 智能体运行时（Agent Runtime）投射

- 运行时身份 `runtimeId` 表示真实宿主；适配器（Adapter）身份 `adapterId` 表示文件约定。可靠知道品牌时传真实 `<agent>`，不知道时允许省略，不冒用 Codex 或其他品牌。
- 默认文件约定为 `agents-standard`：原生 `AGENTS.md` 与一级 `.agents/skills/<skill-id>/SKILL.md`。`codex`、`dsh` 及未登记但语法有效的品牌使用标准；Claude Code、Cursor、Qoder、TRAE、TRAE Work、WorkBuddy 的专用例外继续保留。
- 未指定时保留明确选择或唯一既有受管方式，没有既有方式才默认标准；多个不等价方式时，写入前要求明确选择。`--adapter <adapter-id>` 显式选择文件约定，未知值必须报错；选择后的冲突或执行失败不能改用另一实现，也不退回仅源资产操作。
- `buildr runtime list --json` 输出标准默认值、静态适配器（Adapter）、已知品牌映射、目标目录、发现范围、生效方式与检查能力。它不是品牌白名单，也不证明当前宿主已经安装或加载。
- `buildr init` 默认完成源资产、产品入口技能（Skill）、工作空间（Workspace）投射和最终诊断（Doctor）；只需源资产时显式使用 `buildr init --source-only`。`sync`、`render`、`skill install`、`skills render` 和 `runtime check` 可省略品牌。已知身份优先明确传入，详见当前命令帮助。
- 通用技能（Skill）省略 `runtimes`；用户明确限制仍按真实 `runtimeId` 判断，未知身份不能获得品牌专属许可。源目录可以嵌套，标准输出使用一级技能标识目录；脚本、模板和参考文件相对技能（Skill）入口的路径不变。其他厂商根保留原布局。
- 所有 `.agents/skills/` 投射（包括 Cursor/TRAE 技能）共用 `agents-standard` 文件归属；专用规则（Rule）仍由相应适配器（Adapter）维护。旧品牌回执（Receipt）与嵌套受管目录仅在身份、完整文件及权限可证明一致时迁移；漂移、未知额外文件、目标或多份回执（Receipt）冲突时整组零写入，保留现场。
- 迁移完成后不要交替使用旧版 Buildr 管理同一投射。需要回退时恢复操作前的完整文件与回执（Receipt）备份，而不是删除新回执。共享根中仍有启用来源的技能（Skill）不能因为本次品牌未选择而被清理；品牌限制导致共享正文或能力绑定（Capability Binding）不同时必须显式报告冲突。
- 文件准备状态、安装/版本探测及会话加载是独立事实；标准文件成功不代表未知品牌兼容性或当前会话激活已验证。`partial` 只说明无法枚举全部管理员、系统、插件技能（Skill），不构成诊断警告或修复动作，也不证明全局无同名项。
- Codex 的可选 `agents/openai.yaml` 由宿主资料（Host Profile）校验；缺失不阻塞，其他宿主随完整目录保留但不解释。通用标准适配器（Adapter）不承载厂商元数据（Vendor Metadata）。
- 适配器（Adapter）只生成声明式投射计划；Buildr 统一负责组件（Component）完整性之后的源资产组装、计划验证、冲突预检、写入、清理和诊断。需要新文件格式时才增加专用描述符（Descriptor）；单纯新品牌复用标准，不复制一套实现或修改通用技能（Skill）清单。
- 诊断（Doctor）指出特定规则（Rule）作用域问题时，按工作空间（Workspace）相对路径运行 `render`、`rules render` 或 `runtime check`；技能（Skill）始终从工作空间（Workspace）源资产处理目标层，不恢复旧项目（Project）技能源。仅在具体问题或用户明确要求细查时运行专项检查。

## 入口恢复

产品入口技能（Skill）缺失或未被发现时，用 `buildr help skill install` 核对参数，在已确认的目录与宿主上执行 `buildr skill install [<agent>] --target <dir>`。源资产已经初始化但投射过期或中断时，修复诊断指出的问题后使用 `buildr sync [<agent>] --target <dir>`，复用其最终诊断（Doctor），不重复初始化。

原生工具仍需要刷新、新会话或界面开关时，说明剩余动作。文件投射成功不能证明当前会话已经加载；未知文件、所有权冲突或本地修改应保留现场，不能通过删除运行时（Runtime）目录绕过检查。事务中断按诊断的确切标识和 `buildr help mutation recover` 处理，不手工删除锁。
