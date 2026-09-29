## Why

多个智能体运行时（Agent Runtime）已经能消费相同的 `AGENTS.md` 和 `.agents/skills/`。Buildr 仍按品牌逐项登记、逐项限定通用技能（Skill），把标准文件准备能力与品牌发现、激活证据混为一谈，造成不必要的接入成本和共享目录所有权冲突。

## What Changes

- 分离运行时身份 `runtimeId` 与文件适配器（Adapter）身份 `adapterId`，引入 `agents-standard` 作为没有专用例外时的默认文件约定。`codex`、`dsh` 和未登记但语法有效的品牌使用标准实现，不相互冒用身份。
- 未指定运行时或适配器（Adapter）时保留已选或唯一受管接入方式；没有既有选择时采用标准。多个不等价既有选择不能静默切换。显式 `--adapter` 必须有效；已选实现发生错误不回退。
- 标准输出采用一级 `.agents/skills/<skill-id>/SKILL.md`，保留技能（Skill）完整随附资源；源目录仍可嵌套。专用规则（Rule）入口继续保留。
- 通用产品技能（Skill）不再维护品牌白名单；用户明确限定的运行时适用范围继续有效。
- 共享 `.agents/skills/` 的接入方式共用文件归属，安全迁移有效旧回执和需要扁平化的旧受管目录；不能证明归属、内容漂移或目标冲突时零写入停止相关投射。
- 诊断分别报告请求身份、实际适配器（Adapter）、文件准备状态和未确认的安装/加载事实；不因未知品牌而阻止标准文件准备，也不宣称未知品牌已经验证。
- **BREAKING**：不带 `--agent` 的新工作空间（Workspace）初始化将准备标准入口，不再仅创建源资产；保留显式纯源资产初始化入口。旧回执迁移后旧版本不能继续作为写入者管理该投射。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-first-runtime-projection`：标准默认选择、运行时身份分离、共享文件归属与安全迁移。
- `human-agent-onboarding`：默认标准初始化、显式适配器（Adapter）选择和取消品牌登记前置。
- `agent-readable-doctor`：未知有效运行时使用标准诊断，展示真实选择与证据边界。
- `managed-skill-assets`：通用技能（Skill）的运行时无关适用性与一级目标布局。
- `product-agent-skills`：产品入口在宿主身份未知时使用标准默认，不再以品牌确认为维护前置。
- `buildr-package-assets`：包内通用技能（Skill）省略品牌列表，明确限制继续有效。
- `public-json-contracts`：运行时发现与诊断输出升级为 v2，明确品牌身份、文件实现列表及标准诊断键的迁移。

## Impact

影响 `agent-assets` 的选择、投射、文件归属和组件维护，命令行（CLI）入口与工作空间（Workspace）初始化/诊断，以及随包资源声明、使用指引和适用测试。不新增依赖，不修改 DSH，不实现并行 DSH 页面插件任务，不执行发布、正式自举同步或 Git 收尾。
