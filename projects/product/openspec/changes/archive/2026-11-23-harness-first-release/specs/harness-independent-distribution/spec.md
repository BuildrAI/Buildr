## ADDED Requirements

### Requirement: 独立 Harness 与 DSH 插件可独立准备和发行

系统 MUST 允许对 `@buildr-ai/buildr-harness` 和 `@buildr-ai/dsh-buildr-harness` 分别选择版本及候选，不改变 Development 发布身份。正式插件 MUST 记录与独立 Harness 的兼容关系，npm 包和 GitHub Release 资产 MUST 分发同一验收原包。

#### Scenario: 首发准备不公开

- **WHEN** 维护者选择任一新目标并仅准备候选
- **THEN** 系统 MUST 保全原包和验证依据，不写公开版本；后续公开 MUST 核对同一原包及发行授权
