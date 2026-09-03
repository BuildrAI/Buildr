## MODIFIED Requirements

### Requirement: 生成 DTO 与发布形态必须保持一致
Buildr MUST从同一Runtime/System Schema在构建前确定性生成后端与Buildr Web DTO，输出到精确ignored目录并绑定同一生成批次；并 MUST通过重复生成检查、Buildr Service typecheck/Contract/System tests、Buildr Web typecheck/正式build、隔离`web-dist`、Application Payload、npm tarball parity与Browser Smoke验证一致性。Buildr Web MUST NOT引入Ajv runtime，非Web CLI冷启动 MUST NOT依赖DTO generator。

#### Scenario: Schema 与生成物发生漂移
- **WHEN** Runtime/System Schema改变，或者两端DTO、Web dist或manifest不属于同一当前生成批次
- **THEN** 对应generation/build check MUST非零失败并报告source`$id`、输入identity与漂移目标
- **AND** MUST NOT从tracked generated文件或其他checkout补齐

#### Scenario: 正式发布入口验收
- **WHEN** 当前source形成稳定Product Candidate并执行正式Candidate验证
- **THEN** development checkout、Application Payload、npm tarball与本次隔离构建的Buildr Web MUST对相同Runtime/System HTTP contract表现一致
- **AND** Browser Smoke MUST覆盖release-awareness、Publication与安全退出的代表性用户链路
