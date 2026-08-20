# buildr-web-channel-isolation Specification

## Purpose

定义普通 Buildr Web 的 channel profile、Data Root、并行实例、registry 隔离与 migration 前 Workspace 双重管理保护。

## Requirements

### Requirement: 普通 Buildr Web 必须按正式产品身份解析 channel profile 与 Data Root
Buildr MUST 只使用 formal product installation channel 与 runtime role 解析普通 Web profile。`npm + host` MUST 映射为 released profile，`development + development` MUST 映射为 development profile；未知或不一致身份 MUST 在普通 Web 启动前失败关闭。显式 `BUILDR_APP_DATA_DIR` MUST 对当前 Web/Preview 调用具有最高 Root 优先级，但 MUST NOT改变产品 channel 身份。

#### Scenario: npm 默认 Root 保持兼容
- **WHEN** npm/host Buildr 在未设置 `BUILDR_APP_DATA_DIR` 时启动普通 Web
- **THEN** macOS MUST 使用 `~/Library/Application Support/Buildr`，Windows MUST 使用 `%LOCALAPPDATA%\\Buildr`，Linux MUST 使用 `${XDG_STATE_HOME:-~/.local/state}/buildr`
- **AND** MUST 继续读取原 released Workspace registry 和 instance state

#### Scenario: development 自动使用独立 Root
- **WHEN** development/development Buildr 在未设置 `BUILDR_APP_DATA_DIR` 时启动普通 Web
- **THEN** macOS MUST 使用 `~/Library/Application Support/Buildr Dev`，Windows MUST 使用 `%LOCALAPPDATA%\\Buildr Dev`，Linux MUST 使用 `${XDG_STATE_HOME:-~/.local/state}/buildr-dev`
- **AND** MUST NOT读取、复制或迁移 released Workspace registry

#### Scenario: 显式 override 不改变 channel
- **WHEN** 调用方设置临时 `BUILDR_APP_DATA_DIR` 并从 development product启动 Web
- **THEN** instance、start lock与registry MUST 写入该临时Root
- **AND** product identity与Workspace管理channel MUST仍为development

### Requirement: released 与 development 普通 Web 实例必须隔离并存
每个 ordinary Web profile MUST独占自己的 `instance.json`、`instance-start.lock`、Workspace registry、instance secret与shutdown lifecycle。健康检查与协议相同 MUST NOT允许跨profile复用；同一profile内仍 MUST保持单实例。Development Launcher MUST使用固定默认端口`4458`且不得随机回退；Preview与不带Launcher identity的普通CLI MUST保持显式端口或随机loopback端口语义。released profile通过正式npm Launcher启动时 MUST使用binding中的closed端口策略，默认首选`4457`，并在非零首选端口因`EADDRINUSE`不可绑定时只回退一次随机端口。

#### Scenario: 两个Server同时启动
- **WHEN** released普通Web健康运行后启动development普通Web
- **THEN** 两者 MUST同时保持健康并拥有不同PID、loopback URL、instance文件和启动锁
- **AND** development MUST NOT返回released实例URL或向released registry写入Workspace

#### Scenario: 正式Launcher使用默认首选端口
- **WHEN** 新安装或从旧binding修复的正式npm Launcher启动released普通Web且`127.0.0.1:4457`可绑定
- **THEN** released实例 MUST监听`127.0.0.1:4457`并把实际URL写入matching instance receipt
- **AND** Development Launcher 的固定端口`4458`、Preview与普通CLI的端口语义 MUST保持不变

#### Scenario: Development Launcher使用固定端口
- **WHEN** 新安装或更新后的`Buildr Web Dev` Launcher启动development普通Web且`127.0.0.1:4458`可绑定
- **THEN** development实例 MUST监听`127.0.0.1:4458`并把实际URL写入development instance receipt
- **AND** Launcher MUST在同profile健康实例已存在时复用该实例，不得启动第二实例或切换到随机端口

#### Scenario: Development Launcher固定端口被占用
- **WHEN** `127.0.0.1:4458`被无法证明属于matching development profile的进程占用
- **THEN** Development Launcher MUST明确失败并保留占用者
- **AND** MUST NOT随机回退、扫描其他端口、强杀进程或把foreign服务登记为Buildr Web Dev

#### Scenario: 正式Launcher首选端口被占用
- **WHEN** 正式npm Launcher binding声明非零首选端口且真实listen返回`EADDRINUSE`
- **THEN** Buildr MUST在同一个start lock内关闭未就绪server并只以端口`0`重试一次
- **AND** MUST记录回退原因和最终URL，且 MUST NOT复用占用端口的未知进程、扫描其他固定端口或启动第二个released实例

#### Scenario: 正式Launcher显式选择端口或随机端口
- **WHEN** 用户通过`buildr web launcher install|repair --port <port>`创建或更新正式Launcher
- **THEN** binding MUST把`0..65535`中的选择纳入closed identity，省略参数时 MUST使用`4457`，`0` MUST直接请求随机端口
- **AND** `repair`省略端口时 MUST保留已有current策略，旧binding迁移时 MUST采用默认`4457`

#### Scenario: 复用旧健康released实例
- **WHEN** matching released profile已有健康实例且其实际端口不同于当前Launcher binding策略
- **THEN** Launcher MUST复用该健康实例并打开其实际URL
- **AND** MUST NOT为了迁移端口自动停止实例或并行启动第二个released实例

#### Scenario: 退出一个实例
- **WHEN** 用户通过认证退出动作停止development实例
- **THEN** Buildr MUST只清理matching development receipt并停止该PID
- **AND** released实例、receipt、registry与session MUST保持不变

#### Scenario: 旧shared-root实例属于另一channel
- **WHEN** released Root中的旧instance receipt或health identity可证明属于development
- **THEN** released启动 MUST拒绝复用、覆盖、停止或清理该健康实例
- **AND** 诊断 MUST要求先通过旧实例公开退出动作停止，再分别启动两种profile

### Requirement: Workspace管理channel必须在Structured Store之前fail closed
Buildr MUST在普通Web登记/打开Workspace和任何Workspace Structured Store打开之前核对当前product channel、canonical real root、Workspace UUID、Workspace-local management identity及released/development registry。相同canonical real root或相同Workspace UUID由另一channel管理时 MUST在创建、打开或migration Workspace SQLite之前失败关闭。第一版 MUST NOT提供force、silent adopt或自动ownership transfer。

#### Scenario: development尝试打开released Workspace
- **WHEN** released registry已登记一个Workspace，development CLI `buildr web --target`、Launcher或注册API尝试登记同一real root或Workspace UUID
- **THEN** 请求 MUST在打开Workspace SQLite之前失败
- **AND** 诊断 MUST包含Workspace路径、当前development身份、冲突released身份，以及“使用隔离副本或从错误registry移除”的动作

#### Scenario: released反向打开development Workspace
- **WHEN** Workspace-local management identity或development registry证明目标由development管理
- **THEN** released runtime MUST在Structured Store打开和migration前失败
- **AND** MUST NOT修改SQLite hash、mtime或migration ledger

#### Scenario: symlink指向同一Workspace
- **WHEN** 两个channel分别使用真实路径和指向该路径的symlink登记Workspace
- **THEN** canonical real path比较 MUST把它们识别为同一Workspace并阻断第二次管理
- **AND** MUST NOT以调用方字符串路径不同为由允许双重登记

#### Scenario: 对侧registry损坏
- **WHEN** 对侧registry文件存在但无法解析、schema不受支持或其中identity无法安全判断
- **THEN** 当前channel MUST保持fail closed并报告对侧registry诊断
- **AND** MUST NOT猜测registry为空、建立management claim或打开Workspace SQLite

#### Scenario: registry不存在的首次claim
- **WHEN** 对侧registry不存在、Workspace没有管理记录且当前channel执行第一次合法登记或Structured Store mutation
- **THEN** Buildr MUST在Workspace-local lock内建立matching最小management identity
- **AND** 记录 MUST位于SQLite之外且在任何SQLite创建或migration之前完成

### Requirement: Workspace registry必须按channel隔离且可安全解除错误登记
released与development MUST各自只读写自己的Workspace registry。development首次使用独立Root MUST为空或只包含用户明确登记的development Workspace；安装/升级Development Launcher MUST NOT复制released条目。移除错误channel登记 MUST不打开或修改Workspace SQLite，并 MUST只在精确ownership可证明时清理matching本机management claim。

#### Scenario: registry列表互不泄漏
- **WHEN** released登记正式业务Workspace且development登记Buildr产品Workspace
- **THEN** development列表 MUST不显示正式业务Workspace，released列表 MUST不显示Buildr产品Workspace
- **AND** 任何一侧变更revision MUST不改变另一侧registry

#### Scenario: 从错误registry移除
- **WHEN** 用户从当前channel的registry移除一个冲突Workspace
- **THEN** Buildr MUST只修改当前registry及精确matching的本机management claim
- **AND** MUST保留Workspace SQLite、Workspace源资产、另一channel registry和所有实例

### Requirement: 全局安装事实与Web运行状态必须使用不同Root abstraction
Buildr MUST让product installation registry、npm/development installation inventory与release awareness在两个Web profile之间保持共享可见，同时让ordinary instance、start lock与Workspace registry按profile隔离。Preview MUST继续使用独立于两个ordinary profile的namespace与ownership lifecycle。

#### Scenario: development Doctor观察npm安装
- **WHEN** development Web Root与released Root分离且npm installation已登记
- **THEN** development Doctor MUST仍能报告npm installation与development installation
- **AND** MUST NOT因development registry为空而把npm installation标记为缺失

#### Scenario: Preview回归
- **WHEN** 两个Task Environment分别启动、列出和停止Buildr Web Preview
- **THEN** Preview MUST继续使用各自独立instance、lock、registry与resource ownership
- **AND** MUST不读写released或development ordinary instance state

### Requirement: Development Launcher必须自动绑定development Web profile
`npm run install:development`创建或更新的`Buildr Web Dev` Launcher MUST使用closed development launcher identity启动同checkout的development product，并由product identity自动解析Development Root。Launcher与Server的channel/runtime role/protocol/installation identity不一致时 MUST在Workspace登记和server复用之前失败。

#### Scenario: Development Launcher无需手工环境变量
- **WHEN** 用户重复执行`npm run install:development`并启动`Buildr Web Dev`
- **THEN** Launcher MUST在未设置`BUILDR_APP_DATA_DIR`时使用平台development默认Root
- **AND** 重装 MUST不复制released registry、不覆盖npm Launcher或停止released实例

#### Scenario: Launcher身份不匹配
- **WHEN** development Launcher identity尝试启动npm/host product或npm binding尝试启动development product
- **THEN** Web启动 MUST在读取Workspace registry或instance复用前失败
- **AND** 诊断 MUST展示Launcher与product的channel/runtime role冲突且不回退PATH中的其他Buildr

### Requirement: 正式 npm Launcher 必须支持重复打开
macOS正式npm Launcher MUST把App executable保持为短生命周期入口。它 MUST在同步校验binding、Host Node、package entry及其digest后启动独立后台运行器并退出；后台运行器 MUST执行同一binding中的npm entry、追加正式Launcher日志，并在失败时保留可见诊断。Launcher MUST NOT复制Node、Buildr package或payload，也 MUST NOT把development checkout作为正式入口。

#### Scenario: 首次打开正式Launcher
- **WHEN** 用户打开已安装且binding current的macOS正式Launcher且不存在健康released实例
- **THEN** App executable MUST在启动后台运行器后及时退出，后台运行器 MUST启动matching released实例
- **AND** LaunchServices MUST NOT因Web进程持续运行而把App executable保持为不可重开的前台进程

#### Scenario: 重复打开正式Launcher
- **WHEN** matching released实例已经健康且用户再次打开macOS正式Launcher
- **THEN** 新的短生命周期入口 MUST成功执行并由CLI复用该实例、打开其实际URL
- **AND** 启动 MUST不返回LaunchServices `-600`、不创建第二实例或切换到development profile

#### Scenario: Launcher同步校验失败
- **WHEN** binding、Host Node、package entry或digest在后台启动前不再匹配
- **THEN** App executable MUST拒绝启动后台运行器并写入正式Launcher日志
- **AND** MUST显示从同一npm installation运行`buildr web launcher status|repair`的修复提示

#### Scenario: 后台运行器启动失败
- **WHEN** 同步preflight通过但正式Web命令以非零状态退出
- **THEN** 后台运行器 MUST记录退出状态并显示启动失败诊断
- **AND** App executable短生命周期与下一次可重开能力 MUST保持不变

### Requirement: Buildr Web 必须显示可信的开发环境标识
Buildr Web Runtime MUST 将已经解析并校验的 closed Web profile 注入同源入口页面。应用壳 MUST 仅在该 profile 精确为 `development` 时持续显示用户可见的“开发版”环境标识，并把浏览器标签页产品名显示为 `Buildr Web Dev`；released、缺失或未知 profile 的产品名 MUST 保持 `Buildr Web`。前端 MUST NOT 根据端口、URL、Workspace 或 Launcher 文件名推断环境；该标识 MUST 只用于展示，不得成为权限、路由、数据或实例生命周期 authority。

#### Scenario: development 页面显示开发版
- **WHEN** development/development product identity 启动 Buildr Web，且 Runtime 已解析 development Web profile
- **THEN** Runtime MUST 在入口页注入 `development` profile，应用壳 MUST 在所有路由持续显示“开发版”
- **AND** 标识 MUST 使用稳定 DOM identity 供浏览器验收
- **AND** 浏览器标签页产品名 MUST 显示为 `Buildr Web Dev`，并保留既有 Workspace 标题上下文

#### Scenario: released 页面不显示开发版
- **WHEN** npm/host product identity 启动 Buildr Web，且 Runtime 已解析 released Web profile
- **THEN** Runtime MUST 在入口页注入 `released` profile，应用壳 MUST NOT显示“开发版”标识
- **AND** 浏览器标签页产品名 MUST 保持 `Buildr Web`
- **AND** released 的端口、Launcher binding、Workspace registry 与 Data Root 行为 MUST保持不变

#### Scenario: profile 缺失或未知时不误报
- **WHEN** 旧入口页、源开发入口或异常页面没有可识别的 closed Web profile
- **THEN** 应用壳 MUST NOT把页面标记为开发版
- **AND** 浏览器标签页产品名 MUST 保持 `Buildr Web`
- **AND** 前端 MUST NOT回退到端口、URL、Workspace 或 Launcher 文件名猜测环境
