## MODIFIED Requirements

### Requirement: 模块 Interface 必须由所属模块贡献
模块特有 CLI参数、DTO、输出、错误映射与HTTP Controller MUST 由所属模块 Interface持有并通过模块公开入口贡献；公共Host只合并、校验和分发 contributions，MUST NOT复制业务 Adapter或建立第二份命令/路由目录。

#### Scenario: 注册 Task Record CLI命令
- **WHEN** Bootstrap构建统一 `COMMAND_CATALOG`
- **THEN** `task create|inspect|list|update|activate|complete|abandon` descriptors MUST来自Task模块公开入口
- **AND** Help、unknown-command candidates与Dispatch MUST继续消费同一合并目录
- **AND** Task Record CLI Adapter MUST调用同一Task Record Application API

#### Scenario: 分发 Task Record HTTP请求
- **WHEN** Buildr Web HTTP Host收到Task列表、详情、更新、完成或放弃请求
- **THEN** Host MUST通过已注册Task HTTP contribution分发请求
- **AND** Task HTTP Adapter MUST调用同一Task Record Application API
- **AND**公开HTTP path、method、DTO、授权、响应与错误映射 MUST保持等价
