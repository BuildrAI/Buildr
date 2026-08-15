## MODIFIED Requirements

### Requirement: OpenSpec workflow 必须消费统一 planning identity resolver
正式 Task 的 OpenSpec propose、update、apply与converge/archive workflow MUST 在apply-ready后先运行OpenSpec Contract Guard semantic readiness preflight。Preflight current且`ready`后，workflow MUST使用Task Planning Identity Application取得current target与planning nodes，并把同一target交给Task Development和Planning Review；preflight `blocked`时 MUST在resolver、Planning Review和apply前停止，由Agent处理最小语义决定。Agent MUST NOT通过 `shasum`、文件路径列表、mtime、checklist progress、Git ref或手工沿用旧值生成OpenSpec Planning Review target，也 MUST NOT让Planning Review解释或复制preflight逻辑。

#### Scenario: Apply 前建立 Planning Review target
- **WHEN** 正式 Task 的OpenSpec Change artifacts达到apply-ready并通过upstream strict validation
- **THEN** sidebar MUST先运行semantic readiness preflight；ready后再调用resolver、用返回nodes更新Development planning并对返回target执行或inspect Planning Review
- **AND** preflight或resolver blocked时 MUST停止apply且不得猜测target或把blocker写入Review Result代替处理

#### Scenario: Preflight blocker由Agent处理
- **WHEN** semantic readiness preflight报告active Change conflict、Scenario omission、rename/identity conflict或projected validation failure
- **THEN** Agent MUST只处理对应Change语义、依赖顺序或用户决定，并在事实变化后重新运行strict与preflight
- **AND** MUST不手工生成ready、修改canonical或要求Planning Review裁决OpenSpec parser结果

#### Scenario: Archive 后复核已有 Review
- **WHEN** deterministic convergence把同一Change移动到archive且resolver返回与apply前相同target
- **THEN** workflow MUST复用current Planning Review而不得仅因archive path或checklist完成态重新record
- **AND** archive前最终converge仍 MUST按最新事实重新规划，不得消费apply前preflight作为写入授权
