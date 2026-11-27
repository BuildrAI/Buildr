## MODIFIED Requirements

### Requirement: 由用户控制右栏

Cindy SHALL 保留用户在当前对话草稿中的右栏开关。选择项目 SHALL NOT 展开右栏或主动选中 Buildr 页签。

#### Scenario: 右栏收起时选择项目

- **WHEN** 用户在新建对话时选择或切换本机项目，右栏处于收起状态
- **THEN** 右栏保持收起，显式打开 Buildr 时读取当前项目的工作空间

#### Scenario: 右栏展开时选择项目

- **WHEN** 用户在右栏已展开的对话草稿中切换本机项目
- **THEN** 右栏保持展开，当前显示 Buildr 时随项目更新工作空间

#### Scenario: 新对话手动打开右栏

- **WHEN** 另一个对话曾打开 Buildr，用户在新对话中打开右栏
- **THEN** 右栏仅显示该对话自己的页签或添加面板，显式打开 Buildr 后为该对话记录页签

#### Scenario: 默认的本机 Buildr Dev 尚未启动

- **WHEN** 用户在 macOS 打开 Buildr，页面连接默认开发版地址时被拒绝
- **THEN** 插件 SHALL 复用已安装的 Buildr Dev 启动器并等待服务就绪后解析当前工作空间
