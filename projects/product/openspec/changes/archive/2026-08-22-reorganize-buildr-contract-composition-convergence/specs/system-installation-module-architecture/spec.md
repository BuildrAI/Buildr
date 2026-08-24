## ADDED Requirements

### Requirement: Release Version 规则必须由 System Installation Domain 拥有
Buildr MUST 将 SemVer parse、compare 与 default release track 规则归入 `system/installation/domain`，Release Awareness Application 与 release tools MUST复用同一 Domain 实现，且迁移 MUST保持版本判断和发布行为等价。

#### Scenario: Release Awareness 判断更新轨道
- **WHEN** System Installation 解析当前版本或 registry dist-tag
- **THEN** Release Awareness MUST调用 System Installation Domain 的 release version 规则
- **AND** stable/candidate 判断、无效版本诊断和版本比较结果 MUST与迁移前一致

#### Scenario: Release tools 校验版本
- **WHEN** release contract 或 registry version state 校验版本
- **THEN** release tools MUST复用同一 System Installation Domain 实现
- **AND** MUST NOT复制第二份 SemVer parser 或依赖旧顶层 Domain 路径

#### Scenario: 检查旧全局 Domain
- **WHEN** 架构验证扫描生产源码和 release tools
- **THEN** `src/domain/release-version.mjs` MUST不存在且无引用
