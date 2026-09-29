## MODIFIED Requirements

### Requirement: MVP 先通过 Buildr Skill 和基础命令闭环
Buildr MVP MUST 通过 Buildr Skill、bootstrap guide 兜底、带 Agent identity 的高层 `init`、`project create`、`service create`、`doctor` 和按 Agent 类型选择的 runtime 动作完成 onboarding 闭环，不得要求先实现 `buildr use` 等额外入口。

#### Scenario: Agent 获取 Buildr 使用指南
- **WHEN** Agent 通过 README、安装说明、`buildr --help` 或本地 CLI 发现 Buildr，但当前 workspace 尚未初始化且当前 runtime adapter 已确认
- **THEN** Agent MUST 优先使用 `buildr init --agent <agent>` 初始化 workspace 并安装产品 Buildr Skill
- **AND** 当 Buildr Skill 仍不可用时，Agent MUST 能通过 `buildr bootstrap guide` 理解基础命令和 onboarding 兜底路径

#### Scenario: Agent 使用 Buildr Skill
- **WHEN** 当前 Agent runtime 已安装 Buildr Skill
- **THEN** Agent MUST 通过 Buildr Skill 理解 Buildr workspace onboarding、项目创建、服务接入、诊断和 runtime 处理约束
- **AND** Buildr Skill MUST 以轻约束和命令地图引导 Agent 自主编排，而不是规定固定交互脚本

#### Scenario: service create 维护服务资产
- **WHEN** Agent 需要创建或维护 service metadata 与 service repo 引用
- **THEN** Agent MUST 使用 `buildr service create`
- **AND** bootstrap guide MUST NOT 将 `service link` 描述为主命令

#### Scenario: 共享服务创建项目
- **WHEN** 用户希望接入共享、基础或平台 service repo
- **THEN** Agent MUST 引导用户选择或创建一个 Project 来承载这些 services
- **AND** Agent MUST NOT 引导用户维护 root `shared/`

#### Scenario: 渐进式引导项目和服务
- **WHEN** Agent 完成 `buildr init --agent <agent>` 或其他 Buildr 状态变更
- **THEN** Agent MUST 基于该命令的最终 doctor 结果和用户回答，逐步引导创建项目、接入 service repo 和执行必要的 runtime 维护

#### Scenario: Agent 根据自身 runtime 选择动作
- **WHEN** Agent 准备执行 `buildr init --agent <agent>`
- **THEN** bootstrap guide 和 Buildr Skill MUST 引导 Agent 先确认自身 runtime adapter
- **AND** 对原生读取 `AGENTS.md` 的 Agent MUST NOT 要求执行独立 rules render

#### Scenario: Codex 使用 Buildr workspace
- **WHEN** Codex Agent 在 Buildr workspace 中工作
- **THEN** Agent MUST 直接使用 `AGENTS.md` 作为规则入口
- **AND** Agent MUST NOT 为规则入口执行 `buildr rules render claude-code`

#### Scenario: Claude Code 使用 Buildr workspace
- **WHEN** Claude Code Agent 在 Buildr workspace 中工作
- **THEN** Agent MUST 使用 Claude Code adapter 的 runtime check/render 来维护 `CLAUDE.md` 和 `.claude/skills/`

#### Scenario: 纯源资产初始化保持兼容
- **WHEN** Agent 显式执行 `buildr init --source-only`
- **THEN** Buildr MUST 只创建 Buildr workspace 源资产
- **AND** Buildr MUST NOT 自动渲染运行时文件

#### Scenario: 高层初始化准备当前 Agent runtime
- **WHEN** Agent 执行 `buildr init --agent <agent> --target <dir>`
- **THEN** Buildr MUST 在创建 workspace 源资产后执行等价于 `buildr sync <agent> --target <dir>` 的完整 reconcile
- **AND** Buildr MUST 以指定 Agent 的最终 doctor 通过作为 onboarding 完成条件
- **AND** Agent MUST NOT 需要再执行独立的 `skill install`、`render`、`sync` 或 `doctor` 才完成首次 onboarding

#### Scenario: 高层初始化参数预检
- **WHEN** `buildr init` 收到非法 Agent id、未知显式适配器（Adapter）或互斥的选择参数
- **THEN** Buildr MUST 在写入 workspace 源资产或 Agent runtime 前失败
- **AND** Buildr MUST 输出准确的参数错误；未知但语法有效的品牌 MUST 使用标准接入而非报 unsupported

#### Scenario: 高层初始化 sync 失败
- **WHEN** workspace 源资产已经初始化，但 `init --agent` 的后续 sync 或 doctor 未通过
- **THEN** Buildr MUST 保留已初始化的 workspace 源资产
- **AND** Buildr MUST NOT 报告 onboarding 成功
- **AND** Buildr MUST 引导 Agent 修复问题后运行 `buildr sync <agent> --target <dir>`

#### Scenario: 产品 Skill 安装不同于 workspace Skills 投射
- **WHEN** Agent 只需要让当前 runtime 学会使用 Buildr
- **THEN** Agent MUST 使用 `buildr skill install <agent>`
- **AND** 当 Agent 需要投射 workspace Skills 时，Agent MUST 使用 `buildr skills render <agent> --destination workspace|user`
- **AND** Project 专用语义 MUST 通过 `capabilities.yml` 表达而不是建立 Skill source scope

#### Scenario: 讨论其他更高层入口
- **WHEN** 需要评估 `buildr use` 等其他更高层入口
- **THEN** 该能力 MUST 在 `init --agent` onboarding 效果被验证后再单独设计

#### Scenario: 默认初始化标准入口
- **WHEN** 用户确认初始化且未提供 `--source-only`、运行时或适配器（Adapter）选择
- **THEN** Buildr MUST 按统一选择规则保留既有接入方式或准备 `agents-standard`
- **AND** MUST 完成产品技能（Skill）、工作空间（Workspace）技能（Skill）和最终诊断，不另要求品牌登记

### Requirement: Agent selects runtime adapter before render
Buildr onboarding MUST 区分真实运行时身份与文件适配器（Adapter），并使用标准默认选择而非品牌登记门槛。

#### Scenario: Supported Agent uses matching adapter
- **WHEN** 智能体（Agent）可靠知道自身品牌
- **THEN** MUST 将真实身份交给 Buildr，并允许统一选择器选择标准或专用实现
- **AND** MUST NOT 冒用另一品牌

#### Scenario: Agent cannot identify itself
- **WHEN** 智能体（Agent）无法可靠识别自身品牌
- **THEN** MUST 允许省略身份并使用已有选择或标准默认值
- **AND** MUST NOT 为此构造虚假品牌或阻止无关工作

#### Scenario: Agent discovers supported runtimes
- **WHEN** 调用方需要了解文件约定和品牌特例
- **THEN** `runtime list --json` MUST 给出标准默认值、专用例外和证据边界
- **AND** 未列出的有效品牌 MUST NOT 因品牌登记缺失被禁止准备标准文件

#### Scenario: Unsupported Agent warns instead of rendering
- **WHEN** 智能体（Agent）的有效品牌不在已知映射中
- **THEN** MUST 采用标准文件约定并说明品牌发现行为未确认，而不是冒用其他品牌或停止标准维护

### Requirement: Buildr Skill uses runtime discovery in its main loop
Buildr 产品技能（Skill）MUST 说明默认标准接入、真实身份和显式适配器（Adapter）的区别，不要求每个品牌先通过登记。

#### Scenario: Buildr Skill runtime selection
- **WHEN** 智能体（Agent）按 Buildr 产品技能（Skill）维护工作空间（Workspace）
- **THEN** MUST 按需查询 `runtime list` 并使用统一选择规则
- **AND** MUST 报告文件准备事实，不能据此声明宿主已加载
- **AND** 已选实现失败时 MUST NOT 自动切换另一实现

### Requirement: 公开文档提供已接入 Agent adapter 权威说明
Buildr MUST 维护一份可由人和 Agent 从根 README 发现的已接入 Agent runtime adapter 权威文档，并使其与 `buildr runtime list --json` 的 supported adapter 事实一致。

#### Scenario: README 引用 adapter 文档
- **WHEN** 用户或 Agent 阅读根 `README.md` 或 `README.en.md` 的当前支持摘要或文档导航
- **THEN** README MUST 链接已接入 Agent adapter 权威文档
- **AND** README MUST 引导 Agent 使用 `buildr runtime list --json` 获取当前机器可读事实矩阵
- **AND** README MUST NOT 复制一份容易与权威文档漂移的完整 adapter 机制表

#### Scenario: Adapter 文档说明接入方式
- **WHEN** 用户或 Agent 阅读已接入 Agent adapter 权威文档
- **THEN** 文档 MUST 对每个 supported adapter 说明 adapter id、适用 surface、Rules 入口与生成 target、Skills root、activation/reload、checker、前置条件和已知限制
- **AND** 文档 MUST 区分官方文档、本机观察、安装包源码和推断等兼容证据来源
- **AND** 文档 MUST 说明自动 contract/parity 只能证明 Buildr 的投射与维护边界，不能证明目标 Agent 已在当前 workspace、版本或会话加载文件
- **AND** 文档 MUST NOT 维护 `documented`/`verified`、`pending`/`passed` 或品牌历史 marker smoke 快照

#### Scenario: Agent 按文档接入当前 runtime
- **WHEN** Agent 从权威文档识别到自身 runtime 已受支持
- **THEN** 文档 MUST 引导 Agent 使用匹配的 adapter id 运行 `buildr init --agent <agent>`、`buildr sync <agent>`、`buildr runtime check <agent>` 或相应 render 命令
- **AND** 文档 MUST 提醒 Agent 按 adapter-specific guidance 完成 reload、新会话或 UI toggle
- **AND** 文档 MUST 说明未列出的有效 runtime 默认使用标准文件约定，但品牌发现、安装与激活尚未确认；显式未知 adapter MUST 报错
