# cindy-desktop-integration Specification

## Purpose
TBD - created by archiving change buildr-cindy-theme. Update Purpose after archive.

## Requirements

### Requirement: 配色和源码归属

Buildr 嵌入页 SHALL 使用 Cindy 提供的语义颜色。Buildr Cindy 插件 SHALL 独立打包，并复用已运行的 Buildr Web。

#### Scenario: 在 Cindy 中切换主题

- **WHEN** 当前插件页收到新的宿主语义颜色
- **THEN** 正式页面更新受主题控制的表面，无需导航或重载

#### Scenario: 独立访问

- **WHEN** 用户从浏览器直接打开 Buildr Web
- **THEN** 页面使用 Buildr 默认颜色
