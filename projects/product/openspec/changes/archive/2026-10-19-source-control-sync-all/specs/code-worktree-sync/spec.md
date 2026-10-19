## ADDED Requirements

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
