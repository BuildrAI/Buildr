## ADDED Requirements

### Requirement: 外部智能体程序及配套 SDK 必须由用户按需安装而非随产品包分发

Buildr Development（`@buildr-ai/buildr`）与 Buildr Harness（`@buildr-ai/buildr-harness`）产品安装包 MUST 仅分发自有产品实现、生产网页资产及核心开源运行依赖；外部智能体执行程序及其厂商 SDK（包括但不限于 `@anthropic-ai/claude-agent-sdk`、`@qoder-ai/qoder-agent-sdk`、`@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-*` 客户端包）MUST NOT 随上述产品安装包分发。当用户在受管接入中准备对应外部智能体程序时，系统 MUST 将所需配套 SDK 与程序一并按需安装到该接入的独立受管程序目录，并从该目录内加载；缺少配套 SDK 的已安装目录 MUST NOT 被视为可用候选，重新准备时 MUST 能原子补齐。

#### Scenario: 检查产品安装包不包含外部厂商 SDK
- **WHEN** 构建 `@buildr-ai/buildr` 或 `@buildr-ai/buildr-harness` 发行压缩包并检查其中依赖树
- **THEN** 压缩包内 MUST NOT 包含 `@anthropic-ai/*`、`@qoder-ai/*` 或 `@deepseek-ai/*` 软件包，发行检查仅审查产品自有与剩余开源依赖闭包

#### Scenario: 准备外部智能体程序时按需安装并校验配套 SDK
- **WHEN** 用户在隔离数据域中准备 `claude-code`、`qoder` 或 `dsh` 独立程序
- **THEN** 程序管理器 MUST 将执行程序与对应配套 SDK 共同安装到独立受管目录，且仅在主程序与全部配套 SDK 均存在、非符号链接且版本匹配时报告就绪

#### Scenario: 旧受管目录缺少配套 SDK 时拒绝冒充就绪并允许补齐
- **WHEN** 受管目录存在执行程序但缺少所需配套 SDK
- **THEN** 程序发现与打开流程 MUST 不将其当作有效就绪程序，不得回退到宿主或其他安装目录加载；用户重新执行准备后 MUST 能原子替换补齐配套 SDK
