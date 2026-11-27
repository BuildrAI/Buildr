## RENAMED Requirements
- FROM: `### Requirement: 正式与开发桌面启动器必须采用 Buildr Development 命名并兼容平滑迁移旧入口`
- TO: `### Requirement: 正式与开发桌面启动器必须采用 Buildr 命名并兼容平滑迁移旧入口`

## MODIFIED Requirements

### Requirement: Development Launcher必须自动绑定development Web profile
`npm run install:development`创建或更新的`Buildr Dev` Launcher MUST使用closed development launcher identity启动同checkout的development product，并由product identity自动解析Development Root。Launcher与Server的channel/runtime role/protocol/installation identity不一致时 MUST在Workspace登记和server复用之前失败。

#### Scenario: Development Launcher无需手工环境变量
- **WHEN** 用户重复执行`npm run install:development`并启动`Buildr Dev`
- **THEN** Launcher MUST在未设置`BUILDR_APP_DATA_DIR`时使用平台development默认Root
- **AND** 重装 MUST不复制released registry、不覆盖npm Launcher或停止released实例

#### Scenario: Launcher身份不匹配
- **WHEN** development Launcher identity尝试启动npm/host product或npm binding尝试启动development product
- **THEN** Web启动 MUST在读取Workspace registry或instance复用前失败
- **AND** 诊断 MUST展示Launcher与product的channel/runtime role冲突且不回退PATH中的其他Buildr

### Requirement: Buildr Web 必须显示可信的开发环境标识
Buildr Web Runtime MUST 将已经解析并校验的 closed Web profile 注入同源入口页面。应用壳 MUST 仅在该 profile 精确为 `development` 时持续显示用户可见的“开发版”环境标识，并把浏览器标签页产品名显示为 `Buildr Dev`；released、缺失或未知 profile 的产品名 MUST 保持 `Buildr`。前端 MUST NOT 根据端口、URL、Workspace 或 Launcher 文件名推断环境；该标识 MUST 只用于展示，不得成为权限、路由、数据或实例生命周期 authority。

#### Scenario: development 页面显示开发版
- **WHEN** development/development product identity 启动 Buildr Web，且 Runtime 已解析 development Web profile
- **THEN** Runtime MUST 在入口页注入 `development` profile，应用壳 MUST 在所有路由持续显示“开发版”
- **AND** 标识 MUST 使用稳定 DOM identity 供浏览器验收
- **AND** 浏览器标签页产品名 MUST 显示为 `Buildr Dev`，并保留既有 Workspace 标题上下文

#### Scenario: released 页面不显示开发版
- **WHEN** npm/host product identity 启动 Buildr Web，且 Runtime 已解析 released Web profile
- **THEN** Runtime MUST 在入口页注入 `released` profile，应用壳 MUST NOT显示“开发版”标识
- **AND** 浏览器标签页产品名 MUST 保持 `Buildr`
- **AND** released 的端口、Launcher binding、Workspace registry 与 Data Root 行为 MUST保持不变

#### Scenario: profile 缺失或未知时不误报
- **WHEN** 旧入口页、源开发入口或异常页面没有可识别的 closed Web profile
- **THEN** 应用壳 MUST NOT把页面标记为开发版
- **AND** 浏览器标签页产品名 MUST 保持 `Buildr`
- **AND** 前端 MUST NOT回退到端口、URL、Workspace 或 Launcher 文件名猜测环境

### Requirement: 正式与开发桌面启动器必须采用 Buildr 命名并兼容平滑迁移旧入口
正式 npm Launcher MUST 以 `Buildr`（macOS 为 `Buildr.app`，Windows 为 `Buildr.lnk`）作为默认桌面入口，Development Launcher MUST 以 `Buildr Dev`（macOS 为 `Buildr Dev.app`，Windows 为 `Buildr Dev`）作为默认桌面入口，且两者与 Buildr Web 入口页签 MUST 统一采用亮色彩色立体 `B` 图标；两者 MUST 保持既有的平台数据根目录、Bundle 标识与 CLI 命令不变。状态检查、刷新与重新安装 MUST 兼容识别已存在的同所有权旧名入口（正式入口 `Buildr Development` / `Buildr Web`；开发入口 `Buildr Development Dev` / `Buildr Web Dev`），并在新入口安装校验通过后安全清理可证明归属的旧入口，同时保留所有权不明的外部入口。开发启动器安装校验通过后 MUST 在对应开发数据目录原子写入或更新 `development-source.json` 稳定来源登记；卸载开发启动器时 MUST 同步移除归属匹配的 `development-source.json` 并保留所有权不可证明的记录。开发启动器安装与状态检查 MUST 只读检测配对发布版数据目录已登记全局 npm `buildr` 的路由发现兼容性，在不兼容时给出非阻断告警与更新指引，同时隔离数据目录检查 MUST NOT 泄漏或读取宿主真实安装登记。

#### Scenario: 正式启动器升级自动迁移旧名入口
- **WHEN** 本机仅存在同安装槽位的旧版 `/Applications/Buildr Development.app` 或 `/Applications/Buildr Web.app` 且用户执行默认安装或随更新刷新启动器
- **THEN** 系统 MUST 安装并验证新的 `/Applications/Buildr.app`
- **AND** MUST 移除可证明属于同一安装槽位的旧版 `Buildr Development.app` 与 `Buildr Web.app`，同时保留无法证明归属的外部入口

#### Scenario: 开发启动器升级自动迁移旧名入口
- **WHEN** 用户在存在旧版可证明归属的 `Buildr Development Dev` 或 `Buildr Web Dev` 入口时执行开发启动器安装
- **THEN** 系统 MUST 生成并验证 `Buildr Dev` 入口、原子写入对应开发数据目录的 `development-source.json`，并安全清理上述已证明归属的旧开发入口
- **AND** 正式入口与所有权不明的外部目标 MUST 保持不受影响

#### Scenario: 卸载开发启动器时按归属清理稳定来源登记
- **WHEN** 用户卸载可证明归属的开发启动器且当前开发数据目录存在 `development-source.json`
- **THEN** 系统 MUST 同步移除归属匹配的 `development-source.json`
- **AND** 若 `development-source.json` 的所有权或指向目标无法证明属于本次被卸载入口，系统 MUST 保留该记录并输出诊断

#### Scenario: 检测到旧版全局 npm CLI 不兼容时非阻断预警
- **WHEN** 开发启动器安装或状态检查发现配对发布版数据目录登记的当前全局 npm `buildr` 路由器不支持当前开发来源发现协议
- **THEN** 系统 MUST 在状态结果中返回兼容状态与非阻断告警并附带更新指引，安装命令在向标准错误输出预警的同时 MUST 正常完成安装并保持标准输出结构化 JSON 完整
- **AND** 当检查运行在显式隔离的开发数据目录且配对发布版目录无登记时，MUST 返回缺省状态而不读取宿主真实安装登记
