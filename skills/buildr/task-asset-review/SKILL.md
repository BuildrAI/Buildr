---
name: task-asset-review
description: 非简单 Workspace 任务开始探索、设计、诊断、实现或验证时，持续收集可能影响长期 Rule、Skill、capability Contract 或产品能力的轻量信号；用户要求复盘或沉淀，或 Task Finish 触发 finalize 时也使用。负责 observation、资格审查、人工决定和新任务交接，不保存完整轨迹。
---

# Task Asset Review Skill

本 Skill 是 `buildr.task-asset-review/v3` 的默认 provider。它从任务期间的公开、可观察节点维护轻量 observation，在任务结束时完成审查；没有合格候选时确定性 discard，存在候选时请求人工 accept/reject。它不读取隐藏推理，不保存完整轨迹，也不在原任务修改长期资产。

## 职责边界

- 本 Skill 拥有：是否创建 observation、信号筛选、持续更新、资格审查、候选分类、人工决定、去向交接和删除条件。
- `task-finish` 只触发 selected provider 的 finalize 并等待结果；不得汇总信号、执行资格门禁或判断最终沉淀什么。
- accept 只建立 identity 不同的新任务 handoff。后续必须重新进入 `task-triage`，原任务保持结束。
- provider optional 不可用或本地状态不可写时，报告降级；不得用最终总结伪造持久化 observation。
- 不为简单问答、翻译、单一稳定事实查询或没有 Workspace 资产含义的对话机械创建 observation。

## 共享位置与写入者

内部 helper 位于：

```text
scripts/observation.mjs
```

它从 `--workspace-root` 向上定位 `.buildr/workspace.yml`，再把 linked task worktree 解析回 identity 匹配的 canonical Workspace root：

```text
<canonical-workspace>/.buildr/asset-review/inbox/<observation-id>.md
```

这是 Workspace-local untracked inbox：根 `.gitignore` 必须包含 `/.buildr/asset-review/`；同一物理 Workspace 的主 checkout、task worktree 与嵌套路径使用同一位置，不同 clone 不通过用户级目录合并。每个任务使用独立 observation id；root Agent 是单一写者，`--owner` 必须稳定且与文件 owner 匹配。不要让 subagent 直接写 observation；由 root Agent 吸收其可验证报告。owner mismatch、canonical root identity 不一致或 legacy/target 内容冲突时必须停止，不得覆盖或选择任意文件。helper 对文件使用同目录临时文件加 rename 的原子替换。

首次访问时 helper 会检查 v2 的 `<Buildr user state>/asset-review/<workspace-id>/inbox/`。只迁移 Workspace identity 匹配且目标不存在或内容完全一致的 observation；冲突或损坏时保留两侧并返回精确诊断。不要手工移动或合并 legacy inbox 文件。

helper 是 Skill 内部资源，不是公共 Buildr CLI。不要为该生命周期启动 Hook、daemon、watcher、事件总线、数据库、全局索引、CAS 或复杂锁。

## 何时开始观察

进入非简单 Workspace 探索、设计、诊断、实现或验证任务后，先判断当前可见事实是否可能暴露长期资产差距。高价值信号包括：

- 用户纠正了长期边界、职责、scope、授权或领域语义；
- 初始假设被代码、文档、命令、测试或用户反馈推翻；
- 同类失败、重试、回退或无效重复暴露了稳定根因；
- 现有 Rule、Skill 或 capability Contract 只部分覆盖真实流程或资源；
- consumer/provider guarantees、effects、authorization 或 result evidence 需要变化；
- 任务暴露了产品行为、API、状态、数据模型或体验缺口；
- 并发 task environment 与共享本机状态的 owner、identity、隔离或 cleanup 发生可复现冲突；
- 某个可复用动作显著降低风险或成本。

不要把特定 CLI、Launcher、daemon、端口或 registry 当成固定检查清单。它们只有在体现更一般的共享状态、所有权或并发边界时才成为信号。

首次命中后执行：

```bash
node "<skill-root>/scripts/observation.mjs" start \
  --workspace-root "<workspace-root>" \
  --observation-id "<task-or-thread-stable-id>" \
  --owner "<root-agent-task-owner>" \
  --source '{"task":"...","thread":"...","worktree":"...","branch":"...","change":"...","commit":"...","project":"...","service":"..."}'
```

`source.task` 必须是稳定来源 task identity；其他来源字段只填实际存在的值。observation id 和 owner 使用稳定的字母、数字、点、下划线或连字符。

## 持续记录

任务出现新的高信息量节点时追加一条精炼 observation：

```bash
node "<skill-root>/scripts/observation.mjs" observe \
  --workspace-root "<workspace-root>" \
  --observation-id "<id>" \
  --owner "<owner>" \
  --message "<已验证事实及其潜在长期含义>" \
  --evidence "<用户决定、文件、命令、diff、测试或稳定引用>"
```

只保存会改变资产审查结论的精炼事实和证据引用。不得保存完整原始对话、完整工具日志、逐节点回放、模型隐藏推理、chain-of-thought 或内部 deliberation。一次性失误、偶发机器状态和已被现有资产完整覆盖的事实可以不记录。

## Finalize 与资格审查

显式任务结束、Task Finish finalize 或用户要求复盘时：

1. 读取当前 observation 和仍可访问的最终证据。
2. 重建简短执行轮廓，选择高信息量转折点；不逐条复述。
3. 核验候选目标源资产及其正文、manifest、模板、脚本、metadata、contract 和必要的真实产物。
4. 对覆盖度给出：完整覆盖、部分覆盖、存在冲突、尚无资产。
5. 只有同时具有明确证据、长期有效、可操作、可复用、scope 可确定且未被完整覆盖的发现才合格。
6. 将结论限制为四类：
   - `rule`：长期价值、边界、约束或禁止事项；
   - `skill`：可复用专业动作、流程、命令、检查和完成标准；
   - `capability-contract`：consumer/provider 的 guarantees、effects、authorization、decision points 或 result evidence；
   - `product-followup`：产品行为、API、数据模型、状态流或用户体验变化。
7. Command、Component 和普通 docs 不作为直接候选；只分析其背后的四类语义。

若任务从未产生 observation，返回 `no-observation`。若 observation 已由当前任务完整解决、被现有资产完整覆盖或不满足长期门槛，执行：

```bash
node "<skill-root>/scripts/observation.mjs" discard \
  --workspace-root "<workspace-root>" \
  --observation-id "<id>" \
  --owner "<owner>" \
  --review "<覆盖核验与无候选结论>"
```

该动作返回 `discarded` 并删除 observation，不请求用户接受空候选或同一项已完成修改。存在合格且未解决的候选时，finalize 必须同时提供结构化结论：

```bash
node "<skill-root>/scripts/observation.mjs" finalize \
  --workspace-root "<workspace-root>" \
  --observation-id "<id>" \
  --owner "<owner>" \
  --candidate-type "<rule|skill|capability-contract|product-followup>" \
  --coverage "<complete|partial|conflict|absent>" \
  --evidence-summary "<最小证据摘要>" \
  --review "<覆盖核验、目标 scope 和建议动作>"
```

成功后返回 `awaiting-human` 并请求明确 accept/reject。

## 人工决定

### Reject

用户明确认为无价值或拒绝候选时：

```bash
node "<skill-root>/scripts/observation.mjs" reject \
  --workspace-root "<workspace-root>" --observation-id "<id>" --owner "<owner>"
```

精确删除 observation；不创建 tombstone、Git 记录或“调查无修改”日志。

### Accept

用户接受候选时：

```bash
node "<skill-root>/scripts/observation.mjs" accept \
  --workspace-root "<workspace-root>" --observation-id "<id>" --owner "<owner>" \
  --candidate-type "<rule|skill|capability-contract|product-followup>" \
  --summary "<用户接受的明确范围>"
```

然后结束原任务并创建新的 `task-triage`。根据新任务自身语义决定 main checkout 或 task worktree；accept 不自动扩大写入授权。

## 新任务 Handoff 与长期记录

新任务确定位置后记录 destination：

```bash
node "<skill-root>/scripts/observation.mjs" handoff \
  --workspace-root "<workspace-root>" --observation-id "<id>" --owner "<owner>" \
  --destination '{"task":"<new-task-id>","sourceTask":"<source-task-id>","worktree":"...","branch":"...","change":"...","assetType":"...","assetId":"..."}'
```

`task` 必须与 observation 的 `source.task` 不同；Rule、Skill、capability Contract 必须包含匹配的 `assetType`/`assetId`，product follow-up 必须包含 OpenSpec change identity。任一字段缺失时保留 observation。

### Rule、Skill、capability Contract

只有新任务实际修改目标资产时，才从 `templates/asset-maintenance-record.md` 创建：

```text
asset-maintenance/
  rules/<rule-id>/records/<date>-<record-id>.md
  skills/<skill-id>/records/<date>-<record-id>.md
  capability-contracts/<contract-id>/records/<date>-<record-id>.md
```

维护记录包含 observation 来源、正式核验结论、实际修改、OpenSpec change、验证、commit 和集成去向，并与资产修改一起提交。不要创建 `asset.yml`；当前资产事实继续来自已有 manifest、frontmatter 和 contracts。

只有记录与资产变更成功集成后，才能执行：

```bash
node "<skill-root>/scripts/observation.mjs" complete ... \
  --outcome asset-integrated \
  --completion '{"task":"<new-task-id>","assetType":"<type>","assetId":"<id>","maintenanceRecord":"asset-maintenance/...md","commit":"<commit>","targetBranch":"<branch>","remoteRef":"<remote/ref>"}'
```

新任务暂停或失败时保留 observation。正式调查后不修改资产时不保留 tracked 记录，记录 destination 后以 `--outcome no-change` 删除 observation。

### Product follow-up

product follow-up 重新使用 `task-triage` 和 OpenSpec。新 proposal 或 design 必须吸收必要来源事实；不得再复制 `asset-maintenance` 历史。facts 安全进入 artifacts 后，以 `--outcome product-absorbed` 和包含新 task、change、artifact 路径的 `--completion` 删除 observation。

正式调查后不修改资产时，以 `--outcome no-change` 和包含新 task、核验结论、稳定证据引用的 `--completion` 删除 observation。helper 会按 outcome 校验类型化 evidence；缺少 maintenance record、Git 集成、OpenSpec artifact 或正式 no-change 结论时保留现场。

## 输出契约

显式复盘或 awaiting-human 时向用户输出：

1. 简短执行轮廓与关键转折；
2. 执行质量反馈及证据；
3. 候选类型、覆盖结论、目标 scope/asset 和建议动作；
4. observation identity 与共享 inbox 状态；
5. 明确的 accept/reject 请求。

Task Finish 调用时返回：

- `no-observation`：没有 observation，继续收尾；
- `discarded`：provider 已证明没有合格且未解决候选并删除 observation，继续收尾；
- `awaiting-human`：必须在 cleanup 前等待决定；
- degradation：provider/helper 不可用，报告原因但不伪造结果。

不要把“收尾”解释为长期资产写入授权，也不要在原任务自动实施接受的建议。当前任务已经完成同一项修改时应 discard observation，不得倒序 accept 并把原任务伪装成新 handoff。
