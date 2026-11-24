## 1. OpenSpec 与基础契约

- [x] 1.1 创建 `dev-cli-routing-resilience` OpenSpec 变更并完成 `proposal.md`、`design.md`、三份 delta specs 与 `tasks.md`
- [x] 1.2 运行 `openspec validate dev-cli-routing-resilience --strict` 与 `buildr openspec convergence preflight` 确认无语法或并发规范冲突

## 2. 稳定开发来源登记与路由优先读取（`services/buildr`）

- [x] 2.1 在 `services/buildr/src/modules/installation/contracts/web-profile.ts` 导出 `DEVELOPMENT_SOURCE_SCHEMA`、`DEVELOPMENT_SOURCE_FILENAME` 与 `developmentSourceFile`
- [x] 2.2 更新 `services/buildr/src/modules/installation/application/workspace-cli-routing.ts`，优先读取并严格校验 `development-source.json`，不存在时回退读取开发启动器登记，保持 `harness-router-isolation.test.ts` 通过
- [x] 2.3 更新 `services/buildr/src/modules/installation/application/product-installation-status.ts`，在未显式指定 `developmentLauncherRoot` 时优先从 `development-source.json` 读取开发来源，保持原有状态与测试契约兼容

## 3. 开发启动器原子维护登记与旧版全局 CLI 预警（`services/buildr`）

- [x] 3.1 更新 `services/buildr/tools/build/launcher/manage.ts`，在 `installLauncher` 校验成功后原子写入 `development-source.json`，在 `uninstallLauncher` 时安全清理归属匹配的 `development-source.json`
- [x] 3.2 在 `services/buildr/tools/build/launcher/manage.ts` 增加配对发布版数据域全局 npm 路由只读兼容探测（`globalCliCompatibility` 与 `warnings`），并在 `manage.ts install` 不兼容时向 `stderr` 输出非阻断警告
- [x] 3.3 更新 `services/buildr/docs/cli-architecture.md` 记录稳定来源登记与开发会话 CLI 直连架构边界

## 4. 开发版 Harness 会话直连本机开发 CLI（`services/buildr-harness`）

- [x] 4.1 通过 `AgentServiceOptions`、`server.ts`、`agent-service.ts`、`connection-application.ts` 将 `profileId` 传入 `ExecutorStorage`
- [x] 4.2 实现 `services/buildr-harness/src/process/development-cli-shim.ts` 与 `services/buildr-harness/src/storage/development-cli-environment.ts`，在 `development` 配置域且存在开发来源登记时于 `ExecutorStorage.options` 注入私有 `dev-cli-bin` 到会话 `PATH` 最前，并完成三路分发、防递归及 fail-closed 保护

## 5. 自动化测试与全量检查

- [x] 5.1 在 `services/buildr/test/integration/workspace-cli-routing.test.ts` 补充 `development-source.json` 优先读取、无桌面启动器路由与损坏 fail-closed 测试
- [x] 5.2 在 `services/buildr/test/e2e/buildr-web-launcher.test.ts` 补充 `development-source.json` 写入/归属清理与全局 npm CLI 兼容检查测试
- [x] 5.3 新增 `services/buildr-harness/test/integration/development-cli-shim.test.ts` 并纳入 `services/buildr-harness/tools/testing/verification-checks.ts`，覆盖 `released` 不注入、无登记隔离不注入、开发直连、下游防递归委派及 fail-closed 行为
- [x] 5.4 在工作树运行 `agent:prepare`、`npm run check`（28/29 通过，本任务相关类型与测试零报错；仅 `dev` 基线 `magpie-model-provider.test.ts:107` 存在预存类型报错）、全部直接相关集成与启动器 E2E 测试（`buildr` 64/64、`buildr-harness` 54/54）及最终 `openspec validate --strict` 与 `openspec convergence preflight`
