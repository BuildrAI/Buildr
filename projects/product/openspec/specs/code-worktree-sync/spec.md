# code-worktree-sync Specification

## Purpose
为已登记代码库（Repository）的具体工作树（Worktree）提供由明确用户动作发起、固定当前已跟踪上游（Upstream）的同步（Sync），以获取、必要整合和普通推送的逐阶段真实结果保护现有内容、身份及授权边界，并保留可继续处理的失败现场。

## Requirements

### Requirement: 具体来源与固定上游观察

同步（Sync） MUST 只接受已登记代码库（Repository）、实际枚举的具体工作树（Worktree）及已观察版本，不接受任意目录、地址或命令。观察 MUST 绑定真实检出身份、当前分支（Branch）与完整提交（Commit）、文件及索引（Index）状态、当前唯一可核实上游（Upstream）及相关获取和推送配置。执行前与每个后续写入阶段 MUST 重新核对适用身份及版本；来源、分支（Branch）、上游（Upstream）或相关配置漂移 MUST 拒绝受影响阶段，不猜测替代来源。游离提交（Detached HEAD）、没有可核实上游（Upstream）、正在进行 Git 整合或存在未解决冲突 MUST 明确不可用。同源会话（Session）写入授权 MUST 与既有 Git 写入一致，只读接口 MUST NOT 隐式同步（Sync）。

#### Scenario: 原观察过期
- **WHEN** 观察后当前分支（Branch）或上游（Upstream）配置变化，或者同路径检出身份被替换
- **THEN** 系统 MUST 拒绝旧同步（Sync）请求，MUST NOT 使用新分支（Branch）、猜测远端或改变其他来源

#### Scenario: 无上游或未完成整合
- **WHEN** 所选工作树（Worktree）处于游离提交（Detached HEAD）、没有已跟踪上游（Upstream）或存在正在进行的整合
- **THEN** 同步（Sync） MUST 明确不可用并说明原因，其他可安全读取和来源操作 MUST 保持

### Requirement: 有界获取与必要整合

同步（Sync） MUST 先获取固定上游（Upstream）对应的远程引用（Ref），MUST NOT 将范围扩展到无关远端或分支（Branch）。需要整合时 MUST 固定本次获取的上游提交（Commit）；只有落后时 MUST 普通快进（Fast-forward），分叉时 MUST 仅重放当前分支（Branch）相对该固定上游（Upstream）尚未推送的提交（Commit）。本次上游（Upstream）相对之前已观察记录非快进改写、待重放范围存在合并提交（Merge Commit）、无法确认安全整合关系或需要执行外部内容过滤器（Filter）时 MUST 局部拒绝整合并保留已成立的获取结果。确实需要整合时，文件与索引（Index） MUST 干净，MUST 保护实际存在的未跟踪或忽略文件不被覆盖；无需整合、仅需推送时 MUST 保留既有未提交内容并允许普通精确推送（Push）。系统 MUST NOT 自动临时保存（Stash）、丢弃文件、建立或重新绑定上游（Upstream）、创建合并提交（Merge Commit）、强推、清理或更新无关引用（Ref），MUST NOT 递归更新子模块（Submodule）。

#### Scenario: 只有远程提交
- **WHEN** 获取后当前分支（Branch）仅落后于固定上游（Upstream），且工作内容干净
- **THEN** 系统 MUST 快进（Fast-forward）到本次获取的上游提交（Commit），不创建合并提交（Merge Commit）或改变其他工作树（Worktree）

#### Scenario: 本地与上游分叉
- **WHEN** 本次上游（Upstream）从之前已观察记录正常前进，当前分支（Branch）还有相对固定上游（Upstream）未推送提交（Commit），且工作内容干净
- **THEN** 系统 MUST 将该范围提交（Commit）变基（Rebase）到本次获取的固定提交（Commit），MUST NOT 重写该固定上游（Upstream）已有提交（Commit）

#### Scenario: 未提交内容与实际整合需要
- **WHEN** 所选工作树（Worktree）存在未提交内容
- **THEN** 获取后需要整合时 MUST 明确拒绝整合并保留原文件及索引（Index）；无需整合时 MUST 允许普通精确推送（Push）且保留未提交内容

#### Scenario: 合并结构与现存文件保护
- **WHEN** 需要变基（Rebase）的本地范围包含合并提交（Merge Commit），或整合将覆盖实际存在的未跟踪或忽略文件
- **THEN** 系统 MUST 局部拒绝整合，保留获取结果及原文件，MUST NOT 静默扁平化合并结构、丢失冲突决议或覆盖现存内容

#### Scenario: 远程改写或不安全转换
- **WHEN** 上游（Upstream）已相对之前记录非快进改写，或安全整合需要运行外部内容过滤器（Filter）
- **THEN** 系统 MUST 保留获取结果并停止整合和推送，明确原因，MUST NOT 自动重放可能已共享的旧上游（Upstream）成果或执行该过滤器（Filter）

### Requirement: 成功整合后的普通精确推送

同步（Sync） MUST 仅在获取与必要整合均已成功或确认无需执行时继续普通精确推送（Push），固定原核实上游（Upstream）的唯一推送地址及完整目标引用（Ref），包含当前分支（Branch）全部未推送提交（Commit）。获取与整合后 MUST 按当前事实重新观察推送版本，MUST NOT 把操作自身引起的预期上游（Upstream）变化当作陈旧请求，也 MUST NOT 接受目标配置漂移。远端并发变化导致普通推送（Push）拒绝时 MUST 停止并报告，MUST NOT 自动再次获取、变基（Rebase）或强推。无提交（Commit）差异时 MUST 明确无需整合或推送，不创建新提交（Commit）。

#### Scenario: 获取改变上游记录
- **WHEN** 获取正常更新本机上游（Upstream）记录，必要整合成功，原目标配置未变化
- **THEN** 系统 MUST 依据新观察向固定目标普通精确推送（Push），MUST NOT 因正常获取改变上游（Upstream）提交（Commit）而错误拒绝

#### Scenario: 推送目标或远端再次变化
- **WHEN** 整合后推送配置漂移，或者远端在获取后出现其他提交（Commit）
- **THEN** 系统 MUST 保留已完成获取及本地整合成果，拒绝陈旧目标或报告普通推送（Push）失败，MUST NOT 扩大推送范围或自动重试整合

### Requirement: 阶段结果、冲突现场与局部重新观察

获取、整合及推送 MUST 分别报告成功、无需执行、不可用、失败、未执行或结果未知，保留各阶段已核实的实际分支（Branch）、完整提交（Commit）和副作用。变基（Rebase）冲突 MUST 保留真实冲突现场及可查看改动入口，停止后续推送，MUST NOT 自动中止、丢弃或以零效果失败掩盖现场。超时、身份变化和未知结果 MUST 只报告已知事实，不自动重发写入。应用内针对同一 Git 公共目录（Common Directory）的 Git 写入 MUST 防止相互交错；外部写入仍 MUST 逐阶段核对。一个来源的问题 MUST 不阻止其他健康代码库（Repository）。

页面 MUST 提供真实等待及逐阶段反馈，全部正常完成或已确认无需执行时 MUST 静默，MUST NOT 显示成功通知；异常、不可用、结果未知或部分失败时 MUST 以不占源代码管理（Source Control）目录布局的通知浮窗（Notification）展示，默认驻留约 6 秒、悬停暂停自动关闭且可手动关闭。异常通知 MUST 使用沿用主题且清楚可辨的边框和背景。通知 MUST 保留本次具体来源及获取、整合、推送的真实阶段结果、说明和冲突改动查看入口，MUST NOT 以最终失败抹除已成功阶段；结束后按发起时工作空间（Workspace）、代码库（Repository）和工作树（Worktree）身份重新观察对应代码库（Repository）及受影响当前内容；成功事实 MUST 不等待全部目录重读。较旧或跨工作空间（Workspace）迟到响应 MUST NOT 覆盖较新或其他来源事实；离开页面或关闭菜单（Menu） MUST NOT 自动取消已发写入、重发请求或遗漏对应局部重新观察。显式历史筛选、固定提交（Commit）阅读及其他来源 MUST 保持。

#### Scenario: 冲突后保留现场
- **WHEN** 变基（Rebase）发生冲突
- **THEN** 系统 MUST 反馈获取已成立、整合冲突及推送未执行，保留冲突文件与 Git 现场并允许查看，MUST NOT 自动中止整合或继续推送

#### Scenario: 推送失败与页面迁移
- **WHEN** 整合成功而推送失败，或原页面关闭后结果才返回
- **THEN** 系统 MUST 保留并表达本地整合成果，按原来源触发局部重新观察，不否定已成立阶段、不影响其他工作空间（Workspace）且不重发写入

#### Scenario: 同库并发写入
- **WHEN** 同一真实代码库（Repository）的另一个工作树（Worktree）已有应用内 Git 写入进行中
- **THEN** 同步（Sync） MUST 明确等待或局部拒绝重叠写入，MUST NOT 与其交错执行获取、整合和推送

#### Scenario: 同步结果浮窗保留阶段及现场
- **WHEN** 同步（Sync）获取成功但整合冲突，用户停留查看通知浮窗（Notification）
- **THEN** 浮窗 MUST 表达获取已成立、整合冲突和推送未执行，保留查看现有改动入口，悬停期间 MUST 保持可操作
- **AND** 浮窗 MUST 默认约 6 秒后关闭且允许手动关闭，MUST 不占目录常驻空间；关闭 MUST 不取消已发写入或清理冲突现场

#### Scenario: 正常同步静默且已成立事实保持
- **WHEN** 本次同步（Sync）全部正常完成或已确认无需整合与推送（Push）
- **THEN** 页面 MUST 不显示结果通知浮窗（Notification），已成立分支（Branch）、提交（Commit）及适用状态仍 MUST 按原有身份重新观察并保持
- **AND** 后续异常或部分失败 MUST 得到短时通知，MUST NOT 因静默成功而取消写入、清除结果事实或自动重试

### Requirement: 同步观察与阶段执行采用一致有效配置

同步（Sync）的来源、上游（Upstream）、获取和推送配置观察，以及各阶段 Git 执行 MUST 一致采用有效本机系统、用户及代码库（Repository）配置，并尊重调用环境明确选择的配置文件或系统配置禁用。应用 MUST NOT 无条件屏蔽系统配置或硬编码平台凭证助手（Credential Helper）；外部 Git 定位和未授权配置注入 MUST 继续被清理，非交互认证、禁止隐式获取、固定目标及既有阶段安全边界 MUST 保持。配置变化 MUST 按原有漂移规则拒绝受影响阶段，MUST NOT 修改用户配置以尝试恢复同步（Sync）。

#### Scenario: 系统传输配置在同步阶段有效
- **WHEN** 固定上游（Upstream）的传输或凭证配置来自本机系统配置，用户显式同步（Sync）
- **THEN** 配置观察和适用写入阶段 MUST 使用同一有效配置，不因应用屏蔽系统配置而改变目标或制造认证失败
- **AND** 真实认证失败 MUST 保留逐阶段事实，不弹出交互输入或自动重试

#### Scenario: 观察后有效配置漂移
- **WHEN** 原观察使用的有效配置在同步（Sync）后续阶段前发生变化
- **THEN** 受影响阶段 MUST 拒绝旧观察，已确认效果 MUST 保留，MUST NOT 按新配置猜测替代上游（Upstream）或推送目标

### Requirement: 目录级全部同步入口

源代码管理（Source Control）目录标题的操作菜单（Menu）在“全部获取远程”之外 MUST 提供“全部同步”入口，该入口 MUST 有可访问名称与键盘操作，并与单条同步（Sync）、全部获取远程及只读刷新明确区别。全部同步 MUST 只作用于发起时已观察的代码库（Repository）及其实际枚举的工作树（Worktree），按发起时的来源身份逐项执行与单条同步完全相同的上下文核对、获取（Fetch）、必要整合和普通推送（Push）流程；MUST NOT 扩展为新观察出的其他来源、不接受任意目录或地址，也不 MUST NOT 建立或重新绑定上游（Upstream）。已观察目录中不可同步的对象——来源未就绪或目录离线、无本地分支（Branch）、无提交（Commit）、未设置或尚未确认远端跟踪分支——MUST 在本次批次中明确跳过并保留真实原因，MUST NOT 冒充已同步。同一真实 Git 公共目录（Common Directory）已有应用内写入进行中的对象 MUST 跳过本次批次，MUST NOT 与在途写入交错；逐项执行 MUST 保持顺序，MUST NOT 并行发起写入或把一次批量请求当作跨库原子事务（Transaction）。每个对象的阶段结果、等待状态与通知语义 MUST 与单条同步一致；全部正常完成 MUST 静默，任一对象异常、不可用、结果未知或部分失败 MUST 以现有不占目录布局的通知浮窗（Notification）逐条表达真实阶段结果。结束后 MUST 按发起时工作空间（Workspace）、代码库（Repository）与工作树（Worktree）身份重新观察受影响来源；页面迁移或菜单（Menu）关闭 MUST NOT 取消已发写入、重发请求或遗漏局部重新观察。

#### Scenario: 目录菜单发起全部同步

- **WHEN** 用户打开源代码管理目录标题的操作菜单（Menu）并选择“全部同步”
- **THEN** 系统 MUST 按发起时已观察身份，依次对每个可同步工作树（Worktree）执行与单条同步相同的完整流程，期间入口 MUST 表达真实等待状态

#### Scenario: 不可同步对象跳过并保留原因

- **WHEN** 批次中包含未设置远端跟踪分支、无本地分支（Branch）或来源离线的对象
- **THEN** 这些对象 MUST 被跳过且保留真实原因，MUST NOT 猜测上游（Upstream）或报告为已同步；其余可同步对象 MUST 继续正常执行

#### Scenario: 在途写入不交错

- **WHEN** 批次执行到某个工作树（Worktree）时，同一真实 Git 公共目录（Common Directory）已有应用内写入进行中
- **THEN** 该对象 MUST 在本次批次中跳过，不与在途写入交错执行获取、整合或推送

#### Scenario: 部分失败逐条表达

- **WHEN** 批次中一个对象的整合（Rebase）冲突，其他对象正常完成
- **THEN** 通知 MUST 逐条保留冲突对象的获取已成立、整合冲突、推送未执行及其查看改动入口，正常对象保持静默语义，MUST NOT 以单条失败抹除已成功对象
