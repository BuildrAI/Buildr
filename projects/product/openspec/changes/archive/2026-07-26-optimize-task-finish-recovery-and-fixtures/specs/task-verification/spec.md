## ADDED Requirements

### Requirement: OpenSpec contract fixtures必须复用identity-bound preparation
Task verification provider MUST把OpenSpec contract fixtures拆分为稳定preparation与隔离assertion execution，并为单次verification run生成内容寻址的prepared artifact。Cache identity MUST绑定verifier source、OpenSpec executable/version、fixture seed、Node major、platform与candidate relevant inputs；写入型scenario MUST使用task-owned隔离副本，不能共享可变工作目录。

#### Scenario: 多个scenario使用相同基础Project
- **WHEN**同一verification run内多个contract assertions需要相同Workspace/Product/OpenSpec基础事实
- **THEN**provider MUST只执行一次identity匹配的preparation
- **AND**每个写入型assertion MUST从prepared artifact取得独立副本

#### Scenario: Fixture identity变化
- **WHEN**verifier source、OpenSpec版本、fixture seed或相关candidate input变化
- **THEN**provider MUST拒绝旧prepared artifact并重新准备
- **AND**MUST NOT从路径存在或命令名称推断cache可复用

#### Scenario: Assertion失败保留现场
- **WHEN**某个isolated contract assertion失败
- **THEN**provider MUST保留该assertion的diagnostic与fixture reference
- **AND**其他scenario的共享prepared artifact和结果MUST不被失败写入污染

### Requirement: Fixture preparation与assertion timing必须独立可审计
Verification evidence MUST分别记录OpenSpec fixture preparation、assertions、queue、cleanup、cache hit/reuse与wall-clock，不得把并行duration相加冒充总耗时。Registry MUST为该family声明20秒目标预算；超预算MUST产生结构化performance warning，但 MUST NOT隐藏或改变验证pass/fail语义。

#### Scenario: Preparation被多个assertions复用
- **WHEN**prepared artifact在同一run内被两个以上assertions消费
- **THEN**timing evidence MUST记录一次prepare与每个assertion的独立duration
- **AND**MUST报告cache identity、consumer count和reuse status

#### Scenario: Contract fixtures超过预算
- **WHEN**该family wall-clock超过20秒
- **THEN**provider MUST返回实际slowest preparation/assertion与source identity
- **AND**verification gate MUST继续按真实assertion结果判定而不是因预算单独失败或通过

### Requirement: Scheduler必须显式组合run-local prepared artifact
Verification scheduler MUST通过登记的producer/consumer artifact dependency协调fixture preparation，并保证同一identity的producer在一个run内最多成功执行一次。Scheduler MUST NOT根据命令文本、cwd相似或先前run路径猜测复用，也 MUST NOT把producer通过当作consumer assertions通过。

#### Scenario: 两个ready consumer等待同一producer
- **WHEN**两个contract assertion均声明消费同一prepared artifact identity
- **THEN**scheduler MUST先完成唯一producer再按资源限制启动consumers
- **AND**结果顺序、queue timing与每个consumer outcome MUST保持可审计
