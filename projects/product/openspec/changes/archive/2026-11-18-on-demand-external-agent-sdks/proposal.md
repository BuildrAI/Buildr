## Why

Buildr Development（`@buildr-ai/buildr`）和 Buildr Harness（`@buildr-ai/buildr-harness`）当前在产品运行负载中直接随包捆绑了全部外部智能体厂商 SDK（`@anthropic-ai/claude-agent-sdk`、`@qoder-ai/qoder-agent-sdk`、`@deepseek-ai/cordis` 及全部 `@deepseek-ai/dsh-*` 包），既显著增加了主包体积，又将采用各厂商专有条款的 SDK 纳入产品本身的分发许可边界。按照产品发行定位，产品包应只交付 Buildr 自有组件与核心开源原语，外部智能体程序及其配套 SDK 应由用户在启用对应执行器时按需安装到本机受管程序目录。

## What Changes

- 将 `@anthropic-ai/claude-agent-sdk`、`@qoder-ai/qoder-agent-sdk`、`@deepseek-ai/cordis` 及 12 个 `@deepseek-ai/dsh-*` 客户端包从 `buildr-harness` 的生产 `dependencies` 移至 `devDependencies`，不再随 `@buildr-ai/buildr` 或 `@buildr-ai/buildr-harness` 安装包分发。
- 扩展 `NativeProgramManager` 与 `ProgramDistribution`，允许为 npm 分发的智能体程序声明随附安装并校验的 `companionPackages`（及可选依赖策略 `omitOptionalDependencies`）；发现或准备已有受管目录时同时核对配套 SDK 完整性，缺项允许用户重新准备原子补齐。
- 将 `claude`、`qoder` 与 `dsh` 执行器改为从所选受管程序目录内动态解析配套 SDK（受管目录缺项时显式报错拒绝，保留独立夹具的回退兼容），移除静默静态顶层依赖与跨包回退。
- 收紧正式打包校验，禁止 `@anthropic-ai/*`、`@qoder-ai/*`、`@deepseek-ai/*` 进入主包运行目录；补齐前端与开源运行依赖许可证文本，登记开放源码闭包发行决定与明确平台支持声明（`darwin: candidate`、`win32: not-verified`）。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `harness-independent-distribution`: 产品安装包仅分发 Buildr 自有产物及核心开源依赖；外部智能体程序及其配套 SDK 改为用户准备对应执行器时按需安装至受管程序目录。

## Impact

- `projects/product/services/buildr-harness/package.json`、`package-lock.json` 与执行器代码（`program-policy.ts`、`program-manager.ts`、`claude/`、`qoder/`、`dsh/`）。
- `projects/product/services/buildr-harness/tools/collect-third-party.ts`、`resources/distribution-decisions.json` 与 `projects/product/services/buildr/tools/build/platform-support.json`。
- `projects/product/services/buildr-web/package.json`、`LICENSE` 及 `skills/buildr-release/scripts/release-artifact.ts`。
- 对应交付、打包与程序准备单元测试、集成测试和架构/许可说明文档。
