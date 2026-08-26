## ADDED Requirements

### Requirement: Product 重型验证必须声明真实资源与 readiness 边界
Buildr Product verification owner MUST按真实启动的Task lifecycle、Workspace pressure与App runtime声明资源，并 MUST为进程型step记录有界phase、readiness与cleanup诊断。资源声明 MUST只用于压力节流，不得改变required coverage、Full全局capacity或建立共享状态锁。

#### Scenario: concurrent task acceptance参与Candidate调度
- **WHEN** `concurrent-task-acceptance`创建Task Environment、运行Verification并启动Preview
- **THEN** registry MUST声明`workspace-saturating`、`task-lifecycle-heavy`与`app-runtime`
- **AND**scheduler MUST在capacity不足时排队该step而不是与冲突owner同时扩张

#### Scenario: Preview在正常负载下就绪
- **WHEN** Preview child存活且instance、health与Environment resource在deadline内current
- **THEN** acceptance runner MUST在readiness成立后立即继续
- **AND** MUST不等待完整timeout或仅以固定sleep判断成功

#### Scenario: Preview未在deadline内就绪
- **WHEN** Preview启动达到bounded readiness deadline
- **THEN** runner MUST保存phase、child exit、health、resource registration与有界stdout/stderr诊断后回收owned process
- **AND** MUST不以简单放大固定timeout、静默retry或删除其他Preview掩盖失败

#### Scenario: Full调度策略保持不变
- **WHEN** 资源声明和readiness逻辑更新
- **THEN** Full全局`product-full-execution` capacity MUST继续为1且Candidate required steps不减少
- **AND**主机CPU、内存或I/O观察 MUST不成为新的pass/fail门禁
