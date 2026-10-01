## MODIFIED Requirements

### Requirement: 正式 Change 必须提供人类可读 Brief
Buildr MUST 为新建或主动修订的正式 OpenSpec Change 维护同级 `brief.md` companion artifact，使普通用户无需先拼接全部技术材料即可理解该具体规范变更。变更说明（Change Brief）MUST 解释该变更的一句话摘要、必要背景、具体目标与非目标、真实关键变化、影响/风险/兼容性、验收摘要与技术材料入口；受影响角色和核心流程只在有意义时表达。任务整体问题、需求、范围和完成依据 MUST 由独立任务说明（Task Brief）承载；Change Brief MUST 通过明确任务身份和项目根逻辑 Markdown 引用（如 `@project/tasks/<task-id>/brief.md`）指向该任务唯一 Task Brief，根逻辑引用 MUST 在 active 与 archived Change 中保持同一项目范围含义，MUST NOT 依赖归档前目录深度；普通相对 Markdown 引用 MUST 保持既有语义。Change Brief MUST NOT 复制并长期维护同义任务正文，也不得取代任务说明。一个任务的零到多个变更和多个任务对同一变更的引用 MUST 保持可表达，不强制一对一归属。

#### Scenario: 创建正式 Change
- **WHEN** Agent 使用 Buildr 管理的 OpenSpec propose workflow 创建完整 Change
- **THEN** Change root MUST 包含 `brief.md`
- **AND** Brief MUST 使用已确认的 proposal、design、specs 和 tasks 内容解释本次具体变化，并引用适用任务的唯一 Task Brief

#### Scenario: 某个章节不适用于当前 Change
- **WHEN** Change 不存在有意义的用户故事、before/after 流程或兼容性影响
- **THEN** Brief MUST 使用明确的“不适用”或简短说明保持边界清楚
- **AND** Agent MUST NOT 为填满模板虚构角色、流程、风险或验收事实

#### Scenario: 修订 planning artifacts
- **WHEN** `openspec-update-change` 改变 Change 的 scope、核心流程、关键影响或验收
- **THEN** Agent MUST 在同一 planning 修订中更新 Brief
- **AND** Brief MUST NOT 保留与更新后标准 artifacts 冲突的旧叙述

#### Scenario: 一个任务关联多个变更
- **WHEN** 同一 Task 关联多个真实 Change
- **THEN** 各 Change Brief MUST 引用同一任务的唯一 Task Brief，并分别解释自身变化
- **AND** MUST NOT 把 Task Brief 拷入每个 Change 或合并多个 Change Brief 冒充任务正文

#### Scenario: 多个任务引用同一变更
- **WHEN** 多个 Task 关联同一 Change
- **THEN** 系统 MUST 保留各任务的逻辑引用，变更说明中的任务入口 MUST 不覆盖另一任务入口或宣称唯一反向归属
- **AND** 对每个明确引用的任务 MUST 指向其唯一 Task Brief；共享同一适用正文时 MUST 引用原文而非复制

### Requirement: Brief 不得成为第二套规范来源
变更说明（Change Brief）MUST 只组织和解释 Change 标准 artifacts 已支持的事实；proposal MUST 继续决定 why 与 scope，design MUST 继续决定技术取舍，specs MUST 继续决定规范行为，tasks、实现和 evidence MUST 继续决定执行状态。独立任务说明（Task Brief）MUST 表达任务需求，不成为另一份变更规范或专业状态来源；相互引用 MUST 不改变各自权威边界。Change Brief MUST 不重复维护任务需求正文或从材料存在推断任务完成。

#### Scenario: Brief 出现未被规范支持的行为
- **WHEN** Agent 发现 Brief 陈述的行为无法从 proposal、design 或 delta specs 得到支持
- **THEN** Agent MUST 先修订对应权威 artifact 或删除该陈述
- **AND** MUST NOT 仅以 Brief 内容作为实现或验收依据

#### Scenario: Brief 与实现状态不一致
- **WHEN** Brief 的验收摘要或进度表达与 tasks、实现或验证 evidence 冲突
- **THEN** reconcile 或 inspect MUST 报告冲突并阻止把 Change 表述为已对齐
- **AND** Agent MUST 更新权威状态后再刷新 Brief

#### Scenario: Task Brief 更新而具体变化未变
- **WHEN** 任务说明更新，但当前 Change 所承载的具体规范变化保持不变
- **THEN** Change Brief MUST 继续通过引用读取任务当前正文，并核对自身摘要及引用是否仍适用
- **AND** MUST NOT 为保持两份正文相同而复制任务说明，也不得以任务说明单独改变 specs

### Requirement: Brief 必须随 Change 生命周期保持稳定可读
Buildr MUST 将 `brief.md` 保存在 Change root 内并随 active Change 原子归档；文件名与既有读取入口 MUST 保持不变。旧 Change Brief 和归档 MUST 保留其历史正文及来源，旧 Change 缺少 Brief 时 MUST 保持可读兼容，且 MUST NOT 在只读索引或页面访问期间自动生成、迁移或回写。独立任务说明（Task Brief）MUST 不随 Change 归档移动或删除；新说明引用不可读时 MUST 明确报告局部缺口，不复制旧 brief 或聊天补造正文。

#### Scenario: 归档包含 Brief 的 Change
- **WHEN** OpenSpec archive 将 active Change 移入 archive
- **THEN** `brief.md` MUST 随同 proposal、design、specs 和 tasks 一起移动
- **AND** archived Brief MUST 保持为该历史 Change 的稳定人类阅读入口

#### Scenario: 查看没有 Brief 的历史 Change
- **WHEN** active 或 archived Change 不包含 `brief.md`
- **THEN** Buildr MUST 明确报告 Brief unavailable 并继续提供现有标准 artifacts
- **AND** 读取流程 MUST NOT 创建文件或推断一份虚构 Brief

#### Scenario: 旧说明作为兼容阅读入口
- **WHEN** 旧任务没有独立 Task Brief 关联，但关联 Change 提供旧 Brief
- **THEN** 页面 MUST 保留只读来源并明确标记为历史变更说明，不宣称它已经是独立任务说明
- **AND** 显式任务说明关联建立后 MUST 优先使用该引用，不改写旧 Brief 或归档

#### Scenario: 归档后继续读取独立任务说明
- **WHEN** 某个 Change 已归档，而 Task Brief 位于真实项目或任务本机材料目录
- **THEN** 任务说明 MUST 保持原位置及引用语义，读取其当前正文或明确不可用诊断
- **AND** 项目根逻辑 Markdown 引用 MUST 在归档前后打开同一任务说明，不因 archive 增加目录层级而失效；普通相对引用 MUST 保持原语义
- **AND** MUST NOT 因归档删除、移动或批量补写任务材料
