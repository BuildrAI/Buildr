目标：任务分支（Branch）远端生命周期统一授权——没有明确授权不推送任务分支到远端、不留任务分支在远端。

知识影响（assess）：`knowledge/docs/architecture/task-system.md` 与 `knowledge/docs/guides/getting-started.md` 的收尾授权句需同步"远端任务引用"一项；技术图与代码地图不涉及。规范变化先进入 OpenSpec，不把新行为写成当前事实。

验收：规则层两条不变量落地；`task-finish` 方法含逐仓枚举与生命周期绑定；`git-operations` 提供条件远端删除；两份契约（Contract）文本一致；`openspec validate --strict` 与 `buildr openspec convergence preflight` 通过。
