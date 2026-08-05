---
name: buildr-self-bootstrap-sync
description: Buildr自举Workspace的Formal Task Finish成功后使用；根据已交付Task Contribution判断package资产变化，并把新版Buildr package同步回retained Workspace。
---

# Buildr Self-bootstrap Sync

本Skill只属于Buildr自举Workspace。它是Formal Task Finish之后的Workspace维护，不是Finish provider、产品阶段或用户Workspace默认能力。

## 输入与适用性

只消费当前成功`buildr.task-finish-result/v2`中的Task ID、run identity、Agent、canonical Workspace和冻结Task Contribution paths。不得重新从working tree猜测贡献，也不得在Formal Finish未成功时运行。

仅当任一路径满足以下固定inputs时适用：

- `projects/product/services/buildr/package/manifest.yml`
- `projects/product/services/buildr/package/targets/workspace/**`

未命中时返回`not-applicable`，不执行sync、Git或Doctor。

## 执行

1. 确认canonical Workspace是当前Buildr自举Workspace，retained checkout位于Formal Result声明的Workspace，且`projects/product/buildr`存在。
2. 记录sync前Git HEAD、branch和porcelain status；存在非Task Finish已知metadata的未提交变化时停止，不stash、reset或覆盖。
3. 使用retained Product CLI执行：

   ```bash
   <workspace>/projects/product/buildr sync <agent> --target <workspace>
   ```

4. 读取Buildr mutation plan，只接受该plan可证明属于sync的受管tracked delta；出现未知路径、staged delta或无法证明ownership时停止并保留现场。
5. 没有tracked delta时跳过Git动作。有受管delta时选择`git-operations`，仅对精确owned paths依次执行commit、普通push和远端ref回读；不得使用`git add -A`、force push或共享历史改写。
6. 使用同一retained CLI执行`doctor --agent <agent> --target <workspace> --json`，要求health ready。

## 结果边界

成功报告`passed`及sync前后identity、owned paths、可选commit/push/readback和Doctor evidence；未命中报告`not-applicable`。失败报告“主任务已交付、自举Workspace收敛未完成”与精确恢复现场，不得改写Candidate、Development handoff、Formal Verification、Completion Review、decision、Formal Finish Result或Environment cleanup事实。
