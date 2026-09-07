## MODIFIED Requirements

### Requirement: Task 交付终态不得被后续维护 attention 撤销
Task Record的`completed` MUST只表达已确认的任务结果摘要，不表达机器交付证明。Git、部署、发布、Worktree、Preview或其他资源owner的pending/attention MUST保持独立，且 MUST不把已完成Task自动退回active、blocked或未交付。

#### Scenario: completed Task仍有cleanup attention
- **WHEN** Task结果已完成而Worktree或Preview尚未安全清理
- **THEN** Task Record MUST保持completed，具体资源owner MUST返回自己的cleanup attention
- **AND** Agent MUST能继续处理清理且用户可以查看Task结果和按需复盘

### Requirement: 完成记录必须与机器交付证明分离
任务应用（Application）MUST只保存已完成目标的真实摘要和适用的父任务完成依据，并保护对象身份与版本冲突。`completed` MUST不被解释为自动验证Git、部署、发布或外部系统交付；缺少Review、Verification或任何旧收尾历史 MUST不降低Task结果。

#### Scenario: 直接完成的任务
- **WHEN** 任务通过complete动作结束且没有Review、Verification或机器交付记录
- **THEN** Task Record MUST正常返回`completed`与结果摘要
- **AND** MUST不生成`delivered=false`、历史缺失或补造关联提示

#### Scenario: 已有历史证明
- **WHEN** 历史文档或归档Change包含旧交付证据
- **THEN** 它 MAY继续作为历史证据保留
- **AND** 当前Task查询 MUST不读取、迁移或投影为运行状态

#### Scenario: 内部读取失败
- **WHEN** Review、Verification、Git或资源owner读取失败
- **THEN** 失败 MUST只影响依赖该读取的动作或区域
- **AND** Task Record中已经成立的结果 MUST保持不变
