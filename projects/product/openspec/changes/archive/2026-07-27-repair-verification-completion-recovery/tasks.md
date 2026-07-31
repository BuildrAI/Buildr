## 1. 验证进程生命周期

- [x] 1.1 将 verification step 的 child `exit`、owned cleanup、stdio `close` 与最终 settle 拆为幂等状态
- [x] 1.2 为 exit-to-close 增加可测试的有界 grace period，并在超时时返回稳定失败诊断
- [x] 1.3 保持 process group 与 observed descendants 清理只绑定当前 step ownership
- [x] 1.4 修复 task preview 受认证 stop 后未退出进程的 fixture-owned orphan

## 2. 聚合结果与证据

- [x] 2.1 确认 DAG 在 step close timeout 或 cleanup failure 后仍能结束并保留其他检查结果
- [x] 2.2 确认 changed verification 为非通过 execution 写出 `buildr.verification-timing/v1` summary

## 3. 回归测试

- [x] 3.1 增加直接子进程退出但后代持有 stdio 的 runner 回归测试
- [x] 3.2 增加 exit/close 竞态、close timeout 和 cleanup failure 不重复 settle 的单元测试
- [x] 3.3 增加聚合执行非通过但 summary 仍生成的 fast integration 测试

## 4. 当前认知与验证

- [x] 4.1 创建并核对 Change Brief、知识影响和术语影响证据
- [x] 4.2 收敛最终实现与 current knowledge，运行聚焦测试和受影响验证
