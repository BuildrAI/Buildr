## ADDED Requirements

### Requirement: Doctor 应用与生产源码扫描必须有可验证边界
Doctor Application MUST接收结构化输入并返回完整结果，不解析命令参数、不打印且不修改进程退出码。命令 Interface MUST拥有紧凑/完整 JSON、人类输出与退出码。生产架构扫描 MUST覆盖当前 TypeScript 和 JavaScript 源码。

#### Scenario: 通过命令或资产修改调用诊断
- **WHEN** 执行本场景
- **THEN** 真实调用方 MUST获得等价结果、输出和退出行为；受控 `.ts` 违规导入 MUST被同一生产扫描检测。
