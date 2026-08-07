## Why

正式 `verification run` 当前能够启动 Project capability，但某些 capability 还依赖未声明的运行时输入。`product.browser-smoke` 要求调用方手工提供 `BUILDR_CHANGED_PATHS_JSON`，导致正式 Verification 在测试启动前失败；同时 `run`、`task verification inspect/record` 的参数边界容易被混用，target 漂移也缺少可定位诊断。现在修复可以把 Browser 验证从“命令可登记”收敛为“正式入口可独立执行”，减少误报和人工恢复。

## What Changes

- 明确并强化 `verification run`、`task verification inspect`、`task verification record` 的 CLI/Skill 参数边界；`--declaration-root` 只属于 `inspect/record`，误用于 `run` 时返回定向诊断。
- 让 Browser changed dispatcher 在没有显式 `BUILDR_CHANGED_PATHS_JSON` 时从当前 Git verification base 推导 changed paths；显式环境变量仍作为覆盖入口。
- 在正式 Verification 启动前和结束后区分 capability 失败、输入缺失与 target 内容漂移，并返回可定位的漂移摘要。
- 补充 CLI、dispatcher、Project declaration 和 target stability 的 contract/system tests。
- 保持通用 `verification run` 不选择 Product-specific applicability、不写 current Result、不引入新的 worker 调度；保持 Browser 业务场景覆盖不变。

## Capabilities

### New Capabilities

无。此次改变的是既有 Verification 执行与 Product changed verification 的契约闭合。

### Modified Capabilities

- `task-verification`: 明确 execution input、CLI 参数边界与 target drift 的 transient 诊断语义。
- `product-verification-quality`: 要求 changed Browser capability 在正式入口中拥有可解析的 changed-path 输入，并保持显式路径选择与 Git 推导路径的一致性。

## Impact

- 代码：`src/interfaces/cli`、`src/application/verification`、`test/verification/browser-selector-dispatcher.mjs` 及相关测试。
- 声明与文档：`projects/product/verification.yml`、Task Verification Skill/CLI help，以及对应 OpenSpec delta specs。
- 运行时：只影响 transient Verification execution evidence；不改变 Task Verification current Result schema、Task Development/Candidate/Finish authority 或 Local App 业务行为。
- 测试：新增参数误用、Git fallback、显式 override、缺失 base、target drift 诊断和正式 Browser capability execution 覆盖。
