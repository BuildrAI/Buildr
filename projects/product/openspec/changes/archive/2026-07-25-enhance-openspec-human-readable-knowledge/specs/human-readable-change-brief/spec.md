## ADDED Requirements

### Requirement: 正式 Change 必须提供人类可读 Brief
Buildr MUST 为新建或主动修订的正式 OpenSpec Change 维护同级 `brief.md` companion artifact，使普通用户无需先拼接全部技术 artifacts 即可理解变更；Brief MUST 至少表达一句话摘要、背景与问题、目标与非目标、受影响用户或角色、核心流程、关键变化、影响/风险/兼容性、验收摘要和技术 artifacts 入口。

#### Scenario: 创建正式 Change
- **WHEN** Agent 使用 Buildr 管理的 OpenSpec propose workflow 创建完整 Change
- **THEN** Change root MUST 包含 `brief.md`
- **AND** Brief MUST 使用已确认的 proposal、design、specs 和 tasks 内容形成面向人的整体叙事

#### Scenario: 某个章节不适用于当前 Change
- **WHEN** Change 不存在有意义的用户故事、before/after 流程或兼容性影响
- **THEN** Brief MUST 使用明确的“不适用”或简短说明保持边界清楚
- **AND** Agent MUST NOT 为填满模板虚构角色、流程、风险或验收事实

#### Scenario: 修订 planning artifacts
- **WHEN** `openspec-update-change` 改变 Change 的 scope、核心流程、关键影响或验收
- **THEN** Agent MUST 在同一 planning 修订中更新 Brief
- **AND** Brief MUST NOT 保留与更新后标准 artifacts 冲突的旧叙述

### Requirement: Brief 不得成为第二套规范来源
Brief MUST 只组织和解释 Change 标准 artifacts 已支持的事实；proposal MUST 继续决定 why 与 scope，design MUST 继续决定技术取舍，specs MUST 继续决定规范行为，tasks、实现和 evidence MUST 继续决定执行状态。

#### Scenario: Brief 出现未被规范支持的行为
- **WHEN** Agent 发现 Brief 陈述的行为无法从 proposal、design 或 delta specs 得到支持
- **THEN** Agent MUST 先修订对应权威 artifact 或删除该陈述
- **AND** MUST NOT 仅以 Brief 内容作为实现或验收依据

#### Scenario: Brief 与实现状态不一致
- **WHEN** Brief 的验收摘要或进度表达与 tasks、实现或验证 evidence 冲突
- **THEN** reconcile 或 inspect MUST 报告冲突并阻止把 Change 表述为已对齐
- **AND** Agent MUST 更新权威状态后再刷新 Brief

### Requirement: Brief 必须随 Change 生命周期保持稳定可读
Buildr MUST 将 `brief.md` 保存在 Change root 内并随 active Change 原子归档；旧 Change 缺少 Brief 时 MUST 保持可读兼容，且 MUST NOT 在只读索引或页面访问期间自动生成或回写 Brief。

#### Scenario: 归档包含 Brief 的 Change
- **WHEN** OpenSpec archive 将 active Change 移入 archive
- **THEN** `brief.md` MUST 随同 proposal、design、specs 和 tasks 一起移动
- **AND** archived Brief MUST 保持为该历史 Change 的稳定人类阅读入口

#### Scenario: 查看没有 Brief 的历史 Change
- **WHEN** active 或 archived Change 不包含 `brief.md`
- **THEN** Buildr MUST 明确报告 Brief unavailable 并继续提供现有标准 artifacts
- **AND** 读取流程 MUST NOT 创建文件或推断一份虚构 Brief

