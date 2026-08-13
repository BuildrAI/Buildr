## 1. Contracts and domain

- [x] 1.1 更新 Task Development、Task Verification、Task Review 与 Task Finish capability contracts/Skills，明确有效Project集合、workspace gap、风险处置和既有门禁。
- [x] 1.2 在Task Record domain提供有效Project集合与workspace-only判定，并让Development policy、Verification Result closed normalization接受且只接受自描述workspace shape。
- [x] 1.3 保持旧Development Receipt/Verification Result兼容读取，并在repository新写入时拒绝Task scope不匹配的workspace值。

## 2. Application and read model

- [x] 2.1 让Task Verification declaration observer覆盖显式Project、Service所属Project与Change所属Project，并保持确定性去重排序。
- [x] 2.2 让Task Development policy校验只对真正workspace-only Task接受`workspace` gap，并在Project/Service/Change scope下保持非空declaration与coverage门禁。
- [x] 2.3 核对operation contracts、CLI与read model的current/stale/diagnostic投影，不增加第二writer或持久字段。

## 3. Regression coverage

- [x] 3.1 增加domain测试，覆盖workspace policy/Result合法shape、not-passed约束、Project空declarations拒绝与旧Receipt读取。
- [x] 3.2 增加Application/repository测试，覆盖policy current/stale、未记录gap Result不能freeze、合法风险处置到handoff及scope伪造拒绝。
- [x] 3.3 增加CLI/System测试，覆盖workspace Result、Project-only、Service-scoped、多Project和Development到Task Finish五阶段交付。

## 4. Knowledge and validation

- [x] 4.1 更新Brief、Product/Technical architecture、Buildr Service说明和适用glossary条目，并完成current knowledge reconcile。
- [x] 4.2 运行相关focused/changed测试、contract审计、OpenSpec strict validation与diff检查，修复全部回归。
- [x] 4.3 确认Change checklist完整、无active冲突且满足deterministic convergence/archive前置条件。
