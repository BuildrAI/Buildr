## MODIFIED Requirements

### Requirement: 页面入口与受影响内容更新

具体来源行的三个点操作菜单（Menu） MUST 提供单库获取远程（Fetch），代码库（Repository）列表标题的操作菜单（Menu） MUST 提供全部已观察代码库（Repository）的获取入口，并与只读刷新区别。分支（Branch）管理浮层（Popover） MUST 将底部本机重读按钮替换为获取远程（Fetch）云朵下载图标，提供可访问名称及悬停说明；自动本机读取 MUST 保留，打开浮层 MUST NOT 隐式联网。浮层 MUST 显示上次已知成功获取时间，未知时明确无成功获取记录，MUST NOT 将读取时间或失败时间冒充成功获取时间；失败 MUST 保留已有清单及上次成功时间并展示原因。操作进行中 MUST 有真实等待状态；完成后全部正常结果 MUST 静默，MUST NOT 显示成功通知；异常、不可用、结果未知或部分失败时 MUST 以不占源代码管理（Source Control）目录布局的通知浮窗（Notification）提供逐库结果。通知 MUST 使用沿用主题且清楚可辨的边框和背景。无论正常或异常，系统 MUST 重新观察受影响目录及已打开的分支清单。通知 MUST 默认驻留约 6 秒，悬停时暂停自动关闭，并提供明确关闭操作；详情 MUST 保留发起批次内每个代码库（Repository）及失败远程的真实状态和原因，MUST NOT 把旧批次混为本次成功数量。单库获取 MUST 不刷新无关代码库；全部获取 MAY 使用一次明确的全目录刷新。跨工作空间迟到结果 MUST 不更新其他工作空间，不依赖原行组件仍挂载，也不自动重发获取。

#### Scenario: 获取后本机分支清单更新
- **WHEN** 用户通过某个来源行操作菜单（Menu）执行单库获取远程（Fetch）并完成，同时该库分支（Branch）管理浮层（Popover）已打开
- **THEN** 该清单及该库状态 MUST 重新读取，其他库和当前固定阅读 MUST 保持；失败或未知 MUST 可单独查看

#### Scenario: 批量结果短时展示且可停留查看
- **WHEN** 一次批量获取部分成功、部分失败，用户悬停通知浮窗（Notification）并查看逐库详情
- **THEN** 浮窗 MUST 显示该批次的真实数量及各库结果，悬停期间 MUST 保持可操作，移出后 MUST 按剩余时间关闭，也 MUST 可由用户关闭
- **AND** 结果 MUST 不占用源代码管理（Source Control）目录空间，关闭 MUST 不取消已发写入、否定已完成效果或遗漏局部重新观察

#### Scenario: 全正常获取静默且状态继续更新
- **WHEN** 本次单库或批量获取远程（Fetch）的全部对象均正常完成
- **THEN** 页面 MUST 不显示结果通知浮窗（Notification），受影响目录及已打开分支（Branch）清单 MUST 按原有范围重新观察
- **AND** 后续出现异常时 MUST 仍显示本次真实结果，MUST NOT 因此前静默而遗漏失败或重播成功结果

#### Scenario: 浮层显式获取与时间反馈
- **WHEN** 用户打开分支（Branch）管理浮层（Popover），再点击获取远程（Fetch）图标
- **THEN** 打开只读取本机；点击 MUST 仅获取当前已观察代码库（Repository），进行中防止重复触发，完成后重读列表；全部成功才更新上次成功获取时间
- **AND** 失败或部分失败 MUST 保留已有列表、上次成功时间并显示实际原因，切换来源后的迟到结果 MUST NOT 覆盖当前来源
