## ADDED Requirements

### Requirement: Agent必须按标准Parent启动流程推进到Child之前
Buildr内置Task workflow Skills MUST将新Parent从Git基线推进到Child前的顺序固定为：激活前Git门禁、Parent activate、matching Environment、Development begin、Parent Plan record、Planning Review、Parent planning refresh与启动就绪回读；MUST在启动就绪后停止Parent普通实现推进，等待用户选择eligible Contribution。

#### Scenario: coordination-only Parent启动
- **WHEN** Parent只承担协调且当前不修改、构建或测试交付内容
- **THEN** Agent MUST仍准备matching shared Environment，并可对完整Project/Service scope提交有理由的Preparation `not-applicable`
- **AND** MUST不因此创建独立worktree、执行不需要的依赖安装或跳过Environment authority

#### Scenario: Parent到达Child前停止点
- **WHEN** Parent Plan、Planning Review和Development planning gate current且启动投影返回eligible Contribution
- **THEN** Agent MUST报告Parent已可启动Child并停止`observe`、Verification、Candidate和Finish
- **AND** 后续Child必须由用户选择Contribution后按独立Task流程启动

### Requirement: Agent必须在一对多Child拆分前reconcile Contribution
一个current Contribution MUST最多绑定一个Child；当真实能力范围需要多个Child独立交付时，Agent MUST先以current Parent Plan identity显式reconcile为多个窄Contribution，再分别创建和绑定Child。

#### Scenario: 宽Contribution需要多个Child
- **WHEN** 能力盘点证明一个未分配Contribution需要两个或以上独立Environment、Change或Finish handoff
- **THEN** Agent MUST在创建第二个Child前reconcile Parent Plan并重新完成Planning Review与refresh
- **AND** MUST不把同一Contribution同时绑定多个Child或只记录非阻塞聊天约束
