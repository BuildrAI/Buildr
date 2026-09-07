## ADDED Requirements

### Requirement: 退役任务模块不得保留人工源码或兼容转发
Task Development、Task Planning Identity、legacy Task Finish与Terminal Delivery的Domain、Application、Persistence、Interface、fixture、helper和专属测试 MUST直接删除。直接重写的Task Overview、Repository、HTTP契约与Web接口 MUST使用TypeScript单一人工源码；现有共享MJS组合与验证基础 MAY只移除退役依赖，MUST NOT通过仅修改扩展名伪装成已完成TypeScript迁移。

#### Scenario: 扫描生产与测试源码
- **WHEN** source layout verification扫描受影响路径
- **THEN** 退役模块 MUST没有`.mjs|.js|.ts`实现或兼容wrapper
- **AND** 直接重写的TypeScript源码 MUST没有同名MJS、`@ts-nocheck`、无边界`any`或掩盖职责边界的类型断言

#### Scenario: 构建Application Payload
- **WHEN** current TypeScript source生成CLI/runtime payload
- **THEN** 生成JavaScript与声明 MUST只作为构建产物
- **AND** MUST不形成第二人工源码或运行时TypeScript依赖
