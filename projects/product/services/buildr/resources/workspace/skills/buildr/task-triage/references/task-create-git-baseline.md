# 新正式 Task 创建前的 Git 基线

只有即将创建 active Task 或把 todo 激活为 active 时执行本门禁；todo create、inspect、已有active继续、纯讨论和只读探索不执行。

1. 以已经解析的完整repository set为输入，按selector固定顺序为每个repository解析integration branch、remote与matching upstream。优先使用Project/Service registry的Git声明；声明缺失时只接受当前符号branch/upstream或用户明确选择形成的唯一事实。无法唯一解析时在tree/history零写入状态返回`blocked`，不得猜测`dev`或复制Workspace目标。
2. 逐个核验真实Git root、当前符号branch恰为已解析integration branch、upstream恰为matching remote ref、remote/ref可读、index与working tree clean，并且没有rebase、merge、cherry-pick等进行中的Git operation。任一事实不成立时在tree/history零写入状态返回`blocked`；不checkout、不stash/autostash、不猜其他branch/remote。
3. 读取optional `buildr.git-operations/v1` binding；在本create分支把ready selected provider作为required。先为全部repositories逐一选择独立`fetch` operation，明确各自remote与integration branch，消费每个Result。任一fetch blocked时不执行尚未开始的rebase，不创建Task，并报告全部已发生的remote-ref effects。
4. 全部fetch成功后重新核验每个local integration branch、matching remote ref与clean状态，再按同一顺序为每个repository明确选择`rebase` operation。本地已对齐、仅落后或含未push且未共享commit都使用同一operation；provider不自行选择merge或push。
5. rebase冲突时，consumer明确授权provider只在pre-state已证明clean时执行有界`rebase --abort`。只有branch、HEAD、index与working tree精确恢复到pre-rebase facts才记为recovered；无论恢复是否成功，本次Task create都是`blocked`。abort失败或恢复不可证明时保留现场。已经在其他repository成功的fetch/rebase不反向回滚，必须作为部分effects报告。
6. 任一rebase返回`treeChanged: true`时，按产品入口Buildr Skill的workspace transition约束，对相应Buildr Workspace执行当前Agent的check；Doctor或必要收敛未ready时不创建Task。matching upstream上的协作者提交属于普通Workspace update；本地没有协作者Task是正常事实，不得据此补造历史任务或交付记录。Doctor仅指向当前Agent managed workspace/runtime projection stale时，将现有用户授权或一次明确sync确认交给产品入口Buildr Skill执行`buildr sync <agent> --target <workspace-root>`并消费最终Doctor；存在非sync blocker时按对应authority停止或处理。
7. 只有完整repository set的fetch、rebase、恢复检查与适用transition check全部成功，才调用selected `buildr.task-record/v3` provider的active `create`或`activate`。任一门禁blocked时todo保持不变。Task Record Application与Buildr Web不获得任何Git mutation或本门禁状态authority。

上述Workspace update分类只组合本次Git Result与post-transition Doctor，不按commit author推断ownership，也不建立持久状态。普通workspace sync不创建Task、Worktree、Verification或self-bootstrap evidence。
