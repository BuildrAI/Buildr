## ADDED Requirements

### Requirement: Buildr Web 必须在全局壳层展示 GA 与 RC 更新
Buildr Web React 客户端 MUST 在全局顶部消费 Release Awareness API并展示 GA/RC 更新提示；提示 MUST 在全局与 Workspace 路由保持一致，不得由各页面重复实现。

#### Scenario: RC 可更新
- **WHEN** candidate 轨道高于当前安装
- **THEN** 全局提示 MUST显示当前版本与 RC 候选版本
- **AND** MUST提供复制 `buildr update --track candidate` 或交给 Agent 的动作

#### Scenario: GA 已发布且当前为 RC
- **WHEN** stable 轨道存在高于当前 prerelease 的 GA 版本
- **THEN** 全局提示 MUST说明 GA 已发布并提供 `buildr update --track stable`

#### Scenario: 用户处理提示
- **WHEN** 用户选择复制命令或交给 Agent
- **THEN** 客户端 MUST只生成或复制明确轨道的命令/prompt
- **AND** MUST NOT直接调用 npm 或创建 Workspace Task

#### Scenario: 无更新或查询失败
- **WHEN** 两个轨道都没有更高版本或 Release Awareness 暂不可用
- **THEN** 客户端 MUST不阻断主导航与页面内容
