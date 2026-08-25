## 1. 生命周期与关联模型

- [x] 1.1 实现version-scoped release lifecycle projector、阶段与稳定recovery identity，并让correlation在closeout前消费唯一active协调Task
- [x] 1.2 增加lifecycle/correlation单元测试，覆盖授权等待、Candidate/attempt恢复、support Task独立和closed完成条件

## 2. Git carrier与closeout

- [x] 2.1 让release→main owner创建、核验和复用generation-scoped确定性carrier与唯一PR
- [x] 2.2 修正selection本地cleanup，使正式远端或remote-tracking release ref存在时仍能安全删除本地branch与lifecycle refs
- [x] 2.3 实现幂等closeout，保留并核验正式远端release ref，枚举和清理owned本地/远端carrier与临时资源
- [x] 2.4 为main→dev增加branch policy预检、确定性recovery identity与冲突/remote race恢复事实

## 3. 黄金生命周期验证

- [x] 3.1 扩展release selection与Git convergence集成测试，覆盖新generation、squash carrier、策略漂移、冲突恢复和未知ownership失败关闭
- [x] 3.2 增加端到端黄金生命周期fixture，证明同version只使用一个active协调Task、授权等待可恢复、无代码Task可完成且最终零中间资源遗留

## 4. Agent工作方法与当前认知

- [x] 4.1 更新`buildr-release` Skill，移除readiness后完成Task与新建recovery协调Task的正常路径，改为消费lifecycle/closeout结果
- [x] 4.2 更新release checklist、open-source release flow与Buildr Service current knowledge，明确正式/中间ref分类和dev merge策略
- [x] 4.3 创建并收敛Change Brief、knowledge impact与适用术语，保证规范、实现和当前认知一致

## 5. Change验证与归档准备

- [x] 5.1 运行受影响release测试、contract检查、OpenSpec strict validation与convergence preflight，修复全部Change-owned问题
- [x] 5.2 核对所有Change-owned任务、delta Scenario与current knowledge已完成并达到deterministic convergence/archive条件
