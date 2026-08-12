# command-line-tool-assets Specification

## Purpose
定义组织级外部命令行工具的声明、维护、检查和 Agent 协作边界，包括 manifest 契约、本机可用性诊断、安装提示，以及 Buildr 不接管工具安装和个人认证状态的约束。
## Requirements

### Requirement: Buildr 管理命令行工具清单
Buildr MUST 在 workspace 中维护一个或多个外部 Command catalog collections，用于定义组织认可工具的稳定身份和检查方式；Project requirements 与本机环境 MUST 保持为独立层。

#### Scenario: 维护默认 Command catalog
- **WHEN** 用户或 Agent 需要将某个外部命令行工具定义为可复用组织资产
- **THEN** Buildr MUST 默认使用 `commands/manifest.yml` 记录 Command definition
- **AND** definition MUST 至少表达工具 id、executable、用途和可选版本 probe
- **AND** MAY 表达工具名称、补充描述和最小安装提示

#### Scenario: 维护嵌套 Command collection
- **WHEN** 用户、Agent 或 Component 需要独立维护一组 Command definitions
- **THEN** Buildr MUST 支持使用 `commands/<collection>/manifest.yml` 保存该集合
- **AND** collection path MUST 保持在 workspace `commands/` 目录内

#### Scenario: Command definition 字段
- **WHEN** Buildr 读取或写入任一 `commands/**/manifest.yml`
- **THEN** definition MUST 使用 `id`、`executable`、`purpose`、可选 `name`、可选 `description`、可选 version probe 和可选 `installHint`
- **AND** Buildr MUST NOT 将 Project requirement、machine observation 或 `install` shell command 作为 definition 字段

#### Scenario: Buildr 不保存命令行工具主体
- **WHEN** Buildr 维护 Command catalog
- **THEN** Buildr MUST NOT 将 binary、登录态、token、cookie、license 或个人私有配置保存为 workspace 或 Project 资产

#### Scenario: 聚合相同 Command id
- **WHEN** 多个 workspace collections 声明相同 Command id
- **THEN** Buildr MUST 在 definition identity 字段完全一致时合并 catalog 并保留全部来源
- **AND** executable、version probe 或其他 identity 字段不一致时 MUST 报告 catalog definition conflict
- **AND** Project context MUST NOT 解决或覆盖该冲突

### Requirement: 命令行工具清单检查
Buildr MUST 提供分层 Command 检查能力，依次解析 workspace catalog、适用 requirements 和当前 machine observation。

#### Scenario: 检查 workspace defaults
- **WHEN** Agent 运行 `buildr commands check --target <dir> --json` 且未指定 Project
- **THEN** Buildr MUST 递归校验 `commands/**/manifest.yml` definitions
- **AND** MUST 只对 workspace default requirements 执行 machine check
- **AND** MUST NOT 聚合全部 Project requirements 为当前任务要求

#### Scenario: 检查 Project context
- **WHEN** Agent 运行 `buildr commands check --project <project> --target <dir> --json`
- **THEN** Buildr MUST 解析该 Project 的 `commands.yml`
- **AND** MUST 将 requirements 解析到 workspace catalog
- **AND** MUST 检查 required/optional 状态、合并版本约束和当前 machine observation

#### Scenario: 检查多个 Projects
- **WHEN** Agent 显式提供多个 Project contexts
- **THEN** Buildr MUST 按 Project Command requirements contract 合并要求
- **AND** 不兼容约束 MUST 在执行 machine probe 前报告为 context error

#### Scenario: 检查命令行工具版本
- **WHEN** 有效 requirement 声明版本约束
- **THEN** catalog definition MUST 提供结构化版本 probe
- **AND** Buildr MUST 使用声明的 executable 和参数检查当前版本是否满足合并约束
- **AND** Buildr MUST NOT 执行 manifest 中的任意 shell 字符串

#### Scenario: 版本无法判断
- **WHEN** Buildr 无法从版本 probe 输出中解析版本
- **THEN** Buildr MUST 将 machine observation 报告为 warning
- **AND** MUST NOT 将其分类为 catalog 或 Project requirement source error

#### Scenario: 输出安装提示
- **WHEN** required Command 缺失或版本不满足合并约束
- **THEN** JSON MUST 输出 catalog definition 的 `installHint`、requirements provenance 和 machine observation
- **AND** Buildr MUST NOT 自动安装该工具

#### Scenario: 分层错误状态
- **WHEN** catalog 不可解析、definition identity 冲突、Project requirement 无效或跨 Project约束不兼容
- **THEN** Buildr MUST 报告 error，并使用不同稳定 reason code
- **WHEN** binary 不存在、版本不满足或无法判断
- **THEN** Buildr MUST 报告 machine warning

### Requirement: 命令行工具不执行 render 或 install
Buildr MUST NOT 为 Command catalog 或 Project requirements 提供 runtime render 或 binary install 语义。

#### Scenario: Agent 处理 machine 差异
- **WHEN** 当前 machine 不满足有效 Command requirements
- **THEN** Agent MUST 使用分层检查结果向用户说明差异和来源
- **AND** Agent MAY 在用户授权下协作安装或升级工具
- **AND** Agent MUST NOT 声称 Buildr 已 render 或自动安装该工具

#### Scenario: 维护 definition 不触发环境修改
- **WHEN** Agent 运行 `buildr commands add/remove`
- **THEN** Buildr MUST 只维护选定 workspace catalog collection
- **AND** MUST NOT 自动修改 Project requirements、运行 machine check 或安装工具

### Requirement: 命令行工具清单维护命令
Buildr MUST 提供 Command catalog definition 的 add/remove 命令，并提供独立 Project requirement 维护入口或确定性文件契约。

#### Scenario: 添加到默认 catalog
- **WHEN** Agent 运行 `buildr commands add <id> --purpose <text> --target <dir>`
- **THEN** Buildr MUST 要求 target 是已初始化 workspace
- **AND** MUST 在 `commands/manifest.yml` 新增 definition
- **AND** 未提供 executable 时 MUST 使用 id

#### Scenario: 添加到指定 collection
- **WHEN** Agent 使用 `--collection <collection>` 添加 definition
- **THEN** Buildr MUST 只写入 `commands/<collection>/manifest.yml`
- **AND** MUST 拒绝绝对路径、父目录逃逸和 Component-owned collection

#### Scenario: 替换或重复 definition
- **WHEN** 目标 collection 已存在同 ID definition
- **THEN** 未提供 `--replace` 时 MUST 报告错误
- **AND** 提供 `--replace` 时 MUST 使用完整 definition 替换并保留原位置

#### Scenario: 删除仍被 Project 引用的 definition
- **WHEN** Agent 尝试删除仍被任一 Project requirement 引用的最后一个有效 Command definition
- **THEN** Buildr MUST 在写入前停止
- **AND** MUST 列出引用 Projects 和解除引用 nextActions

#### Scenario: 删除未引用 definition
- **WHEN** definition 没有 Project 或 workspace default requirement 引用
- **THEN** Buildr MUST 从目标 collection 删除该 definition
- **AND** MUST NOT 删除 binary、认证或本机配置
- **AND** 空清单 MUST 保留 `commands: []`

#### Scenario: 输出下一步行为
- **WHEN** Buildr 完成 Command catalog 或 Project requirement 维护
- **THEN** MUST 输出中文 Agent-readable 回执和被修改 source
- **AND** MUST 引导使用带明确 Project context 的 commands check 或 doctor
- **AND** MUST NOT 硬编码特定 Agent adapter 或安装命令

### Requirement: 命令行工具版本探测使用当前平台可执行入口
Buildr MUST 使用 PATH 解析得到的当前平台 executable 入口和声明的参数执行结构化版本 probe；当入口是 Windows `.cmd` 或 `.bat` shim 时，MUST 通过受限的平台启动适配执行该 shim，且 MUST NOT 执行 manifest 中的任意 shell 字符串。

#### Scenario: Windows npm shim 可读取版本
- **WHEN** Windows PATH 解析得到的 executable 是 `.cmd` 或 `.bat` 文件且 requirement 声明 version probe args
- **THEN** Buildr MUST 使用该解析路径执行版本 probe
- **AND** MUST 仅为该平台 shim 启用 Node 的受限 shell 适配，并继续使用 token 化 args 与有限超时
- **AND** 成功解析版本时 MUST 按正常 machine observation 检查约束

#### Scenario: 原生 executable 不经过 shell
- **WHEN** PATH 解析得到原生 executable 或当前平台不是 Windows shim 场景
- **THEN** Buildr MUST 直接使用 executable 和 token 化 args 执行 probe
- **AND** MUST NOT 接受或拼接 manifest、Project 或 workspace 提供的任意 shell command 字符串

#### Scenario: 版本探测进程无法启动
- **WHEN** Buildr 已找到 executable 但 probe 进程启动返回错误
- **THEN** machine observation MUST 使用 `command_version_probe_spawn_failed` reason
- **AND** finding MUST 使用 `commands.version_probe_spawn_failed` code，并包含可审计的错误码或消息
- **AND** MUST 将其报告为 machine warning，而不是 catalog 或 Project requirement source error

#### Scenario: 版本输出无法解析
- **WHEN** probe 进程已启动但 stdout/stderr 没有可解析版本
- **THEN** machine observation MUST 继续使用 `command_version_unknown` reason
- **AND** finding MUST 使用 `commands.version_unknown` code
- **AND** MUST 将其报告为 machine warning，而不是 executable missing 或 probe spawn failure
