## Context

独立交付与许可检查规范要求真实分发物只携带已取得许可证明与负责人批准的组件。此前 `@buildr-ai/buildr-harness` 的 `dependencies` 列出了 Claude、Qoder 与 DSH 客户端包，导致打包器将上述 SDK 完整复制进 `@buildr-ai/buildr` 与 `@buildr-ai/buildr-harness` tarball。

## Goals / Non-Goals

- **Goals**:
  - 仅在产品包内保留 `ajv`、`cacache`、`ws` 等核心开源运行时依赖，彻底停止随包分发 `@anthropic-ai/claude-agent-sdk`、`@qoder-ai/qoder-agent-sdk` 和 `@deepseek-ai/*`。
  - 在用户选择准备 `claude-code`、`qoder` 或 `dsh` 时，由 `NativeProgramManager` 通过 npm 一次性将主程序与配套 SDK 安装进同一个独立受管目录 `programs/<provider>/package-<version>-<platform>-<arch>`。
  - 执行器加载配套 SDK 时严格绑定同一受管安装目录，避免混用跨目录或旧版本 SDK。
- **Non-Goals**:
  - 不改变现有桌面/全局程序禁止自动接管的原则，不替用户接受任何厂商服务条款。
  - 不在此变更内重写全量搜索工具 `@vscode/ripgrep-universal` 或前端静态资源构建架构。

## Decisions

1. **配套 SDK 跟随主程序同目录安装与校验**
   - `ProgramDistribution`（`kind: 'npm'`）新增 `companionPackages`（静态数组或按版本派生函数）与 `omitOptionalDependencies` 选项。
   - `claudeProgramPolicy` 声明配套 `@anthropic-ai/claude-agent-sdk@0.3.322` 并启用 `--omit=optional`，只拉取纯 JS SDK 而不重复安装 8 套跨平台二进制兜底包。
   - `dshProgramPolicy` 根据所选版本动态声明配套 `@deepseek-ai/cordis@4.0.5` 及全部 12 个同版本 `@deepseek-ai/dsh-*` 客户端包；`qoderProgramPolicy` 安装的 `@qoder-ai/qoder-agent-sdk` 本身即为配套 SDK。
   - `NativeProgramManager` 在 `preparedExecutable`、`discover` 与 `installFromNpm` 中均校验 `destination/node_modules/<pkg>/package.json` 真实存在、非符号链接且版本匹配；已存在但缺配套 SDK 的受管目录不再被当作就绪候选，允许通过重新准备原子替换补齐。

2. **执行器动态解析配套 SDK**
   - `claude/sdk-pair.ts`、`qoder/sdk-pair.ts` 与 `dsh/client.ts` 从 `executable` 向上定位所在受管程序根目录并解析对应配套 SDK；位于 `programs/<provider>/` 下的受管程序若缺少对应 SDK，立即报错拒绝，不回退到全局或宿主环境模块。
   - 位于开发源码测试中的独立替身脚本仍允许从开发 `node_modules` 解析以保持本地开发/集成测试可运行。

3. **打包守卫与开源许可证据闭环**
   - `release-artifact.ts` 移除对随包 `@qoder-ai/qoder-agent-sdk` 与 `@deepseek-ai/dsh-client-connection` 文件的必含要求，改为显式禁止 `node_modules/@anthropic-ai`、`@qoder-ai`、`@deepseek-ai` 进入产品 tarball。
   - 为 `buildr-web` 补齐 `MIT` 声明与 `LICENSE` 文件，并让 `collect-third-party.ts` 对声明了合法开源协议但未附带独立 `LICENSE` 文件的第三方包保留其 `package.json`（及 `README.md`）作为来源摘要证据。

## Risks / Trade-offs

- **风险**：存量用户此前装过仅含二进制（或旧版布局）的受管目录，升级到新版本后不再有随包内置 SDK。
  - **缓解**：`discover` 主动识别配套 SDK 缺失并触发 `installation-required`（保持提示明确、支持重新准备一键原子补齐），同时 `claude/index.ts` 与 `dsh/client.ts` 给出清晰错误码避免静默崩溃。
- **风险**：`dsh` 或 `claude-code` 按需安装耗时略增。
  - **缓解**：仅在用户实际选择使用对应智能体时触发安装，并沿用 `toolchains/cache` 与 `omitOptionalDependencies` 控制下载体量。
