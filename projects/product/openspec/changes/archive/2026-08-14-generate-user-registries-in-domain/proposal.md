## Why

Buildr 当前把 `.buildr/workspace.yml`、`projects/manifest.yml`、Project `services/manifest.yml` 等用户态配置源放进 npm 发布包，其中部分文件已经被 Domain writer 取代但仍随包分发。发布包必须只携带产品定义和内容资产；Workspace、Project、Service 的配置与 registry 应在初始化、创建或同步时由对应功能生成，避免把开发仓内部基线误当成产品资源。

## What Changes

- 明确区分产品随包定义/内容资产与用户 Workspace 持久化配置，禁止后者作为 `package/targets/workspace/` 物理源进入 npm tarball。
- `init` 通过 canonical writer 生成 Workspace metadata、Project registry 及 Workspace 级空 registry；产品 Builtin 则从 `package/manifest.yml` 和 Component 定义收敛到生成后的 registry。
- `project create` 与 `sync/update` 通过 canonical writer 生成缺失的 Project 配置和 Service registry，保留已有用户内容，不从开发基线复制。
- 删除不再消费的 Workspace/Project 配置模板和对应映射、占位变量、特殊跳过分支。
- 为 source checkout、Application Payload 和 npm tarball 增加禁止用户态配置源的契约验证，同时保留初始化、同步和创建行为对等验证。
- 不改变既有用户 Workspace 中这些配置文件的路径或 schema；升级只补齐缺失文件，不覆盖有效用户事实，因此不构成对公开 CLI 或数据格式的破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-package-assets`: 发布边界不再包含用户态配置源；初始化、Project 创建与同步必须从产品声明和 canonical writer 生成所需配置。

## Impact

- OpenSpec：`buildr-package-assets` 的发布边界、初始化和 Project baseline 契约。
- 实现：package manifest 解析、Workspace 初始化、Project baseline 修复、Builtin/Component 收敛及相关 canonical renderers。
- 发布物：`package/targets/workspace/`、Application Payload 和 npm tarball 的文件清单。
- 验证：package static check、初始化/同步/Project 创建测试、release artifact/tarball 内容断言。
