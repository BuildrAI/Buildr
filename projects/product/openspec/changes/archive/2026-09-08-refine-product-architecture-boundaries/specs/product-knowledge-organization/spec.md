## MODIFIED Requirements

### Requirement: Product 必须提供与最终代码一致的分层代码地图
Product `knowledge/code-map/` MUST提供可导航的当前代码地图，并按系统与工程资产、功能模块、技术层/主要对象/代表方法、关键调用/数据归属/副作用四个层级表达。地图 MUST使用真实文件、目录和代码符号，区分规范承诺、当前实现、生成产物与未实现方向；MUST不把逐行索引、历史分析或派生图表当作第二规范。

#### Scenario: 从功能定位实现与副作用
- **WHEN** 维护者从代码地图查找 Task、Workspace、Agent Assets、Project Testing、OpenSpec、Installation、Diagnostics、Publication 或 Web Host
- **THEN** 地图 MUST给出所属 Service、模块、主要对象、代表方法、接口入口、数据/资源 owner、关键副作用和直接事实来源
- **AND** 所有生产模块与主要工程资产 MUST有唯一归属

#### Scenario: 迁移后检查地图来源
- **WHEN** 最终架构验证比较地图引用与 tracked tree
- **THEN** 引用路径与代表符号 MUST存在且不指向旧实现
- **AND** 规范与实现存在差异时地图 MUST显式标注而不得静默选择一方

#### Scenario: 按目录树逐层阅读
- **WHEN** 用户从地图进入项目、服务和模块
- **THEN** 地图 MUST提供实际目录树并标明手工源码、工程程序、生成结果和数据职责
- **AND** 关键模块 MUST展开至主要文件、代表方法和直接调用链，不以分散表格替代整体结构

