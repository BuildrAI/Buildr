## MODIFIED Requirements

### Requirement: 旧父子协调写入口必须退役并保全历史
旧父计划写入口、贡献绑定、审查采用、贡献登记和专用验收写入口 MUST退役。`legacy_parent_plan_json` MAY仅作为明确标注的历史展示保留，但 MUST不决定当前父身份、完成授权、snapshot或Task状态。没有受支持读取者的旧贡献协调表和解析代码 MUST直接删除。

#### Scenario: 查看旧 Parent Plan
- **WHEN** Parent inspect读取存在的`legacy_parent_plan_json`
- **THEN** MUST将其标注为历史内容
- **AND** 当前`isParent`与completion snapshot MUST只使用当前Task Record及直接Child事实

#### Scenario: 旧贡献协调数据没有消费者
- **WHEN** migration升级包含`terminal_contribution_reconciliations`的Workspace
- **THEN** MUST删除该表与rows且不建立backup、history或replacement
- **AND** 当前Task关系和结果 MUST保持不变

#### Scenario: 旧命令调用
- **WHEN** 调用旧`task parent record`或其他退役写动作
- **THEN** MUST按不存在的接口处理且零写入
- **AND** MUST不提供兼容转发

#### Scenario: 查看历史
- **WHEN** Parent inspect读取保留的旧Parent Plan
- **THEN** MUST只返回明确历史展示
- **AND** MUST不要求补证据或重新执行研发

## RENAMED Requirements

- FROM: `父子协调必须围绕目标与真实任务成果`
- TO: `父任务协调必须围绕目标与真实任务成果`
- FROM: `父子摘要必须读取真实结果并隔离历史错误`
- TO: `父任务协调查询必须读取真实结果并隔离历史错误`
- FROM: `旧父子协调写入口必须退役并保全历史`
- TO: `旧父任务协调写入口必须退役并保全历史`
