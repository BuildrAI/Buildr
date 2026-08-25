## MODIFIED Requirements

### Requirement: 随包任务验证能力保持完整可组合
Buildr package MUST原子交付`buildr.task-verification/v3` contract、默认`task-verification` provider、Project `buildr.project-verification/v3` reference/template、Workspace binding、CLI/Application runtime、Request/Plan/provider contract与全部supported runtime投射输入。Package MUST不包含v2 declaration reader/reference/template、双版本迁移指导、旧成熟度/assurance指导或Task Finish独立verification authority。

#### Scenario: Package 声明 task-verification provider
- **WHEN** package static validation读取随包能力声明
- **THEN** Workspace Skills manifest MUST声明installed、enabled的`task-verification` provider、`buildr.task-verification/v3` contract与binding
- **AND** package include mapping MUST只投射v3 declaration reference/template和Plan/provider资料

#### Scenario: Package 交付测试声明资料
- **WHEN** package static validation检查`task-verification`完整目录
- **THEN** provider MUST包含v3 schema reference和最小初始化模板
- **AND** 资料 MUST描述能力族scope、proves、evidence、targets、discovery、affected/full与按需执行边界，不得索引具体测试

#### Scenario: Runtime 可发现验证入口
- **WHEN** 临时Workspace为任一supported runtime完成sync或render
- **THEN** runtime inventory MUST包含可发现的v3 `task-verification` Skill
- **AND** description MUST覆盖Request/Plan、正式Task current Result、能力声明、实现完成验证与coverage gap意图

#### Scenario: Provider contract 组合验证
- **WHEN** Buildr运行随包任务Skills契约验证
- **THEN** verifier MUST覆盖v3 declaration、Request/Plan、provider、Execution Record reconciliation、Result currentness、coverage gap与Buildr Web只读边界
- **AND** verifier MUST确认provider不拥有Candidate、proceed/blocked、Task status或Finish

#### Scenario: 替换默认验证 provider
- **WHEN** Workspace安装并绑定兼容的内部`buildr.task-verification/v3` provider
- **THEN** consumers MUST通过binding发现provider而不修改consumer Skill
- **AND** 默认provider在不再被选中时 MUST可安全卸载

## ADDED Requirements

### Requirement: Package 必须拒绝 active v2 verification assets
Package static validation MUST扫描source manifest、runtime projection、Skills、templates、references与canonical docs/spec inputs，并 MUST在active资产包含`buildr.project-verification/v2`支持或指导时失败；归档OpenSpec provenance MUST被明确排除且不得进入package。

#### Scenario: v2 template 残留
- **WHEN** package source仍包含v2 declaration template、reference或reader
- **THEN** static validation MUST失败并列出精确active path
- **AND** MUST NOT以archive兼容或历史用户为由继续打包

#### Scenario: archive 保留历史引用
- **WHEN** archived Change中存在v2历史文本且该路径不在package映射
- **THEN** static validation MUST不把不可修改provenance判为runtime支持
- **AND** active docs、Skills与tests仍 MUST保持零v2支持
