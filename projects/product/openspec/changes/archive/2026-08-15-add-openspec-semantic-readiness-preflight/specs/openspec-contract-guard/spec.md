## ADDED Requirements

### Requirement: OpenSpec Contract Guard必须前置语义就绪门禁
OpenSpec Contract Guard MUST 在Change artifacts达到apply-ready并通过上游strict validation后、Planning Review和实现前调用semantic readiness preflight。只有current结果为`ready`时 sidebar 才能继续planning identity resolver和Planning Review；`blocked`时 MUST停止Review/apply并把最小语义结果交给Agent。Planning Review MUST NOT拥有、复制或重新实现OpenSpec preflight逻辑。

#### Scenario: Preflight ready后进入Planning Review
- **WHEN** 当前Change的semantic readiness preflight返回`ready`
- **THEN** Contract Guard sidebar MUST继续取得planning identity并按既有Task workflow执行或inspect Planning Review
- **AND** MUST说明ready只覆盖当前OpenSpec观察，不替代最终converge或实现验证

#### Scenario: 内在语义问题阻塞
- **WHEN** preflight返回`scenario-omission`、`identity-conflict`、`projected-validation`或其他`semantic-resolution-required`
- **THEN** sidebar MUST在Planning Review前停止并要求Agent修订Change artifact或请求用户决定
- **AND**修订后 MUST重新运行upstream strict与preflight

#### Scenario: Active Change冲突阻塞
- **WHEN** preflight返回`active-change-conflict`
- **THEN** sidebar MUST列出冲突Change、capability和Requirement，并要求Agent处理前序依赖、合并语义或重划范围
- **AND** MUST不把时序冲突自动改写为当前Change artifact内容

### Requirement: Semantic readiness preflight必须保持无持久副作用
Contract Guard preflight MUST只返回当前观察结果，`effects` MUST为空；它 MUST NOT写入canonical spec、Change `.buildr/` sidecar、Convergence Receipt、archive、Task Development、Task Review、Task Verification或Workspace SQLite。临时projected validation surface MUST由运行期清理且不得成为authority。

#### Scenario: Preflight通过或阻塞
- **WHEN** 任一preflight执行完成、失败或被blocker终止
- **THEN** active Change、canonical specs、Receipt、archive和Task专业事实 MUST保持不变
- **AND**结果 MUST只报告readiness、diagnostics和nextActions
