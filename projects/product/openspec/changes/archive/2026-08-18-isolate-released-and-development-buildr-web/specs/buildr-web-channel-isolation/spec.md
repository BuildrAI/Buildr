## ADDED Requirements

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
每个 ordinary Web profile MUST独占自己的 `instance.json`、`instance-start.lock`、Workspace registry、instance secret与shutdown lifecycle。健康检查与协议相同 MUST NOT允许跨profile复用；同一profile内仍 MUST保持单实例与随机loopback端口语义。

#### Scenario: 两个Server同时启动
- **WHEN** released普通Web健康运行后启动development普通Web
- **THEN** 两者 MUST同时保持健康并拥有不同PID、loopback URL、instance文件和启动锁
- **AND** development MUST NOT返回released实例URL或向released registry写入Workspace

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
