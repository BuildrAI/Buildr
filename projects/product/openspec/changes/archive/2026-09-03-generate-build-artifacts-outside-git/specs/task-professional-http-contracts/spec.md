## MODIFIED Requirements

### Requirement: 生成 DTO 与 typed Client 必须由同一 Schema 投影
Buildr MUST从当前Task professional Schema确定性生成后端与Buildr Web DTO及typed client类型，输出到各自精确ignored generated目录并绑定同一生成批次。生成结果 MUST只包含Review、Verification、Parent Coordination和error family，MUST不进入Git tracked tree。

#### Scenario: Buildr Web读取专业结果
- **WHEN** Task Detail加载Review、Verification或Parent Coordination
- **THEN** 页面 MUST通过typed professional client读取本次Schema生成的类型
- **AND** MUST不手写第二套响应类型或Overview client

#### Scenario: generated DTO 漂移阻断受影响构建
- **WHEN** typecheck、contract check或正式Web build从不含专业DTO的干净checkout开始
- **THEN** 构建入口 MUST先向两端ignored目标生成matching DTO再检查消费者
- **AND** Schema family、输出闭包、重复生成或consumer compile任一失败 MUST返回非零

#### Scenario: Task Detail 使用 typed professional client
- **WHEN** 正式Candidate检查Application Payload与npm inventory
- **THEN** runtime bundle MUST吸收所需类型擦除后的实现且不携带后端或前端generated`.ts`
- **AND** npm package MUST不依赖generator或development checkout补齐类型
