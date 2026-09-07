## MODIFIED Requirements

### Requirement: 退役任务能力必须具有无残留验收
Product verification MUST覆盖fresh/升级SQLite、Task Record、OpenSpec、Review、Verification、父任务协调、Buildr Web与发布回归，并证明Task Overview、Task Environment、Task Development、Planning Identity、Task Candidate、Development Handoff、旧Finish、Contribution协调与Execution Record没有运行时入口、current表、能力绑定、兼容转发或专属owner。

#### Scenario: 完整受影响验证
- **WHEN** 最终任务系统收敛完成
- **THEN** 类型、Unit、Component、Contract、Integration、System、适用Browser、package和OpenSpec检查 MUST通过
- **AND** Product/Release Candidate模型 MUST保持独立且可用

### Requirement: 专属 Integration slice 必须保持当前能力的唯一 primary ownership
Verification registry MUST为仍存在的Task Record、Review、Verification与父任务协调实现选择唯一primary owner。Task Overview、Retrospective Application、Task Entry、Environment、Task Development、Planning Identity、旧Finish和Contribution协调 MUST没有空step、shard或路径映射。

#### Scenario: changed paths命中Task实现
- **WHEN** affected selection命中当前保留的Task实现
- **THEN** MUST选择覆盖该实现的现有owner
- **AND** MUST不选择已退役Task能力的owner

#### Scenario: changed paths命中Task read或专业实现
- **WHEN** affected selection命中Task Record或保留专业reader
- **THEN** MUST选择该实现当前唯一owner
- **AND** MUST不选择Overview、Environment、Development或Finish专属owner

#### Scenario: 本机复盘文档能力变化
- **WHEN** Task Record复盘摘要、固定文件读取或Buildr Web复盘卡片发生改变
- **THEN** MUST由Task Record Integration/System和适用Browser owner证明
- **AND** MUST不重建Task Retrospective专属slice
