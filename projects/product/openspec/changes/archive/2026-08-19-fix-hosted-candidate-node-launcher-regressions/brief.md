# 修复 hosted Candidate Node 矩阵与 Launcher readiness 回归

一句话摘要：让 Host Node matrix 绑定各 tuple 的实际 Node，并让 macOS Launcher 在确定性 PATH 和专用 readiness budget 下启动，失败时保留可审计诊断。

## 背景与问题

Hosted Candidate `32263961213` 中，最低/current Host Node jobs 被 development `.node-version` 误约束；macOS release tarball Launcher smoke 又在固定约 5 秒 readiness 窗口结束后清理了 launcher log 与 instance/process 现场。前者是已确认的参数传递缺口；后者的 PATH 继承与启动耗时仍是待验证机制，不作为已确认根因。

## 目标与非目标

- 目标：Host Node tuple 的父进程 executable 与子进程 PATH 均绑定该 tuple 的实际 Node，development checkout 继续绑定声明的精确 Node。
- 目标：macOS Launcher 从 binding Host Node 重建 PATH，并用 health/log 输出实际 Node identity。
- 目标：使用 15 秒独立 readiness budget，在失败清理前保存脱敏 instance、process、launcher log、elapsed 与 Node audit。
- 非目标：不改变 Candidate 覆盖、shard/aggregate 语义、Node 支持范围或外层 timeout；不发布版本，不处置 rc.20 retrospective。

## 受影响角色

- Buildr maintainer：hosted minimum/current tuple 不再被 checkout development Node 误拒绝，失败 evidence 可直接定位 Launcher 启动阶段。
- Buildr release verifier：同一冻结 tarball 的 Launcher lifecycle 使用可审计的 exact Node/PATH 与专用 readiness budget。
- Buildr Agent：Content Target 改变后仍需重跑本地与 hosted 完整 Candidate，不能复用 run `32263961213` 的失败 evidence。

## 核心流程

Candidate artifact producer冻结一次tarball → minimum/current Host Node tuple以各自实际Node构造exact environment → macOS release smoke安装并显式创建Launcher → wrapper从binding重建PATH → health证明实际runtime identity。若readiness超时，先写入既有Candidate diagnostics，再回收owned进程与清理临时根；aggregate gate继续只接受全部closed evidence通过。

## 关键变化

- Host Node entry把`expectedNodeVersion: null`传入真实executor，而不仅写入timing summary。
- macOS Launcher wrapper和LaunchServices smoke入口共同绑定Host Node bin为PATH首项。
- readiness从固定次数改为15秒wall-clock budget；错误包含elapsed、budget、instance与process facts。
- launcher失败证据写入runner diagnostics，instance secret脱敏，不保留整个安装根或新建旁路store。

## 影响、风险与兼容性

变更不改变公开CLI、Task schema、release transaction schema或package bytes ownership。15秒仍可能在新的极端runner负载下不足；新的timing/process/log evidence将支持后续基于事实调整。macOS真实LaunchServices行为最终由hosted Candidate证明，非macOS测试只检查生成wrapper contract。

## 验收摘要

- minimum/current Host Node均消费同一tarball并使用各自实际Node，hostile PATH不造成子进程漂移。
- macOS Launcher实际runtime与binding Host Node一致，15秒内正常启动。
- 确定性不就绪fixture在专用budget内失败并保留脱敏instance、process、log与Node audit。
- Candidate覆盖、唯一shard owner与aggregate fail-closed contract测试保持通过。
- 最终字节通过本地和hosted完整Candidate后才能Finish到`dev`。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/product-verification-quality/spec.md`
- `specs/open-source-release-governance/spec.md`
- `tasks.md`
