## ADDED Requirements

### Requirement: 资产应用必须显式注入职责依赖
Agent Assets MUST逐应用声明实际依赖并显式装配，MUST NOT向应用传入聚合全部内部方法的可变共享对象。资源清单读取 MUST只有一个可达解析实现；项目/服务登记修复 MUST由 Workspace 所属应用维护，资产模块只编排资源与模板维护。

#### Scenario: 装配并同步资产
- **WHEN** 执行本场景
- **THEN** 应用 MUST只访问声明的依赖，登记修复 MUST保持原事务范围、迁移、幂等及数据结果，未消费的内部辅助方法 MUST不进入模块公开端口。
