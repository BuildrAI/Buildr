## ADDED Requirements

### Requirement: Task Preview 必须由 Preview Application 持有资源所有权
Buildr Web Preview MUST在自身实例store中保存Task ID、canonical Workspace、matching Worktree evidence、实际Buildr Product checkout、repository、branch、HEAD、PID、URL、secret与provider identity。Preview MUST独立执行start/list/stop和失败回收，不得要求Environment ready或写Environment Receipt。

#### Scenario: 从Task Worktree启动Preview
- **WHEN** Agent提供Task ID与canonical Workspace，且matching Worktree evidence证明实际checkout
- **THEN** Preview MUST从该checkout中的Buildr Product入口启动独立loopback实例
- **AND** 只有进程健康且owner写入成功后才 MUST返回started

#### Scenario: Preview启动后owner写入失败
- **WHEN** 子进程已经健康但Preview owner无法安全保存
- **THEN** Preview MUST使用刚创建的ChildProcess/secret认证停止该实例并确认回收
- **AND** MUST NOT报告资源已由Task、Worktree或Environment管理

#### Scenario: Preview停止
- **WHEN** stop请求的Task、Workspace、Worktree evidence、实例owner与secret完全匹配
- **THEN** Preview MUST停止目标实例并删除本实例状态
- **AND** MUST NOT修改Task Record、Worktree evidence或任何Environment数据

## MODIFIED Requirements

### Requirement: task worktree 必须支持隔离的 Buildr Web 预览实例
Buildr MUST提供`buildr web preview start <instance>`，让Agent从指定Task Worktree或独立Git checkout的Buildr Product入口启动或复用独立loopback Preview。实例名 MUST通过稳定安全校验；Preview MUST使用独立于默认Buildr Web和其他Worktree的状态目录、Workspace registry、实例记录与启动锁，并默认随机选择可用端口。

#### Scenario: 启动两个不同任务预览
- **WHEN** 两个不同Task Worktrees分别使用不同实例名启动Preview
- **THEN** Buildr MUST让两个健康实例同时监听各自loopback URL
- **AND** 两个Preview MUST NOT复用实例记录、启动锁或Workspace registry，默认Buildr Web保持不受影响

#### Scenario: 同一 task environment 复用健康预览
- **WHEN** 同一Task、Workspace、Worktree evidence与Product checkout使用相同实例名再次启动健康Preview
- **THEN** Buildr MUST复用原实例并返回同一URL与owner identity
- **AND** MUST NOT额外启动第二个进程

#### Scenario: 不同 task environment 请求已被占用的实例名
- **WHEN** 健康Preview的Task、Workspace或Worktree owner与新请求不一致
- **THEN** Buildr MUST拒绝复用或停止该Preview
- **AND** MUST返回当前owner并要求更换实例名或由真实owner停止

## REMOVED Requirements

### Requirement: Preview stop 必须绑定 task environment 所有权
**Reason**: Preview停止真正需要的是实例owner、进程secret与实际Worktree identity，不需要Environment Receipt。

**Migration**: Task Preview stop改为核对Task、canonical Workspace、Worktree evidence、Preview owner、provider identity与secret。

### Requirement: Task Preview 必须登记为 Environment 动态资源
**Reason**: Preview Application本身已拥有创建、探测、停止和失败回收所需全部事实；重复写Environment current只产生双重owner。

**Migration**: Preview成功后只保存Preview owner；Task Finish按需调用`web preview list|stop`，Worktree cleanup保持独立。
