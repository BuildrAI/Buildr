## MODIFIED Requirements

### Requirement: 共享服务通过 Project 表达
Buildr MUST 允许服务独立存在并由多个项目引用，不再要求为共享服务创建占位项目，也不为服务登记物化独立的默认目录。

#### Scenario: 用户未说明 service 归属
- **WHEN** 用户登记服务而未指定项目
- **THEN** 系统 MUST 允许有效全局登记，且可稍后建立项目引用

#### Scenario: 共享服务 metadata
- **WHEN** 多个项目使用同一服务
- **THEN** 服务 MUST 在全局清单登记一次，项目仅保存稳定引用

#### Scenario: 共享服务默认目录
- **WHEN** 创建服务且未显式选择已有或新建代码目录
- **THEN** 系统 MUST NOT 物化 `services/<code>` 默认目录或模板 `AGENTS.md`；服务代码由被引用代码库实例定位

#### Scenario: 服务文档与规则入口保持目录约定
- **WHEN** `services/<code>/AGENTS.md` 或服务代码目录中的规则文件实际存在
- **THEN** 系统 MUST 继续按既有目录约定发现服务级规则与服务文档
- **AND** 不存在的目录 MUST NOT 被当作缺失或损坏状态
