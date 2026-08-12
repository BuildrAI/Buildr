## Context

Buildr 把 Skill 源资产渲染到 adapter 声明的 workspace 或 user Skills root，并用 `buildr.skill-projection/v2` 回执记录 asset identity、source identity、destination、完整文件 inventory 与 digest。当前回执路径从 Agent runtime root 派生，例如 Codex workspace 为 `.agents/buildr/skill-projection-receipts/codex/`；Buildr 的 inventory、render plan、Doctor、Component lifecycle 和 builtin lifecycle 都直接依赖该路径。

回执本身不被 Agent 消费。它是 Buildr 用来判断所有权、更新权和删除权的控制状态，继续放在 `.agents/`、`.claude/` 等 runtime 根下会混淆 Agent runtime 与 Buildr 私有状态。迁移还必须同时覆盖 workspace/user destination、七个 adapter、产品入口 Skill、workspace Skills、Component 清理和未指定 Agent 的 Doctor runtime 发现。

## Goals / Non-Goals

**Goals:**

- 让路径直接表达 Buildr、Agent runtime、destination、Skill projection 与 ownership receipt 五层语义。
- 把 workspace 回执统一收敛到 Workspace 的 `.buildr/`，把 user 回执收敛到用户级 `.buildr/`。
- 保持 runtime Skill 目录、回执 schema、冲突分类、文件完整性和清理语义不变。
- 对有效旧回执执行一次性、可回滚、无长期双 authority 的迁移。
- 避免 user home 本身也是 Workspace 时 workspace/user 回执互相覆盖。

**Non-Goals:**

- 不移动 `.agents/skills/`、`.claude/skills/` 等 Agent 实际消费的 Skill。
- 不迁移 `skill-install-plans`；它是 Agent 可读 runtime 内容。
- 不顺带重构 `skill-satisfaction`、Rules bridge 或其他 runtime metadata。
- 不新增数据库、ownership transfer、adopt 命令或第二套回执 schema。

## Decisions

### 1. 使用 destination-aware 的 Buildr 控制状态根

Canonical 路径为：

```text
workspace: <workspace>/.buildr/agent-runtime/workspace/<adapter>/skill-projection-ownership-receipts/<runtime-path>.json
user:      <user-home>/.buildr/agent-runtime/user/<adapter>/skill-projection-ownership-receipts/<runtime-path>.json
```

`.buildr` 明确所有者，`agent-runtime` 表明所治理对象，`workspace|user` 明确授权边界，adapter 名称明确目标 Agent，`skill-projection-ownership-receipts` 明确数据用途。destination 必须进入路径；否则当 `<workspace> == <user-home>` 时两类回执会争用同一文件。

替代方案是 `.buildr/runtime/<adapter>/receipts`。该名称较短，但无法直接说明 runtime 属于 Agent、receipt 属于 Skill projection ownership，也不能天然避免 destination 冲突，因此拒绝。

### 2. 回执定位与 runtime Skill 定位分离

新增统一 resolver，以 `workspaceRoot`、`userHome`、`destination`、`adapterId` 和 `runtimePath` 计算 canonical receipt；runtime Skill target 仍由 adapter 的 Skills root 计算。inventory、render plan、Doctor 和 lifecycle consumers 只能调用 resolver，不再自行拼接 runtime root 下的 `buildr/skill-projection-receipts`。

回执继续使用 `buildr.skill-projection/v2`。路径变化不改变 receipt 内容语义，避免无意义 schema 升级。

### 3. 旧路径只作为受控迁移输入

Legacy 路径继续由独立 helper 精确解析：

```text
<destination-runtime-root>/buildr/skill-projection-receipts/<adapter>/<runtime-path>.json
```

每个候选在 mutation 前按以下矩阵处理：

- 只有 canonical 回执：正常使用。
- 只有 legacy 回执：解析 schema/adapter/runtime path，核对其 inventory 与当前 runtime 文件；全部成立时把“写 canonical + 删除 legacy”加入同一 runtime transaction。
- canonical 与 legacy 都存在且内容等价：保留 canonical，并在同一 transaction 删除 legacy。
- 两者 identity、digest 或 inventory 不一致：报告 ownership conflict，整次 mutation 零写入。
- legacy 无效或 runtime 文件无法证明：保留现场并阻塞，不把它降级成可自动接管的 external Skill。

删除 legacy 文件后只裁剪已空的旧回执目录，不递归删除其他 `.agents/buildr/` 内容。新版本不在正常读取路径长期合并两份 authority；legacy helper 只产生迁移或冲突结果。

### 4. Doctor 读新证据，并显式披露 legacy 状态

未指定 Agent 的 Doctor 从 canonical receipt roots 发现 present adapters。若只发现 legacy receipt，仍识别对应 adapter，但报告需要由 `sync`、`skills render` 或 `skill install` 完成迁移；Doctor 本身保持只读。显式 adapter Doctor 同时验证 canonical 回执与 legacy 冲突，不把 legacy 存在误报为健康 canonical 状态。

### 5. Workspace 本地状态统一忽略

初始化、sync 与 package baseline 幂等维护 `/.buildr/agent-runtime/`。不忽略整个 `.buildr/`，`.buildr/workspace.yml` 和其他 portable Buildr 源资产继续按现有规则管理。用户级 `<user-home>/.buildr/agent-runtime/user/` 不属于 Workspace Git scope。

## Risks / Trade-offs

- [旧 CLI 不认识 canonical 回执，会把现有 Skill 视为 external] → 这是 fail-closed 而非破坏用户文件；发布说明标记路径迁移，升级后不建议用旧 CLI 管理同一 runtime。
- [canonical 与 legacy 同时存在时误删有效证据] → 只有内容等价或完整迁移验证通过才删除 legacy；任何差异整次零写入。
- [多个 consumers 自行拼接路径导致遗漏] → 收敛为一个 canonical resolver 和一个 legacy resolver，并用全仓搜索及 adapter parity tests 锁定。
- [workspace 正好是 user home] → 路径中固定包含 `workspace|user`，从文件系统层面隔离。
- [迁移失败留下半完成状态] → canonical write 与 legacy removal 进入同一受管 runtime transaction，失败恢复到操作前状态。

## Migration Plan

1. 增加 canonical/legacy receipt resolver 和 destination-aware tests，不切换消费者。
2. 让 inventory、render plan、runtime diagnostics、Component/builtin lifecycle 统一读取迁移 observation，并在 mutation plan 中原子写新删旧。
3. 更新 package baseline 与 sync Git ignore，再更新 adapter parity、integration、Doctor 和 Component tests。
4. 在临时 Workspace 验证 workspace/user、home-as-workspace、legacy-only、dual-equivalent、dual-conflict 和重复 render。
5. 在自举 Workspace 运行候选 sync，确认 `.buildr/agent-runtime/workspace/codex/...` 已生成、旧回执已清退且 Doctor healthy。

回滚代码时必须先保留 canonical 回执；旧 CLI 不自动反向迁移。若发布前回滚，在同一候选实现中提供反向受管 transaction，不能手工复制或双写。

## Open Questions

无。`skill-satisfaction` 的位置另行审计，不扩大本 Change。
