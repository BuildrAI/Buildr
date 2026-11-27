# cindy-desktop-integration Specification

## Purpose
定义 Buildr 在 Cindy 中的配色、插件交付边界，以及在对话右栏查看当前工作空间时的交互行为。

## Requirements

### Requirement: 配色和源码归属

Buildr 嵌入页 SHALL 使用 Cindy 提供的语义颜色，覆盖页面底色、卡片、交互选中态和主操作。Buildr Cindy 插件 SHALL 独立打包，并复用已运行的 Buildr Web。

#### Scenario: 在 Cindy 中切换主题

- **WHEN** 当前插件页收到新的宿主语义颜色
- **THEN** 正式页面更新受主题控制的表面，无需导航或重载

#### Scenario: 独立访问

- **WHEN** 用户从浏览器直接打开 Buildr Web
- **THEN** 页面使用 Buildr 默认颜色

### Requirement: 由用户控制右栏

Cindy SHALL 保留用户在当前对话草稿中的右栏开关。选择项目 SHALL NOT 展开右栏或主动选中 Buildr 页签。

#### Scenario: 右栏收起时选择项目

- **WHEN** 用户在新建对话时选择或切换本机项目，右栏处于收起状态
- **THEN** 右栏保持收起，显式打开 Buildr 时读取当前项目的工作空间

#### Scenario: 右栏展开时选择项目

- **WHEN** 用户在右栏已展开的对话草稿中切换本机项目
- **THEN** 右栏保持展开，当前显示 Buildr 时随项目更新工作空间
