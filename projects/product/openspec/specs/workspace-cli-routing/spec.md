# workspace-cli-routing Specification

## Purpose
让默认 `buildr` 命令按工作空间（Workspace）已经成立的本机管理归属执行对应 Buildr，保持终端与网页使用同一工作对象和版本来源，并在归属或执行来源无法证明时明确报告失败，避免静默切换造成错误结果。

## Requirements

### Requirement: 默认入口必须在业务启动前按管理归属选择来源
默认 npm `buildr` MUST 在加载本包业务运行时（Runtime）、校验本包 Node 范围和注入本包安装专用环境之前，读取调用目标对应的现有管理归属并选择来源。选择过程 MUST 早于具体业务命令的解析；MUST NOT 要求旧 npm 版本认识目标版本的新命令。

#### Scenario: 开发版登记中的工作空间使用新命令
- **WHEN** 用户在开发版已登记的工作空间（Workspace）调用默认 `buildr`，且命令仅在开发版存在
- **THEN** 默认入口 MUST 将原始业务参数委派到已验证开发来源，由开发版解析和执行
- **AND** 当前 npm 的命令解析或业务运行时（Runtime）初始化 MUST NOT 抢先拒绝该命令

#### Scenario: 默认 npm 的运行范围不影响可用开发来源
- **WHEN** 默认入口的 Node 可运行前置选择程序但不满足本包完整运行范围，且目标已有可用的开发来源与其登记 Node
- **THEN** 默认入口 MUST 先完成选择并使用已验证的目标 Node 委派
- **AND** MUST NOT 先加载当前 npm 完整业务负载

### Requirement: 目标定位必须尊重明确目标和真实目录关系
选择来源时 MUST 优先读取 `--target <dir>`，否则从当前目录定位所属工作空间（Workspace）。MUST 识别已登记根的子目录、符号链接（Symbolic Link）及可证明属于同一代码库的独立工作树（Worktree）；仅有相同工作空间标识不得证明对象相同。选版 MUST 保留原始参数与当前目录，不替业务命令改写目标参数或扩大其原有接受范围。

#### Scenario: 显式目标优先于当前目录
- **WHEN** 当前目录属于发布版，调用的 `--target` 指向开发版已登记工作空间（Workspace）
- **THEN** 默认入口 MUST 选择开发版，并保留原始参数供开发版处理

#### Scenario: 从子目录或符号链接运行
- **WHEN** 用户从已登记根的子目录或其真实目录相同的符号链接（Symbolic Link）调用 `buildr version --json`
- **THEN** 默认入口 MUST 选择该已登记根的管理来源

#### Scenario: 从独立工作树运行
- **WHEN** 用户从独立工作树（Worktree）调用默认 `buildr`，且实际 Git 关系与工作空间（Workspace）身份可证明关联到已登记根
- **THEN** 默认入口 MUST 选择已登记根的管理来源
- **AND** MUST 保留调用所在工作树（Worktree）的当前目录

#### Scenario: 同标识的独立副本
- **WHEN** 另一个目录复制了已登记根的工作空间（Workspace）标识，但没有相同真实目录或可证明的工作树（Worktree）关系
- **THEN** 默认入口 MUST NOT 仅凭相同标识将它作为已登记根委派
- **AND** 复制的本机归属记录与真实目录不符时 MUST 明确失败

#### Scenario: init 新建目录不继承父归属
- **WHEN** `init` 的目标自身尚无工作空间（Workspace）声明，但其父目录属于某个已登记根
- **THEN** 默认入口 MUST 保持当前安装，不把新目标作为父工作空间（Workspace）委派
- **AND** 目标自身已有有效声明时 MUST 按其实际管理归属选择

### Requirement: 选择必须沿用现有只读管理事实
选择过程 MUST 核对目标的 `.buildr/local/web-management.json` 与开发版、发布版的现有目录登记及对象身份；MUST NOT 创建第二份工作空间（Workspace）版本偏好。选择 MUST 只读，不打开或迁移 SQLite，不改写登记、归属、安装、智能体（Agent）投射或工作空间（Workspace）源文件，不要求 Buildr Web 进程存活。

#### Scenario: 网页关闭后调用
- **WHEN** 工作空间（Workspace）的管理归属及目标来源有效，但对应网页进程未运行
- **THEN** 默认入口 MUST 仍能选择并执行对应来源
- **AND** 普通非网页命令 MUST NOT 为此启动网页进程

#### Scenario: 未登记工作目录
- **WHEN** 目标没有既有管理归属和对应登记，且不存在损坏或冲突证据
- **THEN** 默认入口 MUST 保持当前 npm 执行行为
- **AND** MUST NOT 为选版自动登记工作空间（Workspace）或新建本机记录

### Requirement: 目标执行来源必须可验证且保持安装所有权
发布版归属 MUST 使用已验证的当前 npm 来源；开发版归属 MUST 从本机 Buildr Web Dev 启动器（Launcher）的有效登记发现源码根及 Node，并校验其当前来源与可执行性。MUST NOT 写死开发目录、从网页进程反推程序或把仅接受 npm 的安装登记冒充双版统一登记。默认 `buildr` 的机器入口所有权 MUST 继续属于 npm。

#### Scenario: 开发来源移动并更新登记
- **WHEN** 有效的开发启动器（Launcher）登记已切换到新的可用源码根及 Node
- **THEN** 后续默认调用 MUST 使用该当前登记来源
- **AND** MUST NOT 依赖之前开发目录或运行实例

#### Scenario: 所选来源不可用
- **WHEN** 目标归属开发版，但开发启动登记损坏、源码根无效或其 Node 不可执行
- **THEN** 默认入口 MUST 非零退出并指出所选来源及恢复方向
- **AND** MUST NOT 静默改用发布版、其他源码根或未登记 Node

### Requirement: 委派必须保持调用行为并隔离来源环境
跨来源委派 MUST 保持业务参数顺序与字节值、当前目录、标准输入输出、退出状态以及终止信号的可观察结果。MUST 清理调用来源注入的安装身份、应用负载（Application Payload）、启动器（Launcher）及运行角色环境，防止目标继承另一来源的身份；MUST 防止递归选版。选择本身及相同来源的继续执行 MUST 不添加业务输出。

#### Scenario: 委派流式命令与退出失败
- **WHEN** 所选来源读取标准输入、向标准输出和错误输出写入，并以非零状态退出
- **THEN** 调用者 MUST 观察到同一输入输出及退出状态
- **AND** 参数中的空格、非 ASCII 字符和相对目标 MUST 保持不变

#### Scenario: 调用来源环境含安装身份
- **WHEN** npm 调用环境携带本安装的专用身份及负载变量，而目标选择开发版
- **THEN** 开发版 MUST 使用自身源码和运行身份执行
- **AND** MUST NOT 继承 npm 安装身份或再次递归委派

#### Scenario: 调用被终止
- **WHEN** 委派中的调用接收终止信号
- **THEN** 目标执行 MUST 收到适用的终止行为，父入口 MUST 按目标结束结果退出

### Requirement: 显式与全局安装动作必须保持本安装绑定
显式 `projects/product/buildr` 和图形启动器（Launcher）MUST 保持各自绑定来源。`update`、`update check`、`installation status`、`web launcher` 及 `__internal` 安装动作 MUST 不按当前工作空间（Workspace）切换来源；无 `--target` 的 `web` MUST 保留本安装已有目录列表行为，带 `--target` 的普通 `web` MUST 按归属选择。

#### Scenario: 在开发版目录更新默认 npm
- **WHEN** 用户在开发版已登记工作空间（Workspace）通过默认入口执行 `update`、`update check`、`installation status` 或 `web launcher` 动作
- **THEN** 动作 MUST 继续作用于当前 npm 安装
- **AND** MUST NOT 转为更新或管理开发来源

#### Scenario: 显式开发入口与图形入口
- **WHEN** 用户直接调用 `projects/product/buildr` 或打开已绑定的图形启动器（Launcher）
- **THEN** 执行 MUST 使用该入口绑定来源，保留其安装身份与现有管理保护

#### Scenario: web 的目标区分
- **WHEN** 用户在开发版已登记目录执行默认 `buildr web` 且未传 `--target`
- **THEN** MUST 保留当前 npm 的网页目录列表行为
- **AND** 对同一目录显式传入 `web --target <dir>` 时 MUST 选择开发版

### Requirement: 不确定归属必须形成明确局部失败
目标相关管理记录损坏、目录身份变化、两侧登记对同一对象冲突或无法确定唯一来源时，默认入口 MUST 非零退出并报告可定位的原因与下一动作。MUST NOT 将未知、损坏或冲突视为未登记，也不得通过修改登记或数据库掩盖问题。已充分证明目标归属时，无关对象的局部发现失败 MUST 不否定该事实。

#### Scenario: 两侧同时登记同一对象
- **WHEN** 开发版与发布版同时登记同一真实工作空间（Workspace），或有效管理记录与对应登记矛盾
- **THEN** 默认入口 MUST 停止该调用并明确指出归属冲突
- **AND** MUST NOT 按最近使用、版本新旧或登记顺序选择

#### Scenario: 无关旧目录失效
- **WHEN** 目标归属已由匹配的真实目录、身份和有效本机记录证明，另一个无关旧目录已不存在
- **THEN** 默认入口 MUST 允许该目标按其已证明归属继续
- **AND** MUST NOT 把无关旧目录问题扩大为所有工作空间（Workspace）的阻塞
