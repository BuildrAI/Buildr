## ADDED Requirements

### Requirement: Buildr package 必须一致交付 Component dependency contributions
Buildr package MUST让 Component definition、builtin descriptors、workspace source、runtime resolver、Doctor和验证 fixtures 对结构化 Skill dependency contributions 保持一致，并 MUST避免把 Component-owned dependencies 重复维护在 package builtin `requires` 中。

#### Scenario: 安装带 dependency contribution 的 Component
- **WHEN** package install或sync安装enabled Component及其成员Skills/fragments
- **THEN**目标 Skills的runtime projection和capability graph MUST包含Component definition声明的effective dependencies
- **AND**workspace Skill manifest MUST保持Skill资产登记而不复制Component-owned dependency authority

#### Scenario: 卸载 Component
- **WHEN** Component lifecycle安全卸载或disable该Component
- **THEN**其fragments与dependency contributions MUST同时从后续runtime assembly和graph消失
- **AND**base Skill及其他Components的requires MUST保持不变

#### Scenario: Package source/runtime parity
- **WHEN** package verification检查OpenSpec Component
- **THEN**它 MUST验证propose/apply/update的required/optional graph、sync/archive的无Task依赖拒绝route、apply proposal gate及Component integrity
- **AND**任何definition、builtin descriptor、workspace projection或rendered runtime漂移 MUST fail closed
