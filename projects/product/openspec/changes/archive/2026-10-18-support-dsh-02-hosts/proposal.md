## Why

DSH 从 0.2.0-rc.2 升级到 0.2.1-rc.2 后，Buildr 开发插件被精确宿主依赖（peer dependency）拒绝加载。同一 0.2.x 系列升级应保持可用，本次扩大版本兼容范围，无破坏性变更。

## What Changes

- 正式版、开发版及其嵌套组合统一声明支持 DSH `>=0.2.0-0 <0.3.0-0`，包含 0.2.x 预发布版。
- 同步所有 DSH 系列宿主依赖（peer dependency），避免内层插件保留精确限制。
- 软件开发工具包（SDK）的构建基线、提交和补丁摘要继续精确核验。
- 验证 0.2.1-rc.2 与 0.2.x 边界，不涉及公开发布或日常桌面安装。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `dsh-plugin-distribution`：明确 0.2.x 宿主兼容范围及构建来源精确身份的独立边界。

## Impact

影响 `projects/product/services/dsh-plugin` 的插件构建、正式与开发组合、源码软件开发工具包（SDK）内宿主包、预设适配器（Preset Adapter）及回归检查。现有构建、测试入口与环境要求不变。任务说明见[任务说明](@task/dsh-host-compatibility)。
