## ADDED Requirements

### Requirement: Release workflow 必须同时回读 GA 与 RC tag
Buildr release workflow MUST 在公开 mutation 前后读取 npm `latest` 与 `next`，校验版本类型、目标 tag推进和非目标 tag不变；单一目标 tag readback MUST NOT作为完整发布收敛证据。

#### Scenario: 发布 RC 只推进 next
- **WHEN** prerelease 版本通过 `next` 发布
- **THEN** 发布后 `next` MUST等于新版本
- **AND** `latest` MUST等于发布前观测值

#### Scenario: 发布 GA 只推进 latest
- **WHEN** 稳定版本通过 `latest` 发布
- **THEN** 发布后 `latest` MUST等于新版本
- **AND** `next` MUST等于发布前观测值

#### Scenario: 目标 tag 类型错误
- **WHEN** RC 发布后的 `next` 不是 prerelease，或 GA 发布后的 `latest` 不是稳定版本
- **THEN** workflow MUST形成可解释的 tag语义诊断并失败
- **AND** 非目标 tag 已存在的类型异常 MUST保持原值并留给 Release Awareness 诊断，不得由本次发布静默修改

#### Scenario: 非目标 tag 漂移
- **WHEN** 发布期间非目标 tag 不同于冻结的发布前值
- **THEN** workflow MUST失败并报告 before/after
- **AND** MUST NOT把该漂移伪装成本次发布的成功副作用
