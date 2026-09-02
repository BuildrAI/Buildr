## MODIFIED Requirements

### Requirement: Task Review 模块端口必须保持 writer authority 与兼容边界
Task Review module MUST公开v2 inspect/record Application、只读Persistence与runtime port；MUST NOT公开prompt生成、target applicability或Development gate适配方法。保留和修改的Review人工源码 MUST以TypeScript为唯一实现。

#### Scenario: Bootstrap组装Review模块
- **WHEN** Bootstrap创建完整runtime
- **THEN** Review module MUST只requires Task Record persistence和Workspace structured store机制
- **AND** Task Development module MUST不requires Review Application

#### Scenario: consumer 读取或记录 Review Result
- **WHEN** CLI、HTTP或Web需要Review事实
- **THEN** MUST只通过Task Review Application和公开module port调用inspect/record

#### Scenario: 未迁移 consumer 使用兼容方法
- **WHEN** 旧consumer请求prompt、target applicability或Review gate adapter
- **THEN** module MUST不提供兼容方法并由调用面原子迁移

### Requirement: 迁移必须保持 Task Review 外部与持久化行为等价
迁移 MUST保留两个可选slot、原子current替换、可移植证据与Task identity，同时按v2明确改变subject、outcome和CAS契约；MUST NOT保留v1双读或prompt stub。

#### Scenario: 旧current row升级
- **WHEN** v1数据库首次由集成后的retained runtime执行合法writer
- **THEN** migration MUST把全部合法v1 rows转换为v2并保持slot数量与语义
- **AND** 非法row MUST使整次migration回滚

#### Scenario: 迁移前后执行 Task Review journeys
- **WHEN** 同一组inspect、record、slot隔离、写失败和并发场景分别在fresh v2与v1升级数据库运行
- **THEN** MUST得到相同v2外部结果与原子安全边界
