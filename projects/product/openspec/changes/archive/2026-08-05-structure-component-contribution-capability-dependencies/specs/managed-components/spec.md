## ADDED Requirements

### Requirement: Component Contribution 可以声明结构化 Skill capability dependency
Buildr MUST 允许 Component 在声明自然语言 Skill Contribution 时，为同一目标 Skill 声明结构化 capability dependency，并 MUST 通过同一 Component definition 和生命周期原子维护 fragment 与 dependency contribution。Buildr MUST NOT从 Markdown 正文推断 capability identity、version 或 mode。

#### Scenario: Contribution 引入 required dependency
- **WHEN** enabled installed Component 为自己已有 fragment 的目标 Skill 声明 capability、正整数 major version 与 `mode: required`
- **THEN** runtime Skill resolution MUST把该 dependency 合并进目标 consumer 的 effective `requires`
- **AND** provider missing、ambiguous、version mismatch、invalid binding 或 runtime unavailable MUST使该 consumer 按 capability graph fail closed

#### Scenario: Contribution 引入 optional dependency
- **WHEN** Component 声明 `mode: optional` 且 fragment 正文说明未 ready 时的安全降级或条件分支停止语义
- **THEN** capability graph MUST把目标 consumer 报告为 ready 或 degraded
- **AND** 命中需要该 provider 的条件分支时 Agent MUST按正文 fail closed，不得把 optional 解释为无条件可绕过

#### Scenario: Component 生命周期改变 dependency contribution
- **WHEN** Component install、update、disable、uninstall 或 restore 改变有效 definition
- **THEN** fragment 与 dependency contribution MUST在同一 Component lifecycle result 中同时生效或移除
- **AND** Buildr MUST NOT另行 patch 目标 Skill 源正文或要求维护者同步编辑 workspace Skill manifest

#### Scenario: Dependency contribution target 无效
- **WHEN** dependency target 不是同一 Component 的 Skill fragment target，字段未知，capability identity 非法，version 非正整数，mode 不受支持或 declaration 重复冲突
- **THEN** Component check/install/update MUST fail closed并保持旧 Component 与 runtime 状态
- **AND** Buildr MUST报告精确 target、declaration 与修复动作

#### Scenario: 多来源依赖确定性合并
- **WHEN** base Skill 或多个 enabled Components 为同一 target 声明相同 capability major version
- **THEN**相同 mode MUST去重，required 与 optional 并存时 effective mode MUST为 required
- **AND**结果 MUST不依赖 Component 安装顺序并保留可诊断 provenance
