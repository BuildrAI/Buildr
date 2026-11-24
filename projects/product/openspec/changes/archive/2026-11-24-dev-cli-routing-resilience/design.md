## Context

详见 [proposal.md](proposal.md) 与[任务说明](@task/dev-cli-routing-resilience)。当前机器全局 `buildr` 归属 `@buildr-ai/buildr` npm 安装，通过独立打包为 Node 18 CJS 的 `workspace-cli-router.cjs` 按工作空间登记分流到开发源码；Harness 执行器进程在隔离环境下启动智能体工具（Antigravity、Codex、Claude、DSH、Qoder），其 `PATH` 默认沿用宿主机全局 `buildr`。

## Goals / Non-Goals

**Goals:**
- 让外部终端与第三方命令行工具（如 GrokBot）在未来桌面应用改名或迁移时不再因为 `.app` 路径变化而断链。
- 让 `development` 配置域下 Harness 拉起的智能体会话彻底脱离对全局 npm `buildr` 安装的依赖，直接执行已验证的本机开发源码，同时保留全局 `update`/`installation`/`web launcher` 与 `released` 工作空间的正常使用。
- 让开发启动器安装与状态检查能够提前发现滞后的本机全局 npm 路由器并向开发者提示更新。

**Non-Goals:**
- 不改变机器全局 `buildr` 唯一归属 npm 的既有架构边界，不创建额外全局命令行别名或修改用户全局 `$PATH`。
- 不在安装开发启动器时自动执行 `npm install` 或强制阻断开发安装；兼容预警保持只读与非阻断。
- 不将 `buildr` 会话垫片写入开发启动器自身的 `tools/development/programs/`，以保持 `macos-launcher-boundaries` 边界隔离。

## Decisions

1. **稳定开发来源登记落在开发版共享数据根目录（`<developmentDataRoot>/development-source.json`）**
   - **取舍**：`developmentDataRoot`（如 `~/Library/Application Support/Buildr Dev`）本身承载 `workspace-registry.json` 与 `conversations.sqlite`，属于跨产品名称演进稳定的母品牌共享数据域。把 `buildr.development-source/v1` 放在同一数据域中，保证“能查到开发版工作空间登记就一定能查到稳定开发来源”。
   - **规则**：存在该文件时作为最高优先级权威来源，格式损坏或身份非法时立即 fail closed，绝不静默回退桌面启动器以免误用旧版本；仅当该文件不存在时兼容回退 `Buildr Development Dev` 与旧名 `Buildr Web Dev` 启动器登记。卸载开发启动器时仅在能证明 `launcherTarget` 归属当前安装槽位时清理该文件。

2. **开发版 Harness 会话通过执行器私有工具链目录（`<dataRoot>/agent-service/toolchains/dev-cli-bin/`）前置 `buildr` 入口**
   - **取舍**：在 `ExecutorStorage.options` 统一注入，使得所有执行器（Antigravity、Codex、Claude、DSH、Qoder）无需逐个重复适配，且与 `tools/development/programs/` 完全隔离；仅当 `profileId === 'development'` 且当前数据域存在 `development-source.json`（或仅在默认开发数据域时回退检查平台开发启动器）才启用，避免隔离测试与 `released` 配置域泄漏或受到宿主开发安装影响。
   - **防递归分发**：会话 `buildr` 入口在委派下游全局 `buildr`（针对全局安装管理命令或独占归属 `released` 的工作空间）时，先从子进程 `PATH` 中精确剥离自身 `dev-cli-bin` 目录再查找下游可执行文件；对归属 `development` 及未登记目录，直接校验开发来源并执行 `<sourceRoot>/bin/buildr.mjs`，确保开发版内新建工作空间初始化、任务与工作树操作完全自闭环。
   - **依赖边界**：Harness 测试 `engineering-boundaries.test.ts` 禁止 `services/buildr-harness/src/` 导入 `@buildr-ai/buildr` 且锁定 `src/profile.ts` 轻量性，因此会话路由器（`process/development-cli-shim.ts`）与环境注入器（`storage/development-cli-environment.ts`）纯用 Node 内置能力与 Harness 既有域工具实现，保持零跨包耦合。

3. **旧版全局 npm CLI 兼容预警通过配对 `released` 数据域只读检查，放入独立字段与 `stderr`**
   - **取舍**：通过 `oppositeWebProfile` 定位配对 `released` 数据域中的 `product-installations.json`，保证测试使用隔离 `BUILDR_APP_DATA_DIR` 时不会误读宿主机真实安装记录。兼容性依据检查最新有效 npm 安装对应 `runtime/workspace-cli-router.cjs` 是否识别 `buildr.development-source/v1` / `Buildr Development Dev`。结果输出在 `globalCliCompatibility` 与 `warnings`（保留 `diagnostics` 专责启动器本身完整性），命令行 `manage.ts install` 不兼容时仅向 `stderr` 输出预警而保持 `stdout` 结构化 JSON 干净。

## Risks / Trade-offs

- **[Risk] 外部终端仍依赖一次全局 npm 更新才能切入 `development-source.json` 稳定协议** → 在 `installLauncher` 与 `launcherStatus` 中增加显式兼容探测与更新提示，缩短错配窗口。
- **[Risk] `development-source.json` 被手工破坏后与 `.app` 登记共存导致失败** → 按“权威存在即严格校验、禁止静默降级”原则明确报错并给出重新运行 `npm run install:development` 的恢复提示。
- **[Risk] 新旧测试夹具污染宿主机安装状态** → `ExecutorStorage` 注入与 `manage.ts` 兼容检查均严格以当前生效的 `dataRoot` / `oppositeWebProfile` 为界，只在显式匹配默认平台根时回退平台启动器。
