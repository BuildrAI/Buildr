### Buildr自举Workspace激活

本节只增加Buildr自举Workspace的Activation，不把自动Finish变成唯一Delivery路径。

当自动Finish或delivery reconciliation已经形成matching Task delivery result，且Workspace repository的冻结activation paths命中自举动作时，只调用一次`buildr-self-bootstrap-sync`。调用只传run ID、canonical Workspace和Environment retained Node；Skill再只启动一次bundled runner。

Runner消费Product CLI的`buildr.task-finish-self-bootstrap-input/v1`稳定投影。reconciliation结果可以没有Delivery Carrier，只要Product已从真实remote target形成Task Contribution containment proof与activation paths。Service repository不能触发Workspace自举；Workspace无贡献时返回`not-applicable`。

Runner负责self-bootstrap target lease、retained sync、精确successor commit、普通push/readback、development Buildr Web、retained Project bridge identity和最终Doctor。它只允许fast-forward，不merge、rebase、stash、reset、force push或共享历史改写，也不修改其他Task carrier。

任何Activation失败都只形成attention并保留已发生effects，不撤销Delivery、不重提业务代码、不重复push、不改写Task、Candidate、Verification、Review或Development handoff。Environment Cleanup由Task Environment依据持久化Delivery evidence独立处理。

没有matching Task delivery result、普通协作者更新或只有Doctor/runtime drift时不调用本Skill，按普通Workspace update处理。历史`doctor-blocked` current run仅作为兼容恢复输入，不再是新Delivery的正常终态。
