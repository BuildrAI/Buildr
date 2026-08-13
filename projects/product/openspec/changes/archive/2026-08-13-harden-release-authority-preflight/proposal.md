## Why

Buildr 的 release checklist 已要求在创建 tag 前检查发布权威元组，但当前 release contract、convergence checker 和测试只分别核对仓库或 workflow 字符串，不能证明 npm Trusted Publisher 当前配置与 GitHub OIDC claims 一致。rc.8 已实际暴露过 owner 漂移直到 `npm publish` 才失败的问题，而 npm 现在提供可认证读取的 `npm trust list --json`，适合把这项人工经验收敛为确定性门禁。

## What Changes

- 在 npm-only release contract 中声明唯一的发布权威元组：provider、GitHub repository、workflow filename、Environment 和允许的 npm action。
- 新增 tag 前只读 preflight，交叉核对 package metadata、Git remote、GitHub repository、workflow、Environment 与 npm Trusted Publisher current 配置；任一不一致、无法认证读取或工具版本不支持时 fail closed。
- 将 preflight 接入 release preparation/convergence 边界，只有完整 authority evidence 为 `ready` 才允许进入 tag 授权。
- 为 OIDC 相关 `E401`、`ENEEDAUTH`、`E404` publish 失败增加 expected authority 与最小恢复路径诊断，同时保留原始 npm 失败和已有 tag，不回退本机发布。
- 增加纯函数、fixture、CLI 与 workflow contract 测试；不读取或修改真实凭证，不创建 tag，不执行真实 publish，也不修改 npm/GitHub 控制面。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `open-source-release-governance`: 增加机器可读发布权威元组、tag 前实时一致性门禁和 OIDC publish 失败诊断要求。

## Impact

- `projects/product/services/buildr/scripts/release/` 中的 release contract、authority preflight、convergence 与 trusted publish wrapper。
- `.github/workflows/publish.yml` 的 publish 入口和静态契约验证。
- `skills/buildr-release/`、release checklist、OpenSpec canonical release spec 与当前发布流程知识。
- 需要 authenticated npm maintainer session 才能读取 live Trusted Publisher；缺少登录态只形成明确 blocked evidence，不触发配置写入。
