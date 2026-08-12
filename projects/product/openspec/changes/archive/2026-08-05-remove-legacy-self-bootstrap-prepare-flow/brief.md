# 移除旧自举 prepare/publish 流程

Buildr 自举收敛只在 Formal Task Finish 成功后发生。旧的“Doctor 阻塞后先准备 sync commit、恢复 Finish、再发布”不再是可用流程，也不作为兼容路径保留。

本修正只消除 canonical spec 的双重权责；实现、Workspace Component、Skill、Contribution 与 current knowledge 已经采用单一 post-Finish activation。
