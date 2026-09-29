## Why

当前 DSH 插件只在 Buildr 服务的构建目录生成私有、默认禁用的组合包；Buildr 正式候选还要求重新构建并捆入这份产物。用户无法仅凭公开包名让智能体安装插件，插件未变化时也被迫跟随 Buildr 发版。需要把插件作为独立交付物，同时修复 DSH 重启后重复打开页面的问题。

## What Changes

- 将 DSH 桌面插件的源码、构建、测试与版本归入独立的产品服务（Service）；Buildr 主体继续提供公开安装身份、健康状态与启动器（Launcher）。
- 产出默认启用、无本机绑定和无安装脚本的公开 npm 组合包，由 DSH 自身的插件管理入口安装；正常安装不执行 `buildr runtime dsh-plugin prepare`。
- 插件版本及发布与 Buildr 主包分开；只有插件代码、交付契约或 DSH 兼容基线变化时才准备新插件版本。Buildr 发版前核对插件是否有未发布变化，未变化则复用已发布版本。
- 正式版与开发版按钮在客户端重启后复认各自创建且仍存在、健康地址未变的右侧页面。DSH 公开接口未提供当前浏览器地址时，不认领用户手动打开的标签。
- **BREAKING**：Buildr 正式包不再以内嵌 DSH 插件产物作为正常安装来源；旧 `prepare` 路径从公开安装流程退出，既有 DSH 配置档仍由 DSH 管理。

## Capabilities

### New Capabilities

- `dsh-plugin-distribution`: 独立插件包、安装、版本跟随、页面复用及验证边界。

### Modified Capabilities

- `product-source-layout`: DSH 插件由独立 Service 拥有，Buildr Service 仅保留主体接口。

## Impact

影响 `projects/product/services/buildr/` 的插件源码、命令与候选打包路径，新增插件 Service 和独立包元数据，调整 Product 服务组成、发布流程说明与相关测试。公开发布需要在版本和产物确定后按产品发布规则单独授权；本变更的实现、构建和安装试验不代表已经公开发布或真实桌面验收。
