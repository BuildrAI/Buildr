## MODIFIED Requirements

### Requirement: 现有工作保护与就地交互

现有未提交内容不受切换影响且普通 Git 能安全保留时 MUST 允许切换并保留文件、索引内容。会覆盖现有内容、未跟踪文件冲突（包括被忽略但实际存在的文件）、目标已被其他工作树（Worktree）占用、正在进行冲突或整合操作等情况 MUST 局部拒绝；MUST NOT 自动临时保存（Stash）、丢弃内容、强制切换、合并（Merge）或变基（Rebase）。需要执行已配置外部内容过滤器（Filter）的切换 MUST 局部拒绝并说明原因，MUST NOT 静默禁用转换后生成不正确文件或通过过滤器隐式联网。失败 MUST 读取并报告当前真实事实及已发生效果，不把部分写入误报为零效果。

管理列表 MUST 就地按本地、远程分组。条目旁浮层（Popover） MUST 优先显示单个可用动作，普通切换不出现整页遮罩或重复路径说明；占用时提供打开已有位置，受现有改动影响时显示必要文件和查看入口。切换非选中来源 MUST 不改变当前阅读位置或指定历史条件。

分支（Branch）切换成功、返回来源与发起时身份相符且结果不早于目标工作树（Worktree）的当前观察时，页面 MUST 立即采用返回的实际分支（Branch）及提交（Commit）更新对应来源行，并在后台只重新观察对应代码库（Repository）目录和受影响的当前内容，MUST NOT 要求手动整体刷新或等待全部目录、分支清单重读才显示已成立结果或结束本次切换等待。较旧结果 MUST NOT 回退该来源较新的分支（Branch）、提交（Commit）或读取时间，但 MUST 仍触发后台重新观察。明确指定的历史条件及固定提交（Commit）阅读 MUST 保持。后台读取失败 MUST 独立呈现，MUST NOT 将已成功切换改报为失败或把旧分支（Branch）内容标为新来源的已确认内容。

已发切换完成或失败后的读取更新 MUST 按发起时的工作空间（Workspace）、代码库（Repository）及工作树（Worktree）身份触发，不依赖原行内组件仍挂载；同一工作空间（Workspace）的新页面实例 MUST 能据此重新观察对应来源。离开页面、关闭浮层（Popover）或切换工作空间（Workspace） MUST NOT 撤销已发写入、自动重新发送写请求或将原结果更新到其他工作空间（Workspace）的目录。这一更新不要求新增面向人的跨工作空间（Workspace）成功或失败消息。

#### Scenario: 占用与覆盖风险
- **WHEN** 目标已在其他工作树（Worktree）使用，或切换会覆盖现有内容
- **THEN** 浮层（Popover） MUST 就地显示对应原因与打开已有位置或查看改动入口，原文件、索引和当前分支（Branch） MUST 保持

#### Scenario: 非冲突改动与相邻来源
- **WHEN** 用户在非当前阅读的工作位置执行普通可安全保留改动的切换
- **THEN** 该位置 MUST 切换并保留既有内容，当前阅读位置、其他目录和显式历史条件 MUST 保持

#### Scenario: 被忽略文件与外部转换保护
- **WHEN** 目标会覆盖被忽略但实际存在的文件，或本次切换必须运行已配置外部内容过滤器（Filter）
- **THEN** 操作 MUST 局部拒绝并保留原文件、索引和引用（Ref），MUST NOT 执行该过滤器或以未转换文件冒充正确切换成果

#### Scenario: 成功后立即显示实际分支
- **WHEN** 用户切换一个工作树（Worktree）成功，而目录重新读取仍在进行
- **THEN** 对应来源行 MUST 立即显示响应确认的实际分支（Branch）及提交（Commit），受影响的当前内容 MUST 自动重新读取，无需手动刷新
- **AND** 后台读取失败 MUST 只显示读取问题，成功切换事实及其他来源 MUST 保持

#### Scenario: 原工作空间请求迟到成功
- **WHEN** 用户在工作空间（Workspace）A 发起切换，转到工作空间（Workspace）B 后原请求成功
- **THEN** 重新观察的范围 MUST 仍归属于 A 中原代码库（Repository）及工作树（Worktree），MUST NOT 将 A 的分支（Branch）或内容更新到 B 的目录

#### Scenario: 同一工作空间的新页面接收完成更新
- **WHEN** 发起切换的原页面已经卸载，同一工作空间（Workspace）的新目录页面已打开，原请求随后完成或失败
- **THEN** 当前目录 MUST 重新观察原代码库（Repository）及工作树（Worktree），MUST NOT 因原组件卸载而漏掉读取更新或自动重新发送写请求

#### Scenario: 较旧切换结果迟到
- **WHEN** 目录已读取目标工作树（Worktree）的较新分支（Branch）及提交（Commit），较旧切换结果才返回
- **THEN** 当前来源的分支（Branch）、提交（Commit）及读取时间 MUST 保持较新观察，MUST NOT 被较旧结果回退
- **AND** 系统 MUST 仍在后台重新观察对应来源，以核对当前真实事实

#### Scenario: 后续分支读取延迟
- **WHEN** 切换已返回成功，而后续分支（Branch）清单或目标代码库（Repository）读取仍被延迟
- **THEN** 切换成功反馈、浮层关闭及等待结束 MUST 不被该读取阻塞；读取问题 MUST 独立表达，其他代码库 MUST 保持
