## ADDED Requirements

### Requirement: 平台 HTTP runtime 必须只按显式 web 命令启动
正式平台 SEA MUST 只在图形 Launcher 或用户显式执行 `buildr web` 时启动 Buildr Web HTTP/runtime。`buildr --help`、version、Doctor、status、Task 与其他普通 CLI 命令 MUST NOT 启动、探测复用或遗留 HTTP listener，除非该命令的公开契约明确要求访问现有 Web instance。

#### Scenario: 图形入口启动 Web
- **WHEN** 用户打开 `Buildr Web` 图形入口
- **THEN** thin Launcher MUST 执行唯一平台 SEA 的 `web` command 并等待 health/readiness 后打开浏览器
- **AND** MUST NOT 启动第二份 runtime executable 或桌面 WebView

#### Scenario: 普通 CLI 不启动服务
- **WHEN** 用户在无现有实例的环境执行 `buildr --help` 或代表性非 Web CLI
- **THEN** 命令 MUST 正常完成且没有 Buildr HTTP listener 或后台 server process
- **AND** 退出后 MUST 不留下 Web instance identity、port receipt 或 launcher-owned process

## MODIFIED Requirements

### Requirement: Launcher 必须暴露可诊断的运行身份和失败反馈
Buildr Web Launcher MUST 携带并校验 Buildr version、channel、source commit/tag、platform、architecture、protocol、application payload 与 runtime identity，并 MUST 在启动失败、source checkout 不可用、资源摘要漂移、Node/runtime 缺失或版本不兼容时提供用户可见反馈。Release Launcher MUST 只是调用同一平台 SEA 的 `web` 参数适配；development Launcher MUST 保持 checkout-backed thin identity。

#### Scenario: Launcher 成功启动
- **WHEN** launcher 启动或复用兼容的 Buildr 单实例
- **THEN** release launcher MUST 执行自身产品单元中唯一 SEA 的 `web` command，development launcher MUST 使用绑定 checkout 与显式 development runtime 启动
- **AND** launcher MUST 使用实例返回的实际 loopback URL 打开默认浏览器
- **AND** 随机端口 MUST 保持为内部状态而不是用户配置

#### Scenario: Development launcher 成功启动
- **WHEN** 绑定 checkout、Buildr CLI 入口和显式 development host Node probe 均通过
- **THEN** launcher MUST 使用绑定 checkout 的当前 `bin/buildr.mjs` 与 development host runtime 启动或复用 development instance
- **AND** status MUST 分字段报告 source root、observed checkout、development runtime、Workspace Node 和运行实例 identity，并不得用 Workspace Node receipt 证明 development 主进程 ownership

#### Scenario: Development source checkout 不可用
- **WHEN** source root 被移动、删除、不是预期 Buildr Service checkout 或缺少 CLI 入口
- **THEN** launcher MUST 拒绝启动并输出 source root、原因、日志位置和重新安装 development launcher 的动作
- **AND** MUST NOT 回退到另一个 checkout、正式 platform installation、npm package 或 PATH 中的 Buildr

#### Scenario: Development Node runtime 不可用
- **WHEN** development identity 指定的 host Node executable 缺失、版本不匹配或不能启动
- **THEN** launcher MUST 拒绝启动并输出 Node version、runtime path、日志位置以及重新安装 development launcher 的动作
- **AND** MUST NOT 静默选择 PATH、正式 Product Node、npm host Node 或 Workspace Node

#### Scenario: Launcher 启动失败
- **WHEN** SEA、payload resources、bundle identity 不完整、实例未就绪或浏览器打开失败
- **THEN** launcher MUST 显示简短错误、channel/payload identity、日志位置和重试动作
- **AND** MUST NOT 仅静默退出或回退到 development checkout

#### Scenario: 已运行实例版本不兼容
- **WHEN** 现有实例与自身 protocol、channel、runtime 或 payload identity 不兼容
- **THEN** launcher MUST 拒绝静默复用
- **AND** MUST 安全退出同 channel 的旧实例后启动当前版本，或明确告知 ownership/阻塞原因且不得停止其他 channel

### Requirement: Launcher 卸载必须保留用户工作资产
Buildr MUST 按安装渠道提供 launcher/产品单元卸载能力，并 MUST 默认保留 Workspace Registry、Workspace SQLite、日志、Workspace assets 与 Agent runtime。卸载 MUST 只删除由 matching installation ownership receipt 与 channel 共同证明的 executable、resources、link/PATH entry、shortcut、staging/previous 和卸载 metadata。

#### Scenario: 卸载官方 launcher
- **WHEN** 用户通过 macOS pkg 或 Windows MSI 的 canonical 卸载入口移除 Buildr Web
- **THEN** installer/uninstaller MUST 移除正式 platform channel 拥有的产品单元、CLI link/PATH entry、快捷方式和卸载登记
- **AND** MUST NOT 删除 Workspace Registry、SQLite、日志、Agent runtime、任何已登记 Workspace 或其中的 assets

#### Scenario: 清理开发 launcher
- **WHEN** 开发者执行 canonical development launcher 清理入口
- **THEN** Buildr MUST 只停止并移除 development channel 拥有的实例、bundle、快捷方式和 staging 产物
- **AND** MUST NOT 修改正式 platform installation、npm CLI、Workspace Node、Registry、SQLite、日志或 Workspace assets

### Requirement: 平台安装必须提供完整且可解释的 Buildr Web
Buildr MUST 为 `darwin-arm64`、`darwin-x64` 与 `windows-x64` 提供不依赖用户预装 Node、npm 或 PATH 的平台 installer，并 MUST 将安装、显式启动和后台常驻保持为不同动作。平台安装 MUST 把 Product Node SEA、CLI、Buildr Web Runtime/dist、Launcher、resources 与 product identity 作为同一原子产品单元，同时与 npm 和 development channel 隔离。

#### Scenario: macOS 安装 Buildr Web Launcher
- **WHEN** 普通用户完成匹配 architecture 的签名、公证 macOS `.pkg` 安装
- **THEN** 系统 MUST 提供带正确名称、图标、版本和唯一 SEA 的 `Buildr Web.app`，CLI symlink MUST 指向同一 SEA
- **AND** 安装 MUST NOT 无提示启动 Buildr、注册登录启动、复制第二份 Node 或要求 system Node

#### Scenario: Windows 安装 Buildr Web Launcher
- **WHEN** 普通用户完成匹配 architecture 的签名 per-user Windows `.msi` 安装
- **THEN** 系统 MUST 在明确 per-user location 提供唯一 `buildr.exe`，用户 PATH 与 Start Menu `Buildr Web` shortcut MUST 指向该安装
- **AND** desktop shortcut MUST 由安装选择明确决定
- **AND** 安装 MUST NOT 要求管理员级 machine PATH 或用户配置 Node/命令行环境

#### Scenario: 安装完成后显式打开
- **WHEN** 安装完成界面提供“打开 Buildr Web”且用户明确选择该动作
- **THEN** installer MUST 通过已安装 thin launcher 执行同一 SEA 的 `web` command
- **AND** 后续行为 MUST 与用户日常点击同一 Launcher 一致，未选择时 MUST 不启动 HTTP runtime
