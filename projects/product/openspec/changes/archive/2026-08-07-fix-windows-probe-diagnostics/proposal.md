## Why

Windows 的 npm 全局 CLI 通常通过 `.cmd` shim 提供。Buildr 当前虽然能发现该 shim，却用无 shell 的裸 executable 做版本探测，导致已安装且版本正确的 OpenSpec 被误报为版本未知。与此同时，WorkBuddy 和 TRAE Work 的 checker 固定调用 macOS `defaults`，使 Windows/Linux 的 runtime projection 因平台不存在的探测命令产生不可消除的安装告警。当前 dev 已进入 rc.7，Windows 诊断仍会降低 doctor readiness，应该在继续交付前修正。

## What Changes

- 为 Command 版本探测增加跨平台 executable 调用策略，Windows `.cmd` shim 可以被正确执行。
- 区分版本探测进程启动失败与版本输出无法解析，提供准确的 reason code 和诊断信息。
- 将 WorkBuddy、TRAE Work 的环境探测按平台选择；没有可靠跨平台自动探测时使用带 guidance 的 `manual` probe。
- 增加 Windows command probe、跨平台 runtime probe 和既有行为回归测试。
- 不改变 Command catalog 的安装责任边界，不自动安装外部 CLI，也不改变真实 projection missing/stale/conflict 的诊断。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `command-line-tool-assets`：Command 版本探测必须正确处理当前平台的可执行入口，并区分进程启动失败与输出不可解析。
- `workspace-first-runtime-projection`：runtime checker 的环境探测必须符合目标平台；无稳定安全自动探测时必须使用人工确认 probe，不能报告平台不适用命令的安装失败。

## Impact

- 影响 `src/application/domains/commands.mjs` 的 machine version probe 与 `src/infrastructure/runtime/check-runtime.mjs` 的 probe 执行/诊断。
- 影响 `src/infrastructure/runtime/adapter-contract.mjs` 中 WorkBuddy、TRAE Work 的静态 checker descriptor。
- 影响 Buildr doctor、`commands check`、`runtime check` 的 warning reason code、环境状态和 readiness 派生结果。
- 不新增外部依赖；只使用 Node 已有的 child-process 与平台信息。
