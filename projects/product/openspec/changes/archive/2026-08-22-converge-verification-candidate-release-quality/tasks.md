## 1. 结果不变量测试

- [x] 1.1 清理固定 Skill 措辞、篇幅和流程顺序断言，保留 machine-readable capability、authority、identity 与安全禁止项检查。
- [x] 1.2 建立前序治理 Contribution 的跨模块结果不变量测试，覆盖合法alternate path与unrelated failure isolation，且不新增重型生命周期owner。

## 2. Candidate 与 Release 拓扑

- [x] 2.1 收敛 changed/focus/Candidate registry与plan tests，证明开发反馈不隐式升级完整Candidate、同一执行step去重且唯一tarball由真实consumer共享。
- [x] 2.2 收敛 Candidate CI 与 publish workflow contract，证明正式Release消费matching Candidate artifact并保留OIDC、tag、npm integrity、dist-tag、GitHub Release与安装后readback，不重跑完整Candidate。

## 3. 当前认知与直接反馈

- [x] 3.1 更新Brief、Buildr Service current knowledge和knowledge impact evidence，核对术语无冲突，并运行最低充分focused/affected反馈与OpenSpec严格/preflight检查。
