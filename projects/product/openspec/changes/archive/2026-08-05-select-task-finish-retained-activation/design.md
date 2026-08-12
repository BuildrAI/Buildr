## Context

当前 Product Task Finish 在 `deliver` 内根据路径分类结果直接执行 retained `sync/install/Doctor`。`classifyRetainedConvergencePaths()` 会去掉 `projects/product/` 前缀，导致 Product Project 下的 `skills/**` 与 canonical Workspace 根 `skills/**` 失去来源差异；同时 `requiresRuntimeSync` 只有布尔值，无法表达普通 Workspace 只需要 `render`、Buildr 自举才允许 `sync`。

`sync` 会更新 Builtin、Component、Workspace metadata 与 Agent runtime；`render` 只从 retained Workspace source 重建 Agent runtime。两者的授权和 Git effect 不同，必须在 Task Finish 交付前形成明确、可审计的 retained activation plan。

## Goals / Non-Goals

**Goals:**

- 由 retained Project/Service 声明决定 `sync-workspace` 资格，由 Task Contribution 的 Project 相对路径决定本次是否触发。
- Workspace 根 Rule、Skill 等 runtime source 变化只执行 `render-runtime`；其他变化使用 `none`。
- 在同一 run/result v2 和五阶段流程内记录 activation plan、执行与最终远端证据。
- 自举 sync 产生的受管 Git delta 使用独立 convergence commit，并保持 Candidate/carrier identity 不变。
- 所有未知、歧义或非受管 Git effect fail closed。

**Non-Goals:**

- 不提供任意 post-delivery shell、部署、发布、PR 或多仓交付框架。
- 不建立第二份 Candidate、Verification、Review、decision、Environment cleanup 或 Finish Receipt authority。
- 不让候选内容自行授予 sync 权限，不修改 SQLite Task Domain。
- 不改变 `buildr sync`、`buildr render` 自身的源资产/runtime 语义。

## Decisions

### 1. retained 声明授予 sync 资格，候选不能自行授权

在 Project 根新增 closed `task-finish.yml`：

```yaml
schemaVersion: buildr.task-finish-activation/v1
bindings:
  - id: buildr-self-bootstrap
    service: buildr
    mode: sync-workspace
    inputs:
      - services/buildr/package/manifest.yml
      - services/buildr/package/targets/workspace/**
```

Task Finish 从 retained Project baseline 读取声明，按 Task Record 的精确 Project/Service scope 解析唯一 binding，并把声明 digest 冻结进 run identity。候选 worktree 中新增或修改同一文件不会改变当前 run 的授权；它只对后续 Task 生效。

没有匹配 binding 时，`sync-workspace` 不可用。多条匹配、未知 mode、越出 Project root 的 input 或 Task scope 不匹配均在 preflight blocked。

选择该形式而不是扩展 `capabilities.yml`，因为后者是 Skill capability requirement/binding authority；也不把交付策略写入通用 Project/Service Domain，避免让稳定实体承担执行状态。

### 2. activation plan 使用类型化模式，不接受命令字符串

Task Finish 在preflight校验retained binding authority，在prepare取得冻结Task Contribution paths后按Task scope形成：

```json
{
  "mode": "none | render-runtime | sync-workspace",
  "agent": "codex",
  "bindingIdentity": null,
  "matchedPaths": [],
  "gitEffect": "forbidden | managed-only"
}
```

优先级固定：精确命中合法 `sync-workspace` binding 时选择 sync；否则 canonical Workspace 根 runtime source 变化选择 render；其余选择 none。Project 前缀不得在归属判断前被删除。

Task Finish 只把 mode 映射到产品内建动作：

- `none`：不执行 retained runtime mutation；
- `render-runtime`：`buildr render <agent> --target <workspace>`；
- `sync-workspace`：使用已经交付到 retained source 的 Product CLI 执行 `buildr sync <agent> --target <workspace>`。

不支持自定义 executable、args、环境变量或 shell。

### 3. 保持五阶段，activation 作为 deliver 的类型化子结果

继续使用 `preflight → prepare → verify → deliver → cleanup`，避免仅为拆分展示阶段迁移 run/result schema。`preflight`校验retained activation authority，`prepare`把声明digest与activation plan冻结进Delivery Carrier；`deliver`按顺序完成carrier push/readback、activation、Doctor和适用的convergence delivery；`cleanup`只在这些动作全部完成后交给Environment。

`remoteAfterRef` 继续表示 carrier 已真实到达远端，且必须等于 `carrierRef`。新增 `finalRemoteRef` 表示 activation 收敛后的最终远端：没有 convergence commit 时等于 carrier，有 convergence commit 时等于该 commit，并要求 carrier 是其祖先。

### 4. render 禁止 tracked delta，sync 只允许受管 delta

执行 activation 前记录 retained Git identity/status：

- `render-runtime` 后若出现任何新增 tracked/staged delta，返回 `task-finish.render-produced-tracked-delta`；不暂存、不提交。
- `sync-workspace` 后只接受 sync plan/受管资产分类能够证明 ownership 的 tracked delta；未知路径、activation 前已有变化或 scope 外 staged 内容返回 blocked。
- 没有 tracked delta 时只记录 Doctor 与 `finalRemoteRef = carrierRef`。
- 有受管 delta 时精确暂存这些 paths，形成独立 convergence commit，普通 push 后回读 `finalRemoteRef`；不得使用 `git add -A`、amend carrier 或重写共享历史。

convergence commit 是 Finish 派生的 retained activation evidence，不进入 Change checklist、Content Target、Candidate 或 Formal Verification。Result 同时保存 owned paths、commit ref、push/readback 与 ancestry。

### 5. 恢复保持同一 Finish run

carrier 已推送但 activation、Doctor、convergence commit/push 或 cleanup blocked 时，产品返回绑定当前 run、carrier 与 activation plan identity 的 exact resume token。若 convergence commit 已形成，Result 保存其 ref；恢复只允许在 retained HEAD、remote ref、owned tree 与记录一致时重试 push/readback。远端出现其他提交、受管 tree 漂移或无法证明 ancestry 时 fail closed，不自动 rebase、merge、force push或返回 Development。

## Risks / Trade-offs

- [风险] Project `task-finish.yml` 成为新的声明资产。→ 使用 closed schema、retained-only authority、Project/Service scope 校验与 Doctor/static verification，不建设通用 adapter registry。
- [风险] 自举 sync 的 Git delta 与用户 dirty 混合。→ activation 前后快照、精确 ownership、禁止已有 scope 外 staged/dirty，无法分离时 blocked。
- [风险] carrier push 后 convergence push 失败形成部分交付。→ Result 明确区分 `remoteAfterRef` 与 `finalRemoteRef`，持久记录 convergence ref 并用 exact token 恢复。
- [风险] 普通 Workspace runtime 目录被错误纳入 Git。→ render 后硬检查 tracked delta，不自动把 runtime 纳入任务提交。
- [取舍] 保留五阶段而不新增 `activate` phase。→ activation 在 `deliver` 中有独立 plan/result/operation identity，换取 run/result v2 与恢复模型的窄迁移。

## Migration Plan

1. 增加声明 parser、activation planner 与 Product Project retained binding。
2. 将现有 `requiresRuntimeSync` 调用替换为 plan 执行，同时保留 CLI/Local App install 的独立 impact 判断。
3. 增加 none/render/sync、未声明 sync、tracked delta、convergence push/readback 与恢复测试。
4. 更新 Task Finish Skill/package/current knowledge，完成 OpenSpec convergence 与 Candidate 验证。
5. 本 Change 首次交付仍按旧 retained adapter 完成；新 binding 从集成后的后续 Task 开始生效。

回滚时删除 Product Project binding并恢复旧执行器；已形成的 convergence commit 作为普通共享历史保留，不改写远端。

## Open Questions

无。
