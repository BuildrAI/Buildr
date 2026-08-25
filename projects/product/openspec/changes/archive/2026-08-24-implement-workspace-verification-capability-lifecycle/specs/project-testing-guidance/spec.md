## ADDED Requirements

### Requirement: Project Testing 必须建立可发现的稳定测试能力
Agent建设或调整测试时 MUST同时核对事实owner、Static/Unit/Component/Integration/System边界、稳定构建入口以及可供声明发现的module、source、Tag或Suite authority。Project Testing MUST NOT直接写Verification Result或把每个测试复制进`verification.yml`。

#### Scenario: 新增 Service 单元测试
- **WHEN** Agent为Service公共逻辑建立Unit证据
- **THEN** MUST把测试接入该Service真实构建入口并保持可由module/source/Tag或Suite发现
- **AND** declaration owner只需声明稳定能力族与发现来源，不得索引每个测试文件

### Requirement: Project Testing 必须区分验证目标、选择范围和证据边界
Project Testing MUST把Task Delivery、Product Artifact Candidate、Published Release与affected/full、Static/Unit/Component/Integration/System作为三个正交问题；Quick/focus MUST只作为开发反馈或诊断范围。新增或修改测试入口 MUST说明可支持的验证目标及affected/full安全边界。

#### Scenario: 只有模块级完整入口
- **WHEN** Project测试入口不能可信选择单个受影响测试但能完整运行module
- **THEN** Project Testing MUST将该入口定义为full或module-full证据
- **AND** MUST NOT因命令耗时较低就声称它是可信affected

### Requirement: 缺失测试能力必须交回建设与声明流程
当Task Verification报告coverage gap或unknown owner时，Project Testing MUST只在用户授权的实现范围内建设最低充分测试，并把稳定入口交给Declaration Intake；它 MUST NOT在Formal Verification执行中临时生成测试或自动扩大长期声明。

#### Scenario: Pig前端只有lint和build
- **WHEN** 只读发现存在lint/build scripts但没有能证明目标行为的测试
- **THEN** MUST保持coverage gap并说明可建设的最低充分测试边界
- **AND** MUST NOT把script名称直接提升为已通过测试能力
