## 1. Release selection 生命周期

- [x] 1.1 扩展selection read model，以不可变`freezes/<generation>` refs重建按generation排序的freeze history并纳入current identity
- [x] 1.2 实现独立`reopen --confirm --reason`动作，以current ref compare-and-swap保留历史freeze并释放current freeze，保持update独立授权
- [x] 1.3 更新freeze与cleanup，使新旧frozen ref兼容、重复freeze幂等、cleanup覆盖全部本地history refs且仍拒绝remote ref

## 2. 行为与契约测试

- [x] 2.1 扩展release selection集成测试，覆盖frozen直接update阻塞、reopen后update/refreeze、legacy migration、缺少确认/原因、ref漂移和cleanup
- [x] 2.2 更新release model governance契约测试，固定历史freeze、公开事实核验、support/coordination Task边界与失败Candidate不完成release Task
- [x] 2.3 运行release selection与release authority focused测试并修复实现反馈

## 3. Release workflow与当前认知

- [x] 3.1 更新`buildr-release`，在无公开publication事实时编排reopen/refreeze，并让`release-<version>`协调Task只在完整准备终点完成
- [x] 3.2 更新release flow、Buildr Service knowledge与release checklist，说明support Task、failed Candidate恢复和历史错误终态的active recovery Task
- [x] 3.3 核对canonical glossary；现有术语足够则记录aligned，否则只维护已由spec确认的必要定义

## 4. 收敛反馈

- [x] 4.1 运行OpenSpec strict/convergence preflight、release契约测试与`git diff --check`，修复全部Change-owned反馈
- [x] 4.2 reconcile并inspect Brief/current knowledge/terminology impacts，确认没有未决项且所有delivery-content修改都已纳入最终反馈
