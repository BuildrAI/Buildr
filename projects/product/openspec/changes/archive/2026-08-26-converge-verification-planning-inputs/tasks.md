## 1. Changed path canonicalization

- [x] 1.1 在Verification Application中按registered Project source root规范化Project/Workspace相对changed paths，并对越界或错误Project前缀返回typed diagnostic
- [x] 1.2 让Request、provider、Browser dispatcher与Plan identity只消费canonical Project-relative paths
- [x] 1.3 增加两种相对根同Plan identity、Windows separator、deleted path、attached Project和越界拒绝的Unit/CLI测试

## 2. Formal Preparation preview

- [x] 2.1 增加`buildr.verification-plan-result/v1` public envelope，保留raw Plan v1并让run兼容读取两种文件
- [x] 2.2 让`verification plan --environment --workspace`只读解析matching Environment并投影Preparation closure、requirements与closed plan request
- [x] 2.3 让preview与run共用完整selected capability closure，Plan Request保留base scopes并携带全部去重辅助requirements
- [x] 2.4 增加零副作用preview、一次prepare后首次run直接执行、drift fail-closed与Legacy/raw Plan兼容测试

## 3. Planning Review capability guidance

- [x] 3.1 更新Product builtin `task-review` Skill，条件化审查真实跨owner结果不变量与uncovered边界
- [x] 3.2 保持`buildr.task-review/v1` contract、binding和Result schema不变，并验证provider/consumer组合与runtime asset integrity

## 4. Knowledge and verification readiness

- [x] 4.1 更新Brief、Buildr Service与OpenSpec lifecycle flow current knowledge，确认不新增glossary术语
- [x] 4.2 运行OpenSpec strict/preflight、public JSON/installed-layout contract、focused与affected验证，修复本Change全部回归
- [x] 4.3 确认全部checkbox可在Change convergence/archive前完成，且Formal Verification、Finish、self-bootstrap与Environment cleanup未进入本checklist
