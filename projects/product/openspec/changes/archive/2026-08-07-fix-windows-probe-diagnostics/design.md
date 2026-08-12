## Context

Command catalog 的 PATH 解析已经能在 Windows 找到 npm 生成的 `.cmd` shim，但版本探测仍把解析到的路径当作普通 executable 直接启动；这让“已找到”与“能读取版本”出现平台相关的不一致。另一方面，TRAE Work 与 WorkBuddy 的 desktop checker 把 macOS `defaults` 写死在 descriptor 中，runtime check 在 Windows/Linux 上会把不适用的命令失败当成安装缺失。

Environment probe 的安全边界仍然成立：probe 只能来自产品静态 descriptor、参数必须是 token 数组且有有限超时。Windows shim 的启动例外只允许使用 Node 为该平台提供的 shell 适配，不接受 manifest 或 workspace 提供的任意 shell 字符串。

## Goals / Non-Goals

**Goals:**

- 版本探测使用已解析的 executable 路径；Windows `.cmd`/`.bat` shim 通过受限的平台启动适配正确执行。
- 将“进程无法启动”和“进程已启动但输出无法解析”分别表达为稳定诊断状态。
- TRAE Work、WorkBuddy 仅在 macOS 执行 `defaults`；其他平台改为人工确认 guidance，不生成自动安装缺失告警。
- 用纯函数和运行时回归测试覆盖 Windows shim 调用策略、平台 probe 选择、manual probe 语义及既有 macOS 行为。

**Non-Goals:**

- 不自动安装或升级任何外部 CLI/桌面应用。
- 不执行真实 Agent 会话 smoke，不改变 projection 的 missing/stale/conflict 比较。
- 不引入 scheduler、第二 checker writer 或新的运行时存储。

## Decisions

### 1. 使用解析路径并保留 token 化参数

Command 版本 probe 将把 `findExecutableOnPath()` 的返回值传给启动器，而不是再次使用 manifest 中的裸 executable 名称。Windows 下仅当解析路径后缀为 `.cmd` 或 `.bat` 时设置 `shell: true`，由 Node 负责平台 shim 调用；其他平台和原生 Windows executable 继续 `shell: false`。Buildr 不构造或执行任意 shell 字符串，声明的 args 仍保持 token 数组和现有超时。

探测启动结果先检查 `result.error`。有错误时记录 `command_version_probe_spawn_failed` / `commands.version_probe_spawn_failed`，并保留错误码与消息；没有启动错误但输出不能解析时继续使用 `command_version_unknown` / `commands.version_unknown`。

### 2. 平台选择 runtime environment probe

新增一个按 `platform` 选择 command/manual probe 的小型 descriptor helper。TRAE Work 与 WorkBuddy 在 `darwin` 选择现有 `defaults` 安装与版本 probe；在其他平台选择 `manual`，guidance 指向应用 About/安装信息。runtime checker 已有 manual 分支，只展示 guidance，不进入 `environmentFindings` 的 missing 分支，因此不会把平台不适用命令变成 `userActionRequired` warning。

### 3. 以可替换依赖测试探测边界

`runEnvironmentProbe` 接受可选的 `spawn` 实现，默认仍使用 `spawnSync`；命令领域和 adapter contract 暴露最小纯 helper 供测试注入 `platform`。测试只验证调用形状、状态映射和 descriptor 选择，不依赖当前机器安装某个 Agent 或修改 `process.platform`。

## Risks / Trade-offs

- Windows shell 适配扩大了 shim 的可执行范围 → 仅对 PATH 解析得到的 `.cmd`/`.bat` 启用，仍禁止 manifest shell 字符串，并保留有限超时。
- 非 macOS 不再自动验证 desktop 安装 → 输出 manual guidance，避免错误的 warning；真实安装事实仍由用户确认。
- 新增 spawn failure reason code 可能改变下游文案 → 保留既有 warning 层级和 `commands.version_unknown` 语义，仅细化不可启动分支。

## Migration Plan

无需数据迁移。升级后重新运行 `buildr commands check` 或 `buildr runtime check` 即使用新探测逻辑；已有 manifest、投影文件和运行时存储保持不变。

## Open Questions

无。
