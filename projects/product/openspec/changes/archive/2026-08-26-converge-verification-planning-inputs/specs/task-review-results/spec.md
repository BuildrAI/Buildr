## ADDED Requirements

### Requirement: Planning Review必须审查真实跨owner结果边界
当Task Intent或current planning nodes实际跨两个以上lifecycle owner时，Task Review guidance MUST要求Agent在现有`reviewed|uncovered|findings`中说明受影响owner、每个owner保护的结果不变量及未覆盖边界。Owner集合与影响 MUST由Agent基于current Task和planning artifacts语义判断；Buildr MUST NOT通过关键词生成通用authority map、固定所有Task的owner checklist、增加Result字段或接管专业判断。只有遗漏会放行错误对象写入、证据失真或完成误报时，Planning Review MUST返回`changes-required`。

#### Scenario: Change同时影响Delivery、Activation与Cleanup
- **WHEN** Planning Review确认同一Change修改Task Delivery后的Activation顺序和Environment/Carrier Cleanup证据
- **THEN** `reviewed` MUST覆盖这些实际owner及其Delivery不可撤销、Doctor只读、物理清理证据等适用不变量
- **AND** 无法覆盖的相关owner MUST进入`uncovered`并说明原因

#### Scenario: 单owner或code-only计划
- **WHEN** current计划只影响一个owner，或没有真实跨owner语义
- **THEN** Review MUST按实际范围工作，不得生成固定Delivery/Activation/Cleanup/Diagnostics清单

#### Scenario: 跨owner遗漏只构成改进建议
- **WHEN** 未覆盖边界不会造成错误写入、证据失真或完成误报
- **THEN** Review MAY记录finding但 MUST NOT仅因通用完整性偏好增加硬门禁
