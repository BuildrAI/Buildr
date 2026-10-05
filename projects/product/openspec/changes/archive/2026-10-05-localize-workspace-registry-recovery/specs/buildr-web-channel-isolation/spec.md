## MODIFIED Requirements

### Requirement: Workspace管理channel必须在Structured Store之前fail closed
Buildr MUST在普通Web登记/打开Workspace和Workspace Structured Store打开之前核对当前product channel、canonical real root、Workspace UUID及Workspace-local management identity。相同canonical real root或相同Workspace UUID由另一channel管理时 MUST在创建、打开或migration Workspace SQLite之前失败关闭。已有本机记录与当前real root、UUID和profile identity完全匹配时，其他无法解析的对侧登记 MUST NOT否定该对象已成立的归属；对侧可读的确定冲突仍 MUST拒绝。首次建立claim时 MUST核对对侧registry，只有已确认完全不存在的无关登记目录可以跳过；损坏registry或无法证明无关的现存对象 MUST阻止新的claim。MUST NOT提供force、silent adopt或自动ownership transfer，MUST NOT修改对侧registry来掩盖诊断。

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
- **WHEN** 对侧registry文件存在但无法解析、schema不受支持，且当前Workspace没有可验证的matching本机管理记录
- **THEN** 当前channel MUST拒绝新的management claim并报告对侧registry诊断
- **AND** MUST NOT猜测registry为空或在归属未明时创建、打开或migration Workspace SQLite

#### Scenario: registry不存在的首次claim
- **WHEN** 对侧registry不存在、Workspace没有管理记录且当前channel执行第一次合法登记或Structured Store mutation
- **THEN** Buildr MUST在Workspace-local lock内建立matching最小management identity
- **AND** 记录 MUST位于SQLite之外且在任何SQLite创建或migration之前完成

#### Scenario: matching本机归属与无关未知条目
- **WHEN** 本机记录与当前real root、UUID及profile identity匹配，而其他对侧目录身份不可读
- **THEN** 当前对象的合法读取与本owner动作 MUST可以继续，现有安装状态观察 MUST仍反映对侧登记不可读
- **AND** 检查 MUST继续扫描其余可读条目，同路径或UUID冲突 MUST仍拒绝

#### Scenario: 首次claim遇到完全不存在的旧目录
- **WHEN** 对侧已登记的其他目录确实没有目录项且最近现存祖先可解析
- **THEN** 该无关失效路径 MUST NOT阻止当前合法claim，且 MUST NOT修改对侧登记
- **AND** 悬空链接、现存目录缺元数据、权限错误或无法解析祖先 MUST NOT被当作完全不存在

#### Scenario: 本机记录损坏或身份变化
- **WHEN** 本机记录损坏，或路径、UUID、profile identity与当前观察不匹配
- **THEN** 当前对象 MUST拒绝访问或新的claim
- **AND** MUST NOT借无关对侧失败进入宽松分支

## ADDED Requirements

### Requirement: Workspace登记写入必须保全并发与异常恢复
Buildr MUST用可核验的持有者保护当前channel登记写入，并校验已观察版本。版本摘要 MUST对应同一次读取解析的正文。正常结束只释放精确匹配的自身锁；只有可验证死亡的持有者才允许受控恢复，活跃或未知持有者 MUST保留。

#### Scenario: 写入进程异常退出
- **WHEN** 登记写入进程退出并留下持有者、目标及令牌可核验的锁
- **THEN** 后续操作 MUST可安全恢复死亡持有者的锁并重新核对当前登记版本
- **AND** MUST保留已完成写入，不盲目重放旧内容

#### Scenario: 活跃持有者或旧未知空锁
- **WHEN** 登记锁属于活跃进程，或旧空锁的归属无法证明
- **THEN** 请求 MUST返回可识别的争用诊断并保留该锁与登记正文
- **AND** MUST NOT按年龄删除、猜持有者或释放已变化的他人锁

#### Scenario: 版本已变化
- **WHEN** 提交的已观察登记版本与锁内同正文读取版本不同
- **THEN** 请求 MUST拒绝旧写入并保全当前正文
- **AND** 使用者 MUST重新读取和判断后才发起新的写入
