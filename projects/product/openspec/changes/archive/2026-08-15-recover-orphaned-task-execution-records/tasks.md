## 1. Domain 与持久化

- [x] 1.1 扩展 Execution Record `unknown` 终态、acknowledged resolution 与 GC eligibility，并增加 Domain 测试
- [x] 1.2 新增连续 SQLite migration，保留既有 rows/indexes/invocation identity，并覆盖 fresh/upgrade/readback

## 2. Verification 恢复

- [x] 2.1 实现 terminal summary 的 owned boundary、identity、完成事实与 outcome 校验及 closed body 重建
- [x] 2.2 实现原 record 的 terminal-evidence CAS seal、幂等并发处理与 transient cleanup
- [x] 2.3 实现无证据时 authorization-required 结果和显式 authorized-unknown 处置

## 3. Agent CLI 与公共契约

- [x] 3.1 登记 `task execution-record recover`、closed 参数解析、help 与 portable JSON schema
- [x] 3.2 覆盖 CLI 非法输入、自动恢复、授权缺失、unknown 处置与重复 invocation 解阻塞

## 4. 收敛与验证

- [x] 4.1 更新 Change Brief 与 Buildr Service 当前认知，核对术语和 knowledge impact
- [x] 4.2 运行 affected static/unit/integration/system 测试、strict OpenSpec validation 与 convergence preflight
- [x] 4.3 完成 archive readiness 检查并保持 Change disposition 可收敛
