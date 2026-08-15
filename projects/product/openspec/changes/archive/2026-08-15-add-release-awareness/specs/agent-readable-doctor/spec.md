## ADDED Requirements

### Requirement: Doctor 必须非阻断投影版本发布感知
Buildr Doctor MUST 在 JSON 与人类可读输出中提供独立 `releaseAwareness` 与 `notices`，展示 GA/RC 更新，但这些字段 MUST NOT 进入 Workspace findings、repair plan、next steps、`ok` 或 readiness 计算。

#### Scenario: 发现 GA 或 RC 更新
- **WHEN** Doctor 获得某轨道高于当前安装的 Release Awareness snapshot
- **THEN** Doctor MUST 在独立 notices 中展示版本和对应 `buildr update --track <track>` 动作
- **AND** `health.ready` MUST保持由原 Workspace 与 selected runtime 诊断决定

#### Scenario: Registry 查询失败
- **WHEN** Doctor 无法刷新 Release Awareness
- **THEN** Doctor MUST将 releaseAwareness 标记为 unavailable 或 stale
- **AND** MUST NOT增加 finding、repair step、next step或非零退出状态

#### Scenario: compact 与 full 一致
- **WHEN** Agent 分别请求 compact 与 full Doctor JSON
- **THEN** 两种投影 MUST包含语义一致的 releaseAwareness 与 notices
