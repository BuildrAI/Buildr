## Context

Task Finish 当前把 `none | render-runtime | sync-workspace` 都放进产品固定五阶段，并用 retained Project `task-finish.yml`、Task scope、Service binding 和 Task Contribution 共同授权 sync。该设计能形成强 Git evidence，但真实需求只有 Buildr 自举 Workspace 在 package payload 变化后需要把新版内置资产同步回当前 Workspace；普通用户 Workspace 不存在这种开发闭环。

Component Skill Contribution 已能让多个 Workspace Component 在 runtime render 时向既有 Skill 的明确 slot、开头或结尾组合片段，不执行任意 hook。当前自举 Workspace也已经把 Workspace canonical source 与 Agent runtime 分开管理，因此可用 Workspace 自有 Component承载自举差异。

## Goals / Non-Goals

**Goals:**

- 通用 Task Finish 只根据冻结的 Task Contribution 判断 Workspace 根 runtime source 是否需要 render。
- 自举 package sync 只在当前 Buildr Workspace 可发现、可维护、可卸载，不进入普通用户 Workspace 的默认 Task Finish 语义。
- 保持 Formal Task Finish Result 与后续 self-bootstrap convergence 结果边界清晰。
- 复用现有 Component、Skill Contribution、Git Operations、sync 和 Doctor，不增加新的执行框架。

**Non-Goals:**

- 不创建 Project/Service 级 post-finish 配置或通用 hook registry。
- 不把 Workspace Component 变成可执行插件，也不让 Contribution 插入产品 `preflight → prepare → verify → deliver → cleanup` 阶段。
- 不新增 capability contract、provider binding、SQLite、Task Domain、Candidate、Review 或 Verification 语义。
- 不把自举 Skill 发布或默认安装到用户 Workspace。

## Decisions

### 1. Task Finish activation 只保留 `none | render-runtime`

产品 planner 只观察 repository-relative Task Contribution。命中 Workspace 根 `AGENTS.md`、`rules/`、`skills/`、`components/`、`commands/`、`capabilities.yml` 或 `commands.yml` 时选择 `render-runtime`；其他路径选择 `none`。它不读取 Project declaration、Task scope 或 Service identity，也不提供 `sync-workspace`。

保留冻结 plan identity，使 Delivery Carrier 继续绑定相同的 render/none 决定；删除 declaration digest、binding identity、managed sync paths、convergence commit 和 convergence resume 分支。`finalRemoteRef`在两种模式下都等于 carrier push后的远端回读。

### 2. render 仍属于 Formal Task Finish deliver

render 使用已经交付到 retained checkout 的 Product CLI，从 retained canonical source投射当前 Agent runtime并运行Doctor。render前 retained tracked tree必须clean；render后出现tracked/staged delta即blocked，不自动暂存、提交、sync、stash或reset。这样普通用户 Workspace 的源资产交付与 runtime 可用性仍在 Formal Finish 内闭合。

### 3. 自举差异由 Workspace Component 组合

当前 Workspace 新增 `buildr-self-bootstrap` Component。Component拥有：

- `buildr-self-bootstrap-sync` Skill：完整的适用性判断、retained sync、受管delta检查、精确commit/push和Doctor流程；
- 一个 `task-finish#post-finish` contribution：在Formal Task Finish成功后、Agent报告完整收尾前交接自举Skill。

通用 `task-finish` Skill只声明 `post-finish` content slot，不知道Buildr package路径，也不声明对自举Skill的依赖。其他独立Component以后可以贡献到同一slot；不同Component不得依赖字典序形成业务顺序，需要强顺序或标准结果时再建立同一Component边界或独立capability contract。

### 4. 自举 Skill 消费 Formal Result，不成为 Finish provider

自举 Skill只接受当前成功Formal Task Finish Result中冻结的Task Contribution paths、run/task identity、Agent和canonical Workspace。它固定匹配：

- `projects/product/services/buildr/package/manifest.yml`
- `projects/product/services/buildr/package/targets/workspace/**`

未命中返回`not-applicable`。命中后使用retained `projects/product/buildr sync <agent> --target <workspace>`；sync自身完成package-to-Workspace source收敛、runtime render和Doctor。Skill只接受Buildr mutation plan可证明的受管tracked delta，并通过selected Git Operations对精确paths依次commit、push和远端回读。

Formal Task Finish已经成功时，自举失败不得改写Candidate、Development handoff或Finish Result；Agent必须报告“主任务已交付、自举Workspace收敛未完成”，并保留可恢复现场。只有Formal Result成功才允许执行该tail。

### 5. 不创建 capability contract

当前只有一个Workspace固定实现，Component同时拥有Skill和Contribution，不存在provider替换、required/optional解析或通用consumer readiness。Contribution负责内容接线，Skill负责专业动作。以后只有在多个provider或consumer必须依赖类型化稳定结果时，才单独评估contract。

### 6. 一次性自举迁移在候选Workspace完成

本变更会先修改Product package中的通用`task-finish` Skill slot，再在Task worktree自身运行candidate CLI sync，使该slot进入候选Workspace canonical source；随后用Buildr资产写入口安装Workspace自有Skill和Component。该候选整体交付后，retained runtime已经能读取Contribution；本次任务仍由当前Agent按相同自举Skill边界完成首次收敛。后续任务不再需要候选预同步，package变化由post-finish自举tail处理。

## Risks / Trade-offs

- [Risk] Formal Finish成功后自举tail失败，出现两个结果。→ 明确区分主任务交付和Workspace convergence，最终报告不得合并成单一成功；失败保留精确Git/Doctor现场。
- [Risk] 多个Contribution产生隐式顺序。→ 同一slot要求独立适用；强依赖放入同一Component或未来contract，不以Component id排序承担语义。
- [Risk] 一次性迁移时slot与Component先后不一致。→ 在隔离Task worktree先完成candidate-local sync和Component check，再冻结Candidate。
- [Trade-off] 自举收敛不进入Formal Finish Result。→ 换取用户Workspace不承担自举配置、Git convergence和恢复复杂度；Agent仍在最终报告前执行并披露结果。

## Migration Plan

1. 收窄canonical specs、Task Finish planner/executor、contract/Skill/docs与测试，删除Project declaration。
2. 在Task worktree使用candidate CLI同步新版`task-finish` slot到候选Workspace源资产。
3. 创建并安装Workspace-owned `buildr-self-bootstrap` Component、Skill和Contribution，验证Component完整性与runtime组合。
4. 完成Change reconcile/converge、正式Verification、Candidate、Review和Formal Finish。
5. Formal Finish成功后按新自举Skill执行首次retained sync/Doctor及必要的精确commit/push。

回滚时先卸载Workspace Component，再恢复上一Product版本与Workspace sync结果；不得只删除runtime派生片段。

## Open Questions

无。
