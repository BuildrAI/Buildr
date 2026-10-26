## MODIFIED Requirements

### Requirement: 开发仓库安装必须形成 Agent 可用闭环
Buildr MUST 提供与当前仓库结构一致的开发 checkout 安装路径，并提供 registry package 安装路径，使 Agent 在没有预装 Buildr Skill 的环境中能够准备 CLI，再用单个高层初始化命令完成 workspace 源资产、当前 runtime 和诊断闭环。

#### Scenario: Agent 从干净开发仓库开始
- **WHEN** Agent 在 Buildr 仓库的干净 clone 中按根 README 安装 Buildr
- **THEN** 安装说明 MUST 使用仓库中真实存在的产品目录和安装脚本
- **AND** 安装流程 MUST 确定性准备 lockfile 声明的运行依赖
- **AND** Agent MUST 能运行 `buildr runtime list --json`

#### Scenario: Agent 从 registry package 开始
- **WHEN** Agent 在没有 Buildr checkout 的环境中按根 README 安装 Buildr
- **THEN** 安装说明 MUST 使用发布的 npm package identity 和支持的 registry 安装方式
- **AND** Agent MUST 能运行 `buildr runtime list --json`

#### Scenario: Agent 完成首次 runtime 准备
- **WHEN** CLI 已从开发 checkout 或已安装 npm package 可用，且 Agent 已从 supported runtime list 选择自身 adapter
- **THEN** 公开 onboarding MUST 引导 Agent 运行 `buildr init --agent <agent>`
- **AND** 该单个命令 MUST 创建源资产、安装产品 Buildr Skill、投射 workspace Skills 并运行最终 doctor
- **AND** 最终 doctor MUST 不包含需要立即处理的 error

#### Scenario: 两种安装模式回归验证
- **WHEN** 产品完整验证运行 接入端到端测试（E2E）
- **THEN** verifier MUST 分别覆盖不包含 `node_modules` 和 Agent runtime 产物的临时开发 checkout，以及从 npm package 安装的临时 prefix
- **AND** 两种模式 MUST 都能从公开安装入口运行 `buildr runtime list --json` 并仅用 `buildr init --agent <agent>` 完成 workspace/runtime onboarding
- **AND** verifier MUST 独立读取 doctor JSON 证明最终状态可用

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
- **AND** 文档 MUST NOT 维护 `documented`/`verified`、`pending`/`passed` 或品牌历史 marker 固定文本快照

#### Scenario: Agent 按文档接入当前 runtime
- **WHEN** Agent 从权威文档识别到自身 runtime 已受支持
- **THEN** 文档 MUST 引导 Agent 使用匹配的 adapter id 运行 `buildr init --agent <agent>`、`buildr sync <agent>`、`buildr runtime check <agent>` 或相应 render 命令
- **AND** 文档 MUST 提醒 Agent 按 adapter-specific guidance 完成 reload、新会话或 UI toggle
- **AND** 文档 MUST 说明未列出的有效 runtime 默认使用标准文件约定，但品牌发现、安装与激活尚未确认；显式未知 adapter MUST 报错
