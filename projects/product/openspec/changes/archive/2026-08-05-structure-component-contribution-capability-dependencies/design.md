## Context

当前 Component definition 的 `contributions` 只允许 `skillFragments`。runtime 在 `resolveSkills()` 中先从 `skills/manifest.yml` 读取 `requires`，再把已安装 Component fragment 附加到目标 Skill；capability graph 因而看不到 fragment 新增的稳定停止条件。OpenSpec 的 dependency metadata 目前直接维护在 package builtin descriptors 中，与 Component fragment 分属两个 authority。

同时，OpenSpec Component 仍把旧 proposal baseline fragment 接到 `task-triage`，而 apply、sync、archive 是可直接命中的独立入口。新的产品契约已经让 `buildr openspec converge` 独占确定性 canonical sync/archive，旧接线需要一起移除。

## Goals / Non-Goals

**Goals:**

- 让 Component definition 成为其 fragments 及其引入 capability dependencies 的单一 authority。
- 让 runtime 和 Doctor 只从结构化字段确定性组合依赖，不解析 Markdown。
- 让 Component install/update/uninstall 自然地同时增删 fragment 与 dependency contribution。
- 让 OpenSpec propose/apply/update 的 required/optional 依赖符合真实停止条件。
- 让 apply、sync、archive 与单一 `converge` 事务保持一致。

**Non-Goals:**

- 不创建新的 capability contract、dispatcher 或任务状态机。
- 不让 Doctor 从自然语言推断依赖。
- 不让 Component 执行 provider action、产品 CLI 或 runtime hook。
- 不把 Task、Environment、Development 依赖机械附加到只负责拒绝独立操作的 sync/archive consumers。
- 本 Change 不把 `converge` 扩展为 Task lifecycle writer；Task/Environment/Development 事实仍由入口 Skills 与各自 Application 维护。

## Decisions

### 1. Component v1 增加 `contributions.skillDependencies`

采用结构化对象：

```yaml
contributions:
  skillFragments:
    - openspec-propose@prepend=components/buildr/openspec/contributions/openspec-propose-sidebar.md
  skillDependencies:
    - skill: openspec-propose
      capability: buildr.task-record
      version: 1
      mode: required
```

每项只允许 `skill`、`capability`、`version`、`mode`；identity 和 mode 复用 Skill manifest 的既有校验。dependency target 必须同时是该 Component 至少一个 `skillFragments` declaration 的目标，避免把 Component 变成任意 graph patch。

未采用紧凑字符串，是因为 capability、version 和 mode 是独立诊断字段，对象更利于 schema 演进和错误定位。未把 dependency 写入 fragment frontmatter，是为了继续保持 Markdown 只承载行为说明。

### 2. runtime 解析时合并，不改写目标 Skill manifest

Component parser 一次返回 fragments 与 dependency contributions。`resolveSkills()` 只对已解析到的目标 Skill 应用两者；目标 Skill disabled/uninstalled/当前 scope 不存在时一起跳过。

base Skill `requires` 与所有 enabled Component dependency contributions 按 `capability@version` 合并：相同 mode 去重；required 与 optional 同时出现时 effective mode 为 required。运行时保留 contribution provenance 供诊断和测试，但 capability graph 继续消费标准 `requires` shape。

该方式让 Component registry/definition 本身成为生命周期开关：安装、更新、卸载不需要额外 patch `skills/manifest.yml`，也不会留下依赖残片。

### 3. package builtin descriptor 不再重复声明 Component-owned dependencies

OpenSpec Component members 的 dependency authority 移入 `component.yml`。package install 仍用 builtin descriptor 创建 Skill registry entry、description 和 runtime metadata，但不再复制 Component-owned `requires`。Package validation 必须核对 dependency target 是 declared builtin、字段合法，并验证 source/package/runtime graph 一致。

### 4. OpenSpec consumer 依赖按停止条件建模

- propose：Task Record、Task Environment、Task Development、current knowledge required。
- apply：Task Record、Task Environment、Task Development、current knowledge required。
- update：current knowledge required；Task Environment、Task Development optional。命中产生执行效果的分支时正文要求 provider ready 并转入 apply。
- explore：terminology optional。
- sync/archive：不声明 Task lifecycle dependencies；它们只拒绝独立写入并转交 `converge`。

Environment required 只表示必须取得 matching ready execution context；provider 可以选择共享执行根，不等于强制 Git worktree。

### 5. apply 门禁与 converge authority

删除 `task-triage#change-ready` 和旧 baseline 操作。apply prepend 在任何实现编辑前要求：apply-required artifacts complete、`openspec validate <change> --strict`、`buildr openspec check <change> --stage proposal` 通过；delta Requirement identity 改变后必须重新检查。

sync/archive prepend 明确拒绝上游 agent-driven canonical 写入、直接移动或用户确认绕过，并转用 `buildr openspec converge`。knowledge reconcile/inspect 仍是 apply 与 Development 在调用 converge 前的语义义务；本 Change 不让低层 converge CLI伪装成 Task/Development provider，也不通过 sync/archive manifest 间接保护直接 CLI 调用。

## Risks / Trade-offs

- [多个 Component 对同一 dependency 声明不同 mode] → 使用 required 优先的确定性合并，并在 runtime evidence 中保留来源；不依赖安装顺序。
- [旧 package descriptor 与新 Component 同时声明依赖] → 合并可保持迁移兼容，但本次同步删除 OpenSpec 的重复 descriptor 声明，并用静态测试防止回归。
- [Component definition 合法但 capability contract/provider 缺失] → Component integrity 可以通过，capability graph 必须把目标 consumer 报告为 blocked/degraded；不得在 Component validator 猜 provider。
- [直接调用 `converge` 绕过 Agent lifecycle] → 明确区分产品确定性 OpenSpec 事务与 Task lifecycle；若未来要求 CLI 强制绑定 Task/knowledge evidence，应另行设计类型化产品输入和 Application 检查，不能依赖 Skill graph。
- [移除旧 baseline wording 影响历史 Change] → 历史 sidecar 继续由 converge compatibility reader 只读处理；正常路径不再创建或 adopt baseline。

## Migration Plan

1. 增加兼容旧 Component 的新可选字段、parser、validator 和 runtime merge。
2. 将 OpenSpec dependencies 移入 Component definition，并增加 sync/archive fragments、移除 triage fragment。
3. 更新 package/static/runtime tests，证明 install/update/uninstall 同时改变 fragment 与 graph。
4. 同步 canonical specs、package workspace targets 和自举 workspace；Doctor 必须显示新 consumer graph。

回滚时移除 `skillDependencies` 和新 fragments，恢复 package descriptor dependencies；旧 Component 因新字段可选而不需要数据迁移。

## Open Questions

无。

## Delivery Adaptation

收尾期间目标分支并行前进，但新 Delivery Baseline 已通过祖先提交完整包含本 Change 的 Task Contribution 及 retained Workspace 自举同步。本记录仅证明该包含关系下的交付适配；实现、canonical specs、Candidate identity 与 Formal Verification evidence 均未改变。
