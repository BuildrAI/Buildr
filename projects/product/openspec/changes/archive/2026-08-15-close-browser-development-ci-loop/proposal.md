## Why

当前 Browser capability 会在部分已声明适用的 Buildr Web package/config 变化上选择 0 个 selector 并成功退出，同时 Browser 入口会先重建 tracked `web-dist`，使冻结目标在验证过程中被改写。开发 PR 又在 macOS 与 Windows 重复执行完整 affected plan，却没有闭合 Browser evidence，反馈成本与证明范围不匹配。

现在需要在保留 Candidate 完整拓扑和稳定 `Candidate gate` 的前提下，闭合 Browser 选择、构建产物与开发 CI 的证据链。本变更不包含破坏性 CLI 或数据兼容性变化。

## What Changes

- 为 Browser selector plan 增加闭合的 selected / not-applicable / blocked 语义；已声明适用的路径不得以 0 selector 成功。
- 让 Buildr Web package、lockfile、Vite/TypeScript 配置与共享构建入口选择明确 Browser selector，并保留页面级 affected selector。
- 在系统临时目录构建 Buildr Web，逐字节对比 tracked `web-dist` 后再运行生产托管 Browser smoke；验证过程不得改写冻结目标。
- 将面向 `dev` PR 的主 affected feedback 固定到 macOS，并在同一主反馈链中条件执行 affected Browser evidence；Windows 只执行 registry 明确声明的平台敏感 development owner。
- 保持 `dev → main` / 手工 Candidate 的 macOS/Windows shards、唯一 tarball、evidence aggregate、稳定 `Candidate gate` 名称与 macOS gate runner 不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `local-app-browser-verification`: 明确 Browser 选择闭合、临时构建与 tracked `web-dist` 一致性、冻结目标只读边界。
- `product-verification-quality`: 明确开发 PR 的 macOS 主 affected、条件 Browser evidence 与 Windows 平台敏感投影，且不改变 Candidate topology。

## Impact

- `services/buildr/test/verification/browser-selector-dispatcher.mjs`、Browser scripts 与相关 Contract/System 测试。
- `services/buildr-web/vite.config.ts` 与 Buildr Web staging build 校验入口。
- `services/buildr/test/verification/registry.mjs`、planner/changed 入口及 Windows development projection 测试。
- `projects/product/verification.yml` 的 Browser applicability/proves 语义。
- `.github/workflows/verify.yml` 的 `dev` PR feedback jobs；Candidate jobs 与 `Candidate gate` 保持兼容。
