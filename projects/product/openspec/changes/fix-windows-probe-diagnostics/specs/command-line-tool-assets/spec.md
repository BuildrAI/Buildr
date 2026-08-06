## MODIFIED Requirements

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
