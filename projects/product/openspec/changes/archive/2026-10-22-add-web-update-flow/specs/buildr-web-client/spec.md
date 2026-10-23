## MODIFIED Requirements

### Requirement: Buildr Web 必须在全局壳层展示 GA 与 RC 更新

Buildr Web React 客户端 MUST 在全局顶部消费 Release Awareness API并展示 GA/RC 更新提示；提示 MUST 在全局与 Workspace 路由保持一致，不得由各页面重复实现。客户端 MUST 在页面可见时按周期重新检查发布轨道，并 MUST 允许用户随时通过同一入口手动重新检查；有可安装更新时 MUST 在全局顶部入口给出可辨认提示，点击入口 MUST 展示当前版本与两轨道版本详情。

#### Scenario: RC 可更新

- **WHEN** candidate 轨道高于当前安装
- **THEN** 全局入口 MUST给出可辨认更新提示
- **AND** 详情 MUST显示当前版本与 RC 候选版本

#### Scenario: GA 已发布且当前为 RC

- **WHEN** stable 轨道存在高于当前 prerelease 的 GA 版本
- **THEN** 详情 MUST说明 GA 已发布并标记 `buildr update --track stable` 对应轨道

#### Scenario: 用户处理提示

- **WHEN** 用户选择复制命令、交给 Agent 或页面内更新
- **THEN** 复制命令与交给 Agent MUST只生成或复制明确轨道的命令/prompt
- **AND** 客户端 MUST NOT直接调用 npm 或创建 Workspace Task

#### Scenario: 无更新或查询失败

- **WHEN** 两个轨道都没有更高版本或 Release Awareness 暂不可用
- **THEN** 客户端 MUST不阻断主导航与页面内容

#### Scenario: 周期检查不打断使用

- **WHEN** 页面保持打开且处于可见状态
- **THEN** 客户端 MUST按周期在后台重新检查并在有可安装更新时更新入口提示
- **AND** 页面不可见时 MUST暂停周期检查

## ADDED Requirements

### Requirement: Buildr Web 必须提供页面内分阶段更新交互

Buildr Web MUST 在全局更新详情中提供页面内分阶段更新：用户确认更新后请求 update prepare 并展示准备中状态；任务转为 `ready` 后 MUST 提示用户二次确认；用户确认后请求 update apply 并展示安装与重启进行状态，随后按既有重启观察机制等待新实例接管并恢复页面。任务 `failed` 时 MUST 展示真实原因并允许重新准备。development checkout 来源 MUST 以明确的开发模拟形式提供同一交互：不展示真实轨道版本或复制命令，标记模拟语义，apply 完成（`completed`）后 MUST 经既有重启接口真实重启当前开发实例。Preview 实例 MUST 不提供该交互入口。

#### Scenario: 用户确认进入后台准备

- **WHEN** 用户在详情中选择更新
- **THEN** 客户端 MUST以所选轨道与详情版本发起 prepare 并展示准备中状态
- **AND** 准备期间 MUST不阻断页面其他操作

#### Scenario: 就绪后二次确认安装

- **WHEN** 任务状态为 `ready`
- **THEN** 详情 MUST提示已就绪并要求用户确认安装与重启
- **AND** 用户确认 MUST以钉住版本发起 apply

#### Scenario: 安装后恢复页面

- **WHEN** apply 已受理
- **THEN** 客户端 MUST展示安装与重启进行状态，并按既有重启观察机制等待新实例后恢复页面
- **AND** 实例不可达期间 MUST保持等待提示而非误报成功

#### Scenario: 任务失败可重试

- **WHEN** 任务状态为 `failed`
- **THEN** 详情 MUST展示失败原因
- **AND** MUST允许用户重新发起准备

#### Scenario: 开发版展示模拟更新入口

- **WHEN** 当前实例为 development checkout 来源
- **THEN** 全局更新入口 MUST可用并标记开发模拟语义，展示当前版本与本地推算的模拟目标版本
- **AND** MUST NOT展示真实轨道版本、复制命令或交给 Agent 动作

#### Scenario: 开发版模拟完成后真实重启

- **WHEN** development checkout 来源的更新任务转为 `completed`
- **THEN** 客户端 MUST经既有 `app/restart` 接口重启当前实例并按重启观察机制恢复页面
- **AND** MUST NOT把模拟流程误报为真实 npm 更新
