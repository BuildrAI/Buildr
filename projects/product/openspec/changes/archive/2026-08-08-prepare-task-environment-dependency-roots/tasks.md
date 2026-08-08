## 1. 声明与领域模型

- [x] 1.1 实现closed Project `task-environment.yml` parser、Service closure与candidate bootstrap root计划，并登记Product的`buildr`/`buildr-web` npm roots及source-build边。
- [x] 1.2 将Environment Receipt升级为v3 dependency-root facts与scope聚合，同时兼容只读v2/cleaned current并更新public result v2。

## 2. 准备、检查与恢复

- [x] 2.1 将单一`ensureCandidateDependencies()`替换为逐root observe/prepare，使用Workspace Foundation绝对npm并返回逐rooteffects/diagnostics。
- [x] 2.2 实现manifest/lockfile identity、prepared identity、部分缺失、漂移、幂等复用、失败保留与整体required聚合。
- [x] 2.3 分离CLI live inspect与Application saved-current read，保持inspect零写入、Local App GET零probe。

## 3. 消费者与当前认知

- [x] 3.1 更新CLI JSON/help、Local App HTTP/read model/Environment Tab与browser fixtures，准确展示多dependency roots和legacy diagnostic。
- [x] 3.2 更新Task Environment Skill/contract、CLI文档、technical architecture、Buildr/Buildr Web Service knowledge与正式Task flow说明。

## 4. 测试与收敛

- [x] 4.1 增加domain/repository/application测试，覆盖双root首次准备、仅web缺失、lockfile漂移、web安装失败、幂等与无关Service不安装。
- [x] 4.2 增加fresh canonical fixture/worktree集成证明：一次prepare准备两个root并以buildr-web lockfile工具成功运行`npm run build:web`，且不依赖retained/system编译器。
- [x] 4.3 更新package/static/public JSON/Local App parity fixtures，运行受影响反馈并修复。
- [x] 4.4 reconcile current knowledge与Change artifacts，完成strict validation和archive readiness核对。
