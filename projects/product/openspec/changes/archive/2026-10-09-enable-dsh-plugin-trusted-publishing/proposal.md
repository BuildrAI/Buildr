## Why

独立 DSH 插件当前只有候选准备入口，未接入主包已采用的可信发布（Trusted Publishing）方式。长期 npm 发布令牌（Token）到期会增加本机维护成本，需将插件发布绑定到明确的 GitHub Actions 身份；不包含破坏性变更。

## What Changes

- 新增手动触发、插件独立版本的 GitHub 托管发布工作流（Workflow），受 `npm-production` 保护。
- 固定来源软件开发工具包（SDK）准备，复用插件构建、装载验证与唯一压缩包。
- 候选说明可跨作业搬运，发布前核对源码、包身份、版本、字节摘要和工作流身份。
- 补齐正式包仓库元数据，采用开放身份连接（OIDC），隔离长期凭据回退并核对发布回读。
- 更新独立插件发布说明和必要的失败／恢复测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `dsh-plugin-distribution`：增加独立可信发布身份、固定候选运输和认证边界。

## Impact

影响 `.github/workflows/publish-dsh-plugin.yml`、插件服务（Service）的发布及软件开发工具包（SDK）准备工具、正式包模板、相关测试与 `knowledge/docs/flows/dsh-plugin-release.md`。受影响测试选择同时更新 `.github/workflows/verify.yml` 的插件准备接线与主包服务（Service）维护的选择映射；主包发布执行器、权限及版本维持现有边界。不配置 npm 平台信任，不触发发布，不改现有凭据，不改变日常桌面插件。
