## MODIFIED Requirements

### Requirement: Project v3 必须声明稳定 Test Capability Families

已登记 Project SHOULD在根目录提供 closed `buildr.project-verification/v3` `verification.yml`。每项 v3 capability MUST具有唯一 id、Project/Service scope、非空 proves、非空 evidence、非空 usable targets、可信 discovery sources、full invocation 与可选 affected invocation。新声明、Skills、templates、references和示例 MUST只使用v3；runtime MUST长期只读接受closed v2 declaration作为legacy compatibility输入，但 MUST将其规范化到统一内部模型并标记为能力受限，不得把v2作为新声明作者模型或继续扩展其schema。

#### Scenario: v2 声明进入 v3-only runtime

- **WHEN** runtime读取合法 `buildr.project-verification/v2`
- **THEN** MUST严格校验旧closed shape并规范化为Plan输入
- **AND** MUST只把`requiredForDelivery: true`映射为`task-delivery`
- **AND** MUST把单一invocation作为full入口，不得虚构affected或provider入口
- **AND** MUST以`legacy-declared`保留未知evidence边界并给出非阻塞迁移notice

#### Scenario: 声明普通能力族

- **WHEN** Project 声明一个覆盖 Service unit 与 component evidence 的v3能力族
- **THEN** schema MUST校验scope、proves、evidence、usableFor、discovery与invocation
- **AND** 具体测试类、Tag和suite membership MUST继续由测试源码或构建配置持有

#### Scenario: v2 尝试获得新目标语义

- **WHEN** v2 capability请求`product-candidate`或`published-release`
- **THEN** MUST不自动选择该capability并形成明确coverage gap
- **AND** runtime MUST不以长期兼容为理由向v2回填v3-only语义

#### Scenario: 新声明请求使用v2

- **WHEN** Agent创建、刷新或示例化Project verification declaration
- **THEN** Skill、template与reference MUST只生成或指导closed v3
- **AND** MUST不提供v2 writer、v2 template或新增v2 capability的迁移反向入口

### Requirement: Doctor 必须只读校验 v3 declaration

Project没有`verification.yml`时Doctor MUST零finding；文件存在时 MUST只读校验closed v3 schema，或严格校验closed v2 schema并返回非阻塞legacy migration notice。无效声明 MUST在执行前阻塞，Doctor不得运行测试或改写声明。合法v2 notice MUST说明声明仍可使用但缺少v3 affected、evidence target和provider等能力，不得声称v2 reader将在某次Contribution后删除。

#### Scenario: 合法过渡 v2 declaration

- **WHEN** v2 declaration满足旧closed schema
- **THEN** Doctor MUST报告declaration有效
- **AND** MUST返回指向v3迁移的非阻塞notice，说明v2可继续使用但能力受限
- **AND** notice MUST不依赖删除日期、删除Contribution或人工记忆

#### Scenario: 非法 v2 declaration

- **WHEN** v2 declaration字段、scope、invocation、resource或preparation引用非法
- **THEN** Doctor MUST返回blocking closed-schema finding

#### Scenario: v3 declaration 有效

- **WHEN** 已登记Project提供有效v3 declaration
- **THEN** Doctor MUST报告valid、path与实际capabilityCount
- **AND** declaration bytes MUST保持不变

#### Scenario: 声明含未知或v2字段

- **WHEN** v3 declaration包含`applicability`、`requiredForDelivery`或其他不属于v3的字段
- **THEN** Doctor MUST返回精确closed-schema finding与迁移指引
- **AND** MUST NOT忽略字段后继续执行
