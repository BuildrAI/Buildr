## MODIFIED Requirements

### Requirement: 随包任务验证能力保持完整可组合
Buildr package MUST原子交付`buildr.task-verification/v4` contract、默认`task-verification` provider、Project `buildr.project-verification/v4` reference/template、Workspace binding、Project map CLI/Application、Task report inspect/record CLI/Application与全部supported runtime投射输入。Package authoring surface MUST不包含旧v2/v3 reference/template、Request/Plan/provider、Execution Record、Candidate或Task Finish verification authority。

#### Scenario: Package 声明 task-verification provider
- **WHEN** package static validation读取随包能力声明
- **THEN** Workspace Skills manifest MUST声明installed、enabled的`task-verification` provider、`buildr.task-verification/v4` contract与binding
- **AND** package include mapping MUST只投射v4测试地图reference/template和当前Skill资料

#### Scenario: Package 交付测试声明资料
- **WHEN** package static validation检查`task-verification`完整目录
- **THEN** provider MUST包含v4 schema reference和最小初始化模板
- **AND** 资料 MUST描述testing family scope、源码/测试根、完整入口、selection与requirements，不得索引每个测试文件

#### Scenario: Package 保留 v2 legacy reader
- **WHEN** package static validation检查Project verification runtime
- **THEN** MUST只支持当前closed v4 schema与明确legacy fixture边界
- **AND** MUST不指导新Workspace创建v2/v3声明

#### Scenario: Runtime 可发现验证入口
- **WHEN** 临时Workspace为任一supported runtime完成sync或render
- **THEN** runtime inventory MUST包含可发现的v4 `task-verification` Skill
- **AND** description MUST覆盖测试地图、Agent直接执行与开发完成报告意图

#### Scenario: Provider contract 组合验证
- **WHEN** Buildr运行随包任务Skills契约验证
- **THEN** verifier MUST覆盖v4测试地图、报告摘要并发保护、适用性、coverage gap与Buildr Web只读边界
- **AND** verifier MUST确认provider不拥有Candidate、proceed/blocked、Task status或Finish

#### Scenario: 替换默认验证 provider
- **WHEN** Workspace安装并绑定兼容的内部`buildr.task-verification/v4` provider
- **THEN** consumers MUST通过binding发现provider而不修改consumer Skill
- **AND** 默认provider在不再被选中时 MUST可安全卸载
