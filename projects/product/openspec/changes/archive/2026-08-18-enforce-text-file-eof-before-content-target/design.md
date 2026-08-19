## Context

required Buildr Core 已把文本文件 EOF 约束限定为文件末尾，并明确正文段落空行不受影响，但没有用字节级正反例消除“一个结尾换行符”和“一个末尾空白行”的混淆。Task Development 当前在内容固定后直接调用 `observe`，而 Content Target observer 只计算 deliverable bytes；Git-backed observer 虽然包含 tracked 与未忽略的 untracked 文件，但不判断文本格式。

本次同时触达 Core Rule、Task Development Skill 和它们的静态契约测试。Core 继续拥有跨任务结果不变量，Skill 继续拥有进入 Content Target 前的具体检查动作。

## Goals / Non-Goals

**Goals:**

- 用 `...\n` 与 `...\n\n` 明确 Core 的 EOF 规则，不限制正文内部合理空行。
- 让 Agent 创建或重写文本文件时直接遵守 Core。
- 在 Task Development `observe` 前检查 Task 本次新增的全部文本文件；Git-backed scope 明确覆盖 tracked-added 和未忽略的 untracked 文件。
- 用静态契约测试锁定 Rule/Skill 职责和关键行为。

**Non-Goals:**

- 不批量清理未触达的存量 EOF 问题。
- 不让 Content Target observer 解析文本、修改文件或增加新的 Application blocker。
- 不新增 CLI、Receipt 字段、verification capability 或 runtime adapter 行为。

## Decisions

### 1. Core 只强化现有不变量，不复制执行流程

把现有一句规则改写为“最后一个非空字符后必须且只能保留一个换行符”，并直接给出 `...\n` 正确、`...\n\n` 错误。该 Rule 仍只描述所有 Agent 必须遵守的结果不变量；检查时点、文件 inventory 和失败处理留在 Task Development Skill。

备选方案是在 Core 中加入 Git 命令或 Content Target 步骤，但这会让 Rule 承担专业流程并形成第二权威，因此不采用。

### 2. Skill 检查 Task 新增文件，不把全仓扫描变成当前任务清理

Task Development 在内容固定、调用 `observe` 前检查本次新增的全部文本文件。Git-backed scope 至少合并 tracked-added 与未忽略的 untracked inventory；非 Git scope 按 Task 实际新增文件 inventory 检查。检查只确认 EOF 结果，不借机修改未触达存量文件。

备选方案是扫描全部 tracked 文本并要求零存量问题，但这会把历史债务混入当前 Content Target，扩大 Task scope，因此不采用。

### 3. 不在 Content Target observer 中加入文本格式校验

observer 继续只负责可移植的 deliverable byte identity。文本/二进制识别、换行风格和修复策略属于 Agent 工作动作；把它们放进 observer 会改变 Application 失败语义，并可能误伤二进制、生成文件或 Project 特定格式。

若检查发现问题，Agent 必须先修正新增文件，再形成 Content Target；已形成的旧 Content Target 或验证证据不能覆盖修正后的 bytes。

### 4. 静态契约测试验证资产正文

测试直接读取 package 中的 Core 与 Task Development Skill，断言 Core 包含正反例和正文空行边界，Skill 包含 `observe` 前检查、新增文件与 untracked 覆盖，并继续保持 observer 不承担格式修复。

## Risks / Trade-offs

- [风险] 检查仍由 Agent 执行，Application 不会自动拒绝违规文件。→ 通过 required Core、明确 Skill 时点和静态契约测试降低遗漏概率；Project 可继续使用自己的 lint/format verification。
- [风险] “新增文件”inventory 在非 Git carrier 中实现方式不同。→ Skill 描述结果和范围，不绑定单一命令；Git-backed scope 只明确最低覆盖集合。
- [风险] 存量违规文件仍存在。→ 明确非目标，只有它们在后续 Task 中被新建或重写时才按 Core 收敛。

## Migration Plan

随 Buildr package 正常交付 Core、Skill 与测试；workspace 通过既有 update/sync 生命周期获得新资产。无数据迁移或兼容转换。回滚时恢复这两个资产及对应测试即可。

## Open Questions

无。
