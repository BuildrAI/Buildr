## Purpose

为已登记代码库（Repository）的明确工作树（Worktree）提供用户确认的丢弃更改能力，以当前文件、索引（Index）与提交（Commit）的真实内容版本约束写入，保留范围外成果并如实表达局部失败。

## ADDED Requirements

### Requirement: 明确路径与当前工作树范围

系统 MUST 提供单文件“丢弃更改”及当前工作树（Worktree）“丢弃所有更改”。已跟踪路径 MUST 恢复至 HEAD 并清除相应已暂存与未暂存更改；新增路径 MUST 删除文件及暂存记录。重命名 MUST 包含配对路径。系统 MUST NOT 修改忽略文件、无关文件、其他工作树（Worktree）、提交历史或远程引用。未有 HEAD 时 MUST 允许丢弃当前新增路径。

#### Scenario: 文件两层更改
- **WHEN** 用户确认丢弃同时有暂存与未暂存更改的单文件
- **THEN** 文件与索引（Index）MUST 恢复至 HEAD，其他路径保持

#### Scenario: 全部丢弃与新增文件
- **WHEN** 用户确认丢弃当前工作树（Worktree）全部更改
- **THEN** 系统 MUST 恢复已跟踪文件并删除已观察新增文件，保留忽略文件及其他工作树（Worktree）

### Requirement: 确认与已观察版本校验

写入 MUST 绑定已登记代码库（Repository）、枚举出的明确工作树（Worktree）和确认前完整读取的内容版本。确认 MUST 展示实际目录、路径或数量、恢复及删除影响和不可恢复说明。服务端 MUST 复用会话（Session）写入授权、操作互斥和索引（Index）锁；来源、内容或索引（Index）变化 MUST 拒绝旧请求。不完整读取、冲突、进行中的 Git 操作、子模块（Submodule）、不支持的特殊文件或不安全路径 MUST 明确拒绝，不扩大删除范围。

#### Scenario: 确认后再次编辑
- **WHEN** 确认读取后内容或索引（Index）发生变化
- **THEN** 系统 MUST 拒绝旧版本写入并提示刷新

#### Scenario: 取消确认
- **WHEN** 用户取消确认
- **THEN** 系统 MUST 不发送丢弃写入

### Requirement: 真实结果与刷新

系统 MUST 表达等待状态并防止重复写入；完成或失败后 MUST 重新观察对应来源。部分失败 MUST 保留已发生路径效果及失败说明，不报告全部成功，不自动重试。历史查看 MUST 不提供丢弃入口。

#### Scenario: 局部执行失败
- **WHEN** 部分路径已恢复后后续动作失败
- **THEN** 系统 MUST 表达部分完成及真实已完成范围并重新读取，MUST NOT 覆盖并发内容以自动回滚
