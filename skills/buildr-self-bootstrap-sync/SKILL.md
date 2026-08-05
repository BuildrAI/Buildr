---
name: buildr-self-bootstrap-sync
description: Buildr自举Workspace的Formal Task Finish被自身Component更新唯一阻塞或成功后使用；根据冻结Task Contribution准备并发布retained package同步。
---

# Buildr Self-bootstrap Sync

本Skill只属于Buildr自举Workspace。它是Workspace维护，不是Finish provider、产品阶段或用户Workspace默认能力。它不创建新的receipt或状态机，只使用当前会话中同一Formal Finish run的已有Result、operations和本地Git identity。

## 输入与适用性

只消费当前`buildr.task-finish-result/v2`中的Task ID、run identity、Agent、canonical Workspace、冻结Task Contribution paths及其已有phase evidence。不得重新从working tree猜测贡献。

仅当任一路径满足以下固定inputs时适用：

- `projects/product/services/buildr/package/manifest.yml`
- `projects/product/services/buildr/package/targets/workspace/**`

未命中时返回`not-applicable`，不执行sync、Git或Doctor。

## Prepare：仅恢复自举Doctor阻塞

Formal Finish尚未成功时，必须同时满足以下条件才可prepare；任一事实缺失即停止，不做sync：

1. 当前run仅阻塞于`task-finish.retained-doctor-failed`，此前carrier push和远端ref回读已经成功。
2. Doctor中所有阻塞`health.ready`的actionable findings代码都严格等于`components.update_available`；存在任何其他error、warning或无法分类的阻塞finding时停止。
3. 冻结Task Contribution命中上述package inputs，并能证明对应Component的package source属于本次贡献；不得仅凭Doctor中的Component名称推断ownership。

满足后：

1. 确认canonical Workspace、retained checkout、目标branch及`projects/product/buildr`与当前run一致。
2. 记录sync前HEAD、remote ref和porcelain；只允许已有Finish metadata，不stash、reset或覆盖。
3. 用retained Product CLI执行`sync <agent> --target <workspace>`，读取mutation plan，只接受可证明属于sync的受管tracked delta。
4. 选择`git-operations`，只stage精确owned paths并创建本地commit。记录commit、parent、tree、owned paths和sync evidence；不得push，也不得提前把Formal Finish标为成功。
5. 恢复同一个Formal Finish run。不得重建Candidate、重新Verification或启动新Finish run。

## Publish：Formal Finish成功后

同一个Formal Finish成功后执行publish：

1. 若本会话已有prepare evidence，验证retained branch、HEAD、prepared commit、parent、tree和owned paths未漂移，且Formal Result对应同一run。
2. 若没有prepare evidence，重新按固定package inputs判定适用性；命中时执行上面的retained sync、mutation ownership检查和精确本地commit，未命中返回`not-applicable`。
3. 选择`git-operations`，仅把已证明的prepared commit普通push到Formal Result声明的remote/target branch，并回读远端ref；不得force push或改写共享历史。
4. 使用同一retained CLI执行`doctor --agent <agent> --target <workspace> --json`，要求`health.ready=true`。

## 共同边界

- prepare与publish之间不持久化新的Buildr workflow state；若会话证据丢失，停止并要求重新证明，不从Git历史猜测prepared ownership。
- 没有tracked delta时记录no-op；若Doctor仍未ready，按真实finding停止，不制造空commit。
- staged delta、未知路径、symlink逃逸、HEAD/remote漂移或prepared commit不再是预期单一后继时全部fail closed。
- 不使用`git add -A`，不把sync产生的delta混入原Task carrier，也不修改Candidate、Development handoff、Formal Verification、Completion Review、decision或Environment cleanup事实。

## 结果边界

prepare成功报告`prepared`及sync前后identity、owned paths和本地commit evidence，并明确`pushed=false`。publish成功报告`passed`及prepared commit、push/readback和Doctor evidence；未命中报告`not-applicable`。只有Formal Finish已成功时，publish失败才报告“主任务已交付、自举Workspace收敛未完成”；prepare失败只报告Formal Finish仍阻塞及精确恢复现场。
