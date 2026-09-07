## MODIFIED Requirements

### Requirement: 发布演练与最终候选版必须共享同一执行拓扑
Buildr Product MUST让Release Rehearsal与正式Product Artifact Candidate调用同一Candidate CI入口、registry、shard matrix、artifact topology、execution profiles、checkpoint与aggregate实现。用途只作为诊断信息，验证身份 MUST绑定精确source、artifact和相关执行输入，不得复制或删减测试集合。

#### Scenario: 比较演练与最终候选版覆盖
- **WHEN** contract verifier检查Release Rehearsal与Candidate workflow
- **THEN** 两种用途 MUST展开完全相同的required evidence IDs、runner平台、Host Node tuples与唯一artifact producer
- **AND** 任一用途新增、删除或改派primary owner MUST同时影响另一用途并由coverage contract检测

#### Scenario: 最终候选版确认演练后发布树
- **WHEN** matching rehearsal已提升为正式frozen generation且精确source、artifact和相关输入未改变
- **THEN** Candidate MUST复用同一完整图的原执行与唯一产物并绑定正式release source
- **AND** 原aggregate MUST仍通过当前覆盖校验，main coverage与publication readiness MUST按当前事实重新核验

### Requirement: 候选环境准备必须由唯一入口按档位提供
Buildr MUST提供统一候选环境准备（Candidate Environment Preparation）入口，集中拥有Buildr/Buildr Web锁定依赖安装、DTO生成、Test Context生成、源码`web-dist`物化和产物消费者的必要依赖。Candidate与Release Rehearsal jobs MUST只选择统一入口公布的最低充分档位，不得自行拼装这些准备步骤。

#### Scenario: 源码运行分片准备环境
- **WHEN** 候选作业选择`source-runtime`档位
- **THEN** 统一入口 MUST安装两个Service的锁定依赖、生成DTO与Test Context并物化matching源码`web-dist`
- **AND** 作业 MUST在准备Result passed后才启动其verification shard

#### Scenario: 不需要前端源码的作业
- **WHEN** Host Node consumer或其他作业不需要Buildr Web源码工具链
- **THEN** 作业 MUST选择最低充分档位并不得安装或构建无关前端材料

## REMOVED Requirements

### Requirement: 发布演练必须复用完整候选版验证图
**Reason**: 与同一执行拓扑要求重复，演练专用身份不应阻止复用。
**Migration**: 完整候选与可选演练使用共享覆盖和分片入口；保留每次真实执行证据。

## ADDED Requirements

### Requirement: 候选独立分片必须尽可能收集全部失败
源码分片 MUST只依赖实际必需的准备或产物，不得因无关产物构建失败全部跳过。聚合 MUST区分准备失败、测试失败和依赖缺失未运行，并保留已成功分片证据。

#### Scenario: 产物构建失败而源码测试可运行
- **WHEN** 唯一tarball未能生成但独立源码准备可完成
- **THEN** 无tarball依赖的分片 MUST继续运行
- **AND** 产物消费者 MUST记录依赖缺失未运行，聚合不得误报全部测试失败

### Requirement: 发布工具生命周期必须使用真实判断和故障注入验证
发布基础设施 MUST使用真实临时Git、可控本地服务和传输故障验证正常准备、纳入、消费、发布恢复与清理。模拟 MUST限制于外部系统边界，MUST不把被测核心公开状态、幂等或冲突判断直接替换为成功。

#### Scenario: 部分成功和中断矩阵
- **WHEN** 本地/远端写入、回读、npm或GitHub步骤发生拒绝、响应丢失或中断
- **THEN** 测试 MUST观察真实保存事实和下一次操作，证明匹配复用、未知不写、冲突停止及清理隔离

#### Scenario: 无公开副作用完整验收
- **WHEN** 发布基础设施修改完成
- **THEN** 验收 MUST从干净检出执行完整候选及同一产物消费链并说明实际/复用/未验证范围
- **AND** MUST不模拟生产凭证或发布无意义版本
