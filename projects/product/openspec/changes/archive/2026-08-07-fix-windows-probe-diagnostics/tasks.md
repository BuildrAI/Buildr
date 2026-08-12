## 1. Command 版本探测

- [x] 1.1 在 `commands.mjs` 提取可测试的版本 probe invocation helper，使用 PATH 解析路径；仅 Windows `.cmd`/`.bat` 启用受限 shim 启动适配，其他入口保持无 shell。
- [x] 1.2 更新版本 probe 状态映射，区分 spawn error 与版本输出不可解析，写入稳定 reason/code、错误证据和现有 warning 层级。
- [x] 1.3 为 Windows shim 调用形状、解析路径使用和 spawn failure/unknown 分支补充领域回归测试。

## 2. Runtime adapter 平台探测

- [x] 2.1 在 `adapter-contract.mjs` 增加按平台选择 command/manual probe 的受约束 helper，并让 TRAE Work、WorkBuddy 在非 macOS 使用 manual guidance。
- [x] 2.2 让 `runEnvironmentProbe` 支持注入 spawn 实现，验证 manual 状态不会进入环境 missing warning；保持 macOS command probe 行为。
- [x] 2.3 补充 adapter contract 与 runtime check 回归测试，覆盖 darwin command、非 darwin manual、manual guidance 和既有 projection 诊断不变。
- [x] 2.4 更新 Agent runtime adapter 文档，明确 macOS 自动 probe 与非 macOS manual guidance 的差异。

## 3. 验证与收敛

- [x] 3.1 运行受影响测试与 `npm run test:changed`，检查 lint/格式和 OpenSpec strict validate。
- [x] 3.2 运行 `current-knowledge reconcile`；如有变化更新对应 evidence，并完成 Task Development candidate handoff 所需审查材料。
