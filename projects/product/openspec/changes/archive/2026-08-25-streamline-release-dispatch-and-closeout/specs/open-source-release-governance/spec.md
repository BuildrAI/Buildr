## ADDED Requirements

### Requirement: 发布编排必须保留独立owner与授权边界
Buildr MUST提供`prepare-dispatch`、`dispatch`与`closeout`三个可恢复release orchestration动作。编排器 MUST只消费既有owner Result并按稳定顺序调用其公开入口，不得建立第二持久化状态权威、接受caller成功布尔值、自动取得publication或cleanup授权，或把跨owner调用宣称为原子事务。

#### Scenario: 无副作用准备dispatch
- **WHEN** 调用方执行`prepare-dispatch`
- **THEN** 编排器 MUST重新读取merge后current owner facts并返回frozen context digest、approval request与`effects: []`
- **AND** MUST NOT dispatch workflow、请求Environment approval、创建tag或执行任何closeout mutation

#### Scenario: 显式授权dispatch
- **WHEN** 调用方对expected current context明确授权publication并执行`dispatch`
- **THEN** 编排器 MUST重验相同context digest后只调用一次既有protected transaction owner
- **AND** context漂移或授权缺失 MUST在workflow dispatch前零远端写入失败

#### Scenario: closeout部分失败后恢复
- **WHEN** hosted evidence、reconciliation、Git closeout、Task completion、Environment cleanup或Doctor中的某一步blocked
- **THEN** 编排器 MUST停止后续未安全步骤并返回全部已成立effects、blocked owner与唯一resume action
- **AND** 重试 MUST复用identity一致的已通过步骤，不得回滚或重放Publication与其他已完成mutation

### Requirement: Release Phase Timeline必须可移植且可验证
Buildr MUST从Task、Git/PR、GitHub run/attempt、release owner Result、Environment与Doctor的current facts生成closed `buildr.release-phase-timeline/v1`。Timeline MUST按稳定顺序表达selection/freeze、Candidate attempts、PR merge、readiness、等待授权、dispatch/approval、Publication、reconciliation与closeout，并为每项保留owner identity、可证明时间边界、status、run/attempt和等待类型；不得保存本机路径、凭证、stdout或估算缺失时间。

#### Scenario: 多次Candidate attempt与成功evidence复用
- **WHEN** 同一release source通过failed-shard retry形成多个run attempt并复用先前成功shard evidence
- **THEN** Timeline MUST按`runId + runAttempt`区分attempt，引用每个成功evidence的原attempt、实际rerun scope与最终aggregate identity
- **AND** MUST NOT把复用evidence记为新执行、把旧generation evidence并入current timeline或只记录最终green run

#### Scenario: 区分执行与等待
- **WHEN** release经历runner执行、GitHub排队、Environment approval与维护者决定
- **THEN** Timeline MUST分别使用`machine-execution`、`platform-queue`、`environment-approval`与`human-decision`分类
- **AND** 缺失开始或结束边界时 MUST记录unknown并省略duration，不得用Task总耗时或Agent估算补齐

#### Scenario: closeout完成
- **WHEN** Publication、reconciliation、Git closeout、Task no-change completion、Environment cleanup与最终Doctor均成立
- **THEN** Timeline MUST返回terminal closed、各owner identity与稳定timeline identity
- **AND** compact output MUST只返回关键阶段、timeline identity与inspect pointer，完整timeline只在显式full中展开
