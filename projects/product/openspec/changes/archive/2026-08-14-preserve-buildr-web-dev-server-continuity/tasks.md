## 1. Activation Continuity

- [x] 1.1 为self-bootstrap runner增加安装前默认实例的secret health观测，并冻结development channel与同端口恢复条件
- [x] 1.2 增加bundled continuity helper，通过retained Project bridge、retained Node与新Launcher identity条件式恢复服务，并在失败时回收本次进程
- [x] 1.3 将恢复后的port、PID、source root、successor commit与Node校验接入`install-local-app`阶段evidence和fail-closed顺序

## 2. Verification Coverage

- [x] 2.1 补充原本健康实例同端口恢复、原本未运行不启动、identity/health失败阻塞与异常进程回收测试
- [x] 2.2 更新self-bootstrap Component/Skill contract与完整性identity，并验证runner投射仍为自包含入口

## 3. Current Knowledge and Convergence Readiness

- [x] 3.1 更新Buildr technical architecture、OpenSpec lifecycle flow与Service current knowledge，保持既有术语定义不变
- [x] 3.2 运行Change strict validation与相关affected反馈，修复诊断并完成current knowledge inspect
