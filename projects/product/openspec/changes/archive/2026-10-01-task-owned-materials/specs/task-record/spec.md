## ADDED Requirements

### Requirement: Task Record 必须与独立任务材料保持边界
任务记录（Task Record）MUST 继续遵守 closed `buildr.task-record/v3`，只维护已有顶层事实、关系、状态、结果与历史；`intent` MUST 仅表达一句话级短目标与入口定位。独立任务说明（Task Brief）的正文及材料引用 MUST 分别由真实文件和独立任务材料应用（Task Materials Application）维护，MUST NOT 新增到 Task Record 字段、数据库列、记录摘要（recordDigest）或结果历史中。任务材料与专业审查、验证 MUST 不改变合法记录动作的既有前置条件、授权、副作用或完成语义，也不得变成统一就绪门禁。

#### Scenario: 无 Change 的正式任务
- **WHEN** 正式任务的 `changes` 为空而具有独立任务说明或其他材料
- **THEN** Task Record MUST 保持原有空引用集合与合法记录语义，材料 MUST 可通过独立入口读取
- **AND** MUST NOT 因需要说明而创建虚假 Change、新增 record 字段或数据库迁移

#### Scenario: 多变更及共享引用
- **WHEN** 一个 Task 关联多个真实 `project/change`，或多个 Task 引用同一 Change 或文档
- **THEN** Task Record MUST 保留现有 `0..N`、记录内去重与跨 Task 非排他引用语义
- **AND** MUST NOT 因 Task Brief 唯一引用而强制 Task 与 Change 一对一

#### Scenario: 正文或材料关联更新
- **WHEN** Task Brief 正文或独立材料清单改变，而 Task 业务事实未变
- **THEN** Task Record、recordDigest、状态、结果和历史 MUST 保持不变
- **AND** 文件正文及材料清单 MUST 各自使用独立的已观察版本保护，不通过更新 Task Record 保存材料版本

#### Scenario: 材料读取异常
- **WHEN** 任务材料缺失、失效、版本冲突或读取失败，但 Task Record 自身结构有效
- **THEN** Task Record MUST 继续完整可读，异常 MUST 只由材料入口报告局部诊断
- **AND** MUST NOT 自动修改任务状态、删除引用、否定已成立结果或阻塞无关合法记录动作

#### Scenario: 旧记录与专业历史
- **WHEN** 新材料能力开始服务已有任务
- **THEN** 原 Task identity、系统时间、结果历史、Change 引用与专业历史 MUST 原样保留
- **AND** MUST NOT 在读取中迁移、批量生成占位说明或把本次关联伪装成历史已有事实
