## ADDED Requirements

### Requirement: Project Testing 必须建立最小测试质量闭环
Agent 在设计或开发测试时 MUST 将每项关键待证明事实映射为公共可观察结果，并按变更风险选择能够区分正确与错误实现的正常、失败、边界和必要状态转换案例；随后 MUST 选择能够证明这些结果的最低充分执行边界。Agent MUST 说明关键遗漏或不适用情况，不得用目录、测试名称、单一成功案例或覆盖率数字代替行为证据。

#### Scenario: 纯逻辑包含失败与边界行为
- **WHEN** 一项纯逻辑变更同时定义正常结果、非法输入和边界值行为
- **THEN** Agent MUST 在 Unit 边界覆盖能够区分这些行为的最小关键案例
- **AND** MUST NOT 只保留一个正常输入案例并声称目标事实已充分证明

#### Scenario: 验收标准映射为可观察结果
- **WHEN** proposal、需求或 design 给出明确验收标准
- **THEN** Agent MUST 将适用标准映射为可观察结果和 Acceptance cases，或明确记录当前自动化 gap
- **AND** MUST NOT 仅因已有技术 smoke 就宣称验收标准已覆盖

### Requirement: 新增测试必须提供可信有效性证据
新增测试 MUST 断言由事实 owner 对外可观察的行为，并 MUST 能够在目标错误存在时失败。Bug 回归测试 MUST 说明其捕获的旧错误，并在安全可行时通过修复前行为、受控错误实现或移除修复后的对照证明测试可证伪；无法安全取得对照时 MUST 报告替代证据与 gap，不得伪造失败历史。

#### Scenario: Bug 回归测试证明旧错误
- **WHEN** Agent 为可安全复现的 Bug 增加回归测试
- **THEN** 测试 MUST 在旧错误存在时失败并在当前修复下通过
- **AND** Agent MUST 报告该对照证据而不是只报告当前测试通过

#### Scenario: 旧行为无法安全执行
- **WHEN** 运行旧实现会产生破坏性副作用、成本不可接受或环境不可恢复
- **THEN** Agent MUST 使用当前失败复现、受控替代实现或精确人工推导作为替代证据并报告 gap
- **AND** MUST NOT 为取得红灯证据执行越权或危险操作

### Requirement: 替身与有状态测试必须保持事实真实性
mock、fake 或内存实现 MUST 只隔离外部协作者或不属于当前主要事实 owner 的边界，不得复制被测算法后以相同实现验证自身。测试 MUST 优先断言公共结果；只有交互协议本身属于待证明契约时才断言调用参数、顺序或次数。涉及持久状态、共享状态或外部副作用时，Agent MUST 按风险验证隔离、必要幂等、失败后清理与重复运行。

#### Scenario: mock 不替代被测逻辑
- **WHEN** Unit 或 Component 测试需要替换外部协作者
- **THEN** Agent MUST 保留被测行为的真实实现并从公共结果判断正确性
- **AND** MUST NOT mock 被测决策后只验证预设调用发生

#### Scenario: 有副作用测试可以重复运行
- **WHEN** 测试写入文件、数据库、消息、缓存或共享配置
- **THEN** Agent MUST 证明测试隔离其状态并在成功或失败后满足项目约定的清理边界
- **AND** 在幂等属于目标事实时 MUST 验证重复执行不会产生额外错误状态
