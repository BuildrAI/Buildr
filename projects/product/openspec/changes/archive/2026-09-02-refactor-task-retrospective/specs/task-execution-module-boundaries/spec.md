## MODIFIED Requirements

### Requirement: Task Execution 与 Verification 必须有清晰的静态 owner
Task Record、Review、Verification、Worktree与Preview MUST保持独立owner；复盘分析是纯Skill，本机文档读取归Task Record。生产模块图 MUST不包含Task Environment或Retrospective Application。

#### Scenario: 检查生产依赖图
- **WHEN** static validation扫描生产模块
- **THEN** MUST不存在Environment或Retrospective descriptor

#### Scenario: Bootstrap组装Task模块
- **WHEN** Bootstrap组装Task能力
- **THEN** MUST只安装Task Record、Review、Verification、Worktree、Overview和Parent等当前模块

#### Scenario: Doctor 生成 diagnostics
- **WHEN** Doctor收集Task diagnostics
- **THEN** MUST不调用Environment或Retrospective Application

#### Scenario: Task Verification读取测试地图
- **WHEN** Task Verification读取Project测试地图
- **THEN** MUST直接使用Verification declaration owner

#### Scenario: Verification 解析 declaration
- **WHEN** Verification解析Project声明
- **THEN** MUST不生成Environment或Retrospective状态

## REMOVED Requirements

### Requirement: Internal Workflow Route 必须分离清单、分发与业务执行
**Reason**: Task内部workflow route只剩旧Retrospective Driver消费者，现已整体删除。
**Migration**: Bootstrap保留自身必要的非Task内部动作，不保留Task route catalog/router。
