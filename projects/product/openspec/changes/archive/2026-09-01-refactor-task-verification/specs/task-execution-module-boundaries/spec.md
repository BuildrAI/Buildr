## MODIFIED Requirements

### Requirement: Task Execution 与 Verification 必须有清晰的静态 owner
Buildr SHALL将Task lifecycle、Task Environment和Task Verification的Application/Domain/Persistence实现归入`src/task/`，将Project测试地图parser、validator与Application归入Project Verification owner。产品MUST不保留Task Execution Record模块、runtime port或跨模块依赖；System Doctor MUST只消费Project Verification的窄声明诊断能力。

#### Scenario: Task Verification读取测试地图
- **WHEN** Task Verification保存或inspect报告需要观察相关Project地图identity
- **THEN** 它MUST依赖Project Verification-owned parser/validator
- **AND** MUST NOT取得测试执行、Execution Record或资源协调能力

#### Scenario: Verification 解析 declaration
- **WHEN**Project Verification或Task Verification需要读取`verification.yml`
- **THEN**它们MUST复用Project Verification-owned parser/validator
- **AND**MUST NOT从System Doctor复制解析语义

#### Scenario: Doctor 生成 diagnostics
- **WHEN**System Doctor检查Project测试地图
- **THEN**Doctor MUST通过Project Verification窄诊断能力生成findings
- **AND**MUST NOT成为测试地图writer或Task Verification consumer

#### Scenario: Bootstrap组装Task模块
- **WHEN** Bootstrap组装Task相关模块
- **THEN** MUST不登记Task Execution Record descriptor、capability或runtime port
- **AND** 其他Task能力MUST不依赖已退役模块
