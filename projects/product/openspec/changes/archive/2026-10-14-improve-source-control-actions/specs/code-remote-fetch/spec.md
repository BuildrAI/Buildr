## MODIFIED Requirements

### Requirement: 页面入口与受影响内容更新

具体来源行的三个点操作菜单（Menu） MUST 提供单库获取远程（Fetch），代码库（Repository）列表标题的操作菜单（Menu） MUST 提供全部已观察代码库（Repository）的获取入口，并与只读刷新区别。分支（Branch）管理浮层（Popover） MUST 保留本机分支（Branch）清单重新读取，不再提供获取远程（Fetch）入口。操作进行中 MUST 有真实等待状态；完成后 MUST 提供逐库结果并重新观察受影响目录及已打开的分支清单。单库获取 MUST 不刷新无关代码库；全部获取 MAY 使用一次明确的全目录刷新。跨工作空间迟到结果 MUST 不更新其他工作空间，不依赖原行组件仍挂载，也不自动重发获取。

#### Scenario: 获取后本机分支清单更新
- **WHEN** 用户通过某个来源行操作菜单（Menu）执行单库获取远程（Fetch）并完成，同时该库分支（Branch）管理浮层（Popover）已打开
- **THEN** 该清单及该库状态 MUST 重新读取，其他库和当前固定阅读 MUST 保持；失败或未知 MUST 可单独查看
