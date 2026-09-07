## ADDED Requirements

### Requirement: Buildr Web必须在概览按需查看本机复盘文档
Buildr Web MUST在Task概览显示复盘文档固定本机路径与`无复盘文档|等待你的决定|已经决定`状态。只有Task Record已经登记文档时才提供查看入口；打开正文 MUST调用Task Record只读接口并 MUST不产生写入。

#### Scenario: 只读查看当前复盘
- **WHEN** 用户打开已登记复盘文档
- **THEN** 页面 MUST展示Markdown、实际摘要状态和局部漂移提示
- **AND** Task Record digest MUST保持不变

#### Scenario: 用户明确完成决定
- **WHEN** 用户查看匹配当前登记摘要的文档并点击“我已完成决定”
- **THEN** 页面 MUST通过Task Record update提交当前record digest、文档摘要和`decided`
- **AND** MUST不创建后续Task或处置说明

## REMOVED Requirements

### Requirement: Buildr Web 必须展示复盘来源与承接关系
**Reason**: Task Record不再保存专用复盘来源，Buildr Web也不再维护复盘工作台。
**Migration**: 后续工作使用普通Task，来源按需写入目标说明。
