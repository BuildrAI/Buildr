## ADDED Requirements

### Requirement: 发布演练与最终候选版必须共享同一执行拓扑
Buildr Product MUST让Release Rehearsal与正式Product Artifact Candidate调用同一Candidate CI入口、registry、shard matrix、artifact topology、execution profiles、checkpoint与aggregate实现。用途差异 MUST只通过closed purpose/source identities表达，不得复制或删减测试集合。

#### Scenario: 比较演练与最终候选版覆盖
- **WHEN** contract verifier检查Release Rehearsal与Candidate workflow
- **THEN** 两种用途 MUST展开完全相同的required evidence IDs、runner平台、Host Node tuples与唯一artifact producer
- **AND** 任一用途新增、删除或改派primary owner MUST同时影响另一用途并由coverage contract检测

#### Scenario: 最终候选版确认演练后发布树
- **WHEN** matching rehearsal已提升为正式frozen generation并运行最终Candidate
- **THEN** Candidate MUST重新执行同一完整图并绑定正式release source
- **AND** rehearsal success MUST不替代final aggregate、main coverage或publication readiness

### Requirement: 发布演练必须复用完整候选版验证图
发布演练 MUST与最终候选版使用同一workflow、verification registry、唯一tarball producer、macOS/Windows/Host Node分片、`fail-fast: false`策略与closed aggregate。Result MUST绑定purpose、prospective commit/tree、rehearsal identity、run/attempt、全部required evidence与唯一artifact identity。

#### Scenario: 完整演练全绿
- **WHEN** GitHub workflow针对matching rehearsal carrier完成全部required jobs
- **THEN** aggregate MUST证明唯一artifact以及所有macOS、Windows与Host Node evidence均为passed
- **AND** rehearsal inspect MUST返回可供selection promotion消费的current passed evidence

#### Scenario: 演练一次收集多个失败
- **WHEN** 唯一artifact已经生成且多个并列候选分片失败
- **THEN** matrix MUST继续执行其他不依赖失败分片的作业并由aggregate列出全部失败evidence
- **AND** 失败 MUST只使本次演练不可提升，不得改变正式release selection或触发publication

### Requirement: 候选环境准备必须由唯一入口按档位提供
Buildr MUST提供统一候选环境准备（Candidate Environment Preparation）入口，集中拥有Buildr/Buildr Web锁定依赖安装、DTO生成、Test Context生成与源码`web-dist`物化。Candidate与Release Rehearsal jobs MUST只选择`base|artifact|source-runtime|host`闭合档位，不得自行拼装这些准备步骤。

#### Scenario: 源码运行分片准备环境
- **WHEN** 候选作业选择`source-runtime`档位
- **THEN** 统一入口 MUST安装两个Service的锁定依赖、生成DTO与Test Context并物化matching源码`web-dist`
- **AND** 作业 MUST在准备Result passed后才启动其verification shard

#### Scenario: 不需要前端源码的作业
- **WHEN** Host Node consumer或其他作业不需要Buildr Web源码工具链
- **THEN** 作业 MUST选择最低充分档位并不得安装或构建无关前端材料
