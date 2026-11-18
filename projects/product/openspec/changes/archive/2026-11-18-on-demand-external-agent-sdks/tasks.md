## 1. 剥离随包外部 SDK 与按需安装

- [x] 1.1 将 `@anthropic-ai/claude-agent-sdk`、`@qoder-ai/qoder-agent-sdk`、`@deepseek-ai/cordis` 及全部 `@deepseek-ai/dsh-*` 从 `buildr-harness` 的 `dependencies` 移至 `devDependencies` 并更新 `package-lock.json`。
- [x] 1.2 在 `program-policy.ts`、`claude/program.ts`、`dsh/program.ts` 和 `program-manager.ts` 实现 `companionPackages`、`omitOptionalDependencies` 安装与完整性校验，以及缺项原子补齐。
- [x] 1.3 更新 `claude`（新增 `sdk-pair.ts`）、`qoder/worker.ts` 与 `dsh/client.ts`，从受管程序目录动态解析配套 SDK，禁止受管程序缺失配套 SDK 时继续执行。

## 2. 打包边界、开源许可证据与版本材料

- [x] 2.1 收紧 `release-artifact.ts` 清单校验，禁止外部厂商 SDK 进入发布压缩包；同步更新 `agent-service-delivery.test.ts` 与 `preparation.test.ts`。
- [x] 2.2 补齐 `buildr-web` 的 `MIT` 许可及 `collect-third-party.ts` 对无独立 `LICENSE` 文件的开源包元数据证据收集，录入开源依赖闭包 `distribution-decisions.json` 与 `platform-support.json`。
- [x] 2.3 更新 `0.1.0-rc.60` 版本号、`CHANGELOG.md` 及第三方/接入架构说明文档，并完成静态、单元与受影响集成验证。
