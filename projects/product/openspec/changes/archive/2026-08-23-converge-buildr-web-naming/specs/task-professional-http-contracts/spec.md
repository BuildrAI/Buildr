## MODIFIED Requirements

### Requirement: 专业 HTTP Contract Test 必须锁定成功、错误和未迁移边界

Buildr MUST 提供真实 Buildr Web HTTP Contract Test，覆盖每个已登记 professional operation 的合法请求、成功 response schema、统一错误 envelope、未知/缺失/非法字段、不变异和既有 security/error precedence；测试 MUST 明确报告未登记 operation，但 MUST NOT 将未迁移的其他 HTTP API 作为本 Change 的全局 hard gate。

#### Scenario: 合法请求和响应通过同一契约
- **WHEN** Contract Test 发送合法专业请求
- **THEN** 真实 HTTP response 按同一 catalog response Schema 校验通过，并证明调用了正确 authority

#### Scenario: 错误 precedence 保持稳定
- **WHEN** 请求同时触发 path/security/body/Schema 或 Application conflict 条件
- **THEN** Contract Test 观察到既有优先级和稳定 error envelope，且不存在被 Ajv 泛化覆盖的回归

#### Scenario: 未迁移 operation 只形成诊断
- **WHEN** coverage check 发现不在本 Child catalog 的 Task/Workspace/Runtime/System operation
- **THEN** 输出可读 migrated/unmigrated 诊断，不阻断 unrelated CLI、read-only work 或其他 Child 的独立交付

