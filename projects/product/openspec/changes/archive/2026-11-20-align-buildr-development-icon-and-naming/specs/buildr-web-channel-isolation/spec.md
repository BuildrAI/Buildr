## MODIFIED Requirements

### Requirement: Development Launcher必须自动绑定development Web profile
`npm run install:development`创建或更新的`Buildr Development Dev` Launcher MUST使用closed development launcher identity启动同checkout的development product，并由product identity自动解析Development Root。Launcher与Server的channel/runtime role/protocol/installation identity不一致时 MUST在Workspace登记和server复用之前失败。

#### Scenario: Development Launcher无需手工环境变量
- **WHEN** 用户重复执行`npm run install:development`并启动`Buildr Development Dev`
- **THEN** Launcher MUST在未设置`BUILDR_APP_DATA_DIR`时使用平台development默认Root
- **AND** 重装 MUST不复制released registry、不覆盖npm Launcher或停止released实例

#### Scenario: Launcher身份不匹配
- **WHEN** development Launcher identity尝试启动npm/host product或npm binding尝试启动development product
- **THEN** Web启动 MUST在读取Workspace registry或instance复用前失败
- **AND** 诊断 MUST展示Launcher与product的channel/runtime role冲突且不回退PATH中的其他Buildr

### Requirement: Buildr Web 必须显示可信的开发环境标识
Buildr Web Runtime MUST 将已经解析并校验的 closed Web profile 注入同源入口页面。应用壳 MUST 仅在该 profile 精确为 `development` 时持续显示用户可见的“开发版”环境标识，并把浏览器标签页产品名显示为 `Buildr Development Dev`；released、缺失或未知 profile 的产品名 MUST 保持 `Buildr Development`。前端 MUST NOT 根据端口、URL、Workspace 或 Launcher 文件名推断环境；该标识 MUST 只用于展示，不得成为权限、路由、数据或实例生命周期 authority。

#### Scenario: development 页面显示开发版
- **WHEN** development/development product identity 启动 Buildr Web，且 Runtime 已解析 development Web profile
- **THEN** Runtime MUST 在入口页注入 `development` profile，应用壳 MUST 在所有路由持续显示“开发版”
- **AND** 标识 MUST 使用稳定 DOM identity 供浏览器验收
- **AND** 浏览器标签页产品名 MUST 显示为 `Buildr Development Dev`，并保留既有 Workspace 标题上下文

#### Scenario: released 页面不显示开发版
- **WHEN** npm/host product identity 启动 Buildr Web，且 Runtime 已解析 released Web profile
- **THEN** Runtime MUST 在入口页注入 `released` profile，应用壳 MUST NOT显示“开发版”标识
- **AND** 浏览器标签页产品名 MUST 保持 `Buildr Development`
- **AND** released 的端口、Launcher binding、Workspace registry 与 Data Root 行为 MUST保持不变

#### Scenario: profile 缺失或未知时不误报
- **WHEN** 旧入口页、源开发入口或异常页面没有可识别的 closed Web profile
- **THEN** 应用壳 MUST NOT把页面标记为开发版
- **AND** 浏览器标签页产品名 MUST 保持 `Buildr Development`
- **AND** 前端 MUST NOT回退到端口、URL、Workspace 或 Launcher 文件名猜测环境

## ADDED Requirements

### Requirement: 正式与开发桌面启动器必须采用 Buildr Development 命名并兼容平滑迁移旧入口
正式 npm Launcher MUST 以 `Buildr Development`（macOS 为 `Buildr Development.app`，Windows 为 `Buildr Development.lnk`）作为默认桌面入口，Development Launcher MUST 以 `Buildr Development Dev`（macOS 为 `Buildr Development Dev.app`，Windows 为 `Buildr Development Dev`）作为默认桌面入口，且均使用象形 `D` 启动器图标；两者 MUST 保持既有的平台数据根目录、Bundle 标识与 CLI 命令不变。状态检查、刷新与重新安装 MUST 兼容识别已存在的同所有权旧名入口（`Buildr Web` / `Buildr Web Dev` / `Buildr Dev`），并在新入口安装校验通过后安全清理可证明归属的旧入口，同时保留所有权不明的外部入口。

#### Scenario: 正式启动器升级自动迁移旧名入口
- **WHEN** 本机仅存在同安装槽位的旧版 `/Applications/Buildr Web.app` 且用户执行默认安装或随更新刷新启动器
- **THEN** 系统 MUST 安装并验证新的 `/Applications/Buildr Development.app`
- **AND** MUST 移除可证明属于同一安装槽位的旧版 `Buildr Web.app`，同时保留无法证明归属的外部入口

#### Scenario: 开发启动器升级自动迁移旧名入口
- **WHEN** 用户在存在旧版可证明归属的 `Buildr Web Dev` 或 `Buildr Dev` 入口时执行开发启动器安装
- **THEN** 系统 MUST 生成并验证 `Buildr Development Dev` 入口并安全清理上述已证明归属的旧开发入口
- **AND** 正式入口与所有权不明的外部目标 MUST 保持不受影响
