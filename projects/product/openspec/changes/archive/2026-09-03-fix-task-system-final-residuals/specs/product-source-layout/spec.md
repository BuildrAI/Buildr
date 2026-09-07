## MODIFIED Requirements

### Requirement: 退役任务模块不得保留人工源码或兼容转发
Task Overview、Task Development、Task Planning Identity、Task Environment、Task Execution Record、legacy Task Finish 与 Terminal Delivery 的 Domain、Application、Persistence、Interface、fixture、helper 和专属测试 MUST直接删除。`src/task` 中保留的 Task Record、Task Review、Task Verification 与父任务协调（Task Parent Coordination）Domain、Application、Repository、CLI、HTTP 和 module ports MUST使用 TypeScript 单一人工源码并通过 strict typecheck；现有未触达共享 MJS 组合与验证基础 MAY渐进保留，MUST NOT通过仅修改扩展名伪装 TypeScript 迁移。

#### Scenario: 扫描生产与测试源码
- **WHEN** source layout verification 扫描受影响路径
- **THEN** 退役模块 MUST没有 `.mjs|.js|.ts` 实现或 compatibility wrapper
- **AND** `src/task` 保留 TypeScript 源码 MUST没有 `@ts-nocheck`，公共输入 MUST从 `unknown` 收窄且公共边界不得使用无约束 `any`

#### Scenario: 构建Application Payload
- **WHEN** current TypeScript source 生成 CLI/runtime payload
- **THEN** 生成 JavaScript 与声明 MUST只作为构建产物
- **AND** MUST不形成第二人工源码或运行时 TypeScript 依赖
