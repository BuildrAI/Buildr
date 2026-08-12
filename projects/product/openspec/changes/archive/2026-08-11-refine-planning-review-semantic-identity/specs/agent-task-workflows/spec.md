## ADDED Requirements

### Requirement: OpenSpec workflow 必须消费统一 planning identity resolver
正式 Task 的 OpenSpec propose、update、apply与converge/archive workflow MUST 在apply-ready后使用 Task Planning Identity Application取得current target与planning nodes，并把同一target交给Task Development和Planning Review。Agent MUST NOT通过 `shasum`、文件路径列表、mtime、checklist progress、Git ref或手工沿用旧值生成OpenSpec Planning Review target。

#### Scenario: Apply 前建立 Planning Review target
- **WHEN** 正式 Task 的OpenSpec Change artifacts达到apply-ready
- **THEN** sidebar MUST调用resolver、用返回nodes更新Development planning并对返回target执行或inspect Planning Review
- **AND** resolver blocked时 MUST停止apply且不得猜测target

#### Scenario: Archive 后复核已有 Review
- **WHEN** deterministic convergence把同一Change移动到archive且resolver返回与apply前相同target
- **THEN** workflow MUST复用current Planning Review而不得仅因archive path或checklist完成态重新record

