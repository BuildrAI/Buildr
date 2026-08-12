## ADDED Requirements

### Requirement: Retained Doctor必须绑定当前Agent并保留可恢复交付事实
Task Finish deliver MUST使用run identity绑定的Agent执行retained Doctor。Doctor非零、输出无效或`health.ready`不为true时，普通run MUST保持blocked且不得进入cleanup；当carrier交付、remote readback和containment已经完成时，blocked Result MUST保存这些partial delivery facts与产品生成的matching resume token，使外部条件修复后可以恢复同一run。Product MUST NOT提供跳过Doctor的成功参数或把blocked结果改写为passed。

#### Scenario: 普通Workspace指定Agent Doctor失败
- **WHEN** 未安装自举增强的Workspace完成carrier push/readback，但`doctor --agent <run-agent>`不ready
- **THEN** deliver MUST返回retained Doctor blocked并保留current run与resume token
- **AND** cleanup、Task terminal completion与成功delivery结论 MUST不发生

#### Scenario: Doctor blocked后保留partial delivery
- **WHEN** remote target已等于carrier或可证明完整包含carrier，随后retained Doctor失败
- **THEN** compact Result MUST包含carrier、remote refs、target disposition、containment、activation plan与Doctor blocked disposition
- **AND** MUST不创建第二份Finish Receipt、activation store或recovery manifest

#### Scenario: 外部条件修复后恢复同一run
- **WHEN** 调用方使用matching run id与产品resume token恢复Doctor-blocked run
- **THEN** Product MUST重新核对target containment、retained cleanliness和current handoff，并重新执行指定Agent Doctor
- **AND** 只有最终Doctor ready时 MUST进入cleanup并形成Formal Finish complete
