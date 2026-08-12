## Context

Task Development 当前通过 `buildr.git-content-observer/v1` 对每个 Environment scope 的完整文件 inventory 求 identity。该 identity 同时混合了任务贡献和交付基线，因此 Git rebase 即使只引入无关基线提交，也会触发 `content-target-changed`，并清空 Candidate 与后续 gates。Task Finish 已有 `buildr.git-task-contribution/v1`，可以用原任务基线到 source snapshot 的 canonical raw Git delta 区分任务贡献和交付基线，但 Development 尚未消费这一事实。

## Goals / Non-Goals

**Goals:**

- Git-backed Task Development 的 Content Target 以任务贡献 identity 表达任务内容，而不是把交付基线 bytes 混入 identity。
- rebase 前后贡献 identity 相同且 Agent 已完成语义核对时，`inspect` 与 `observe` 保持 Candidate、Verification、Completion Review、decision 和 handoff current。
- 贡献改变、同路径 before/after blob 改变、冲突或 Git identity 无法取得时 fail closed。
- 复用 Finish 已采用的 canonical raw Git delta 算法，避免两个贡献 authority。

**Non-Goals:**

- 不让 Buildr 根据路径不重叠或 clean apply判断语义安全。
- 不自动执行 rebase、冲突解决、Verification、Review 或 Candidate freeze。
- 不新增状态机、历史表、CAS、额外生命周期页面或第二套 Candidate authority。
- 不改变非 Git Environment 的完整内容观察语义。

## Decisions

### 1. 将 Git 贡献观察下沉为共享基础设施

把现有 Task Finish Git contribution 实现移动到 infrastructure，并保留原模块的兼容 re-export。Task Development 内容观察器与 Task Finish 使用同一 `buildr.git-task-contribution/v1` delta identity；不复制算法或建立第二个 receipt。

备选方案是在 Development 内重写一次 delta 计算。该方案会产生双 authority，拒绝采用。

### 2. Git-backed Content Target component 使用贡献 identity

Task Environment 已提供每个 Git repository 的 source checkout 与 retained source repository。内容观察器以 retained repository 当前 HEAD 作为 Delivery Baseline，求 source HEAD 与该 baseline 的 merge-base，再用临时 index 捕获含未提交内容的精确 source snapshot。Content Target component 的 identity 只绑定 canonical Task Contribution；selector、kind、sourcePath 和 observer 继续进入 Content Target 总 identity。

对嵌套 Project/Service scope，使用包含该 scope 的真实 Git repository contribution identity，不按目录重写另一套贡献定义。非 Git 或无法匹配可信 repository evidence 时保持原完整内容 observer，不假装可复用。

### 3. 适用性继续由现有 Receipt/current gates 推导

不增加新的生命周期状态。贡献 identity 未变时，现有 `inputsCurrent` 自然保持 true；`observe` 不清空 Candidate/gates/decision，`freeze` 不递增 generation。贡献 identity 变化或观察失败时沿用现有 stale/fail-closed 路径。

Agent 在执行 rebase 后必须先审视基线变化是否存在语义冲突，再调用只读 Development inspect/observe。Buildr 的 identity 只证明 Git delta 等价，不代表语义安全。

### 4. 测试必须贯穿真实 Development

新增真实 Git fixture，形成 Candidate、Verification、Completion Review 与 handoff 后推进基线并 rebase Task checkout，再调用真实 Development Application：

- 无关基线前进保持全部 gates/handoff current，freeze generation 不增加，随后 Finish 在最新基线构建 carrier；
- 任务贡献变化、同路径基线变化或无法证明时派生 stale/blocked；
- Finish 内 formal Verification 始终为 0。

现有仅使用固定 `handoff: current` stub 的测试保留为 Finish 单元边界，但不再作为 Development 适用性证明。

## Risks / Trade-offs

- [风险] 贡献 identity 相同不等于语义安全。→ 由 Skill 明确要求 Agent/Project 在 rebase 后完成语义核对；Buildr 只输出 Git identity 事实。
- [风险] retained checkout HEAD 不是预期交付分支。→ 只使用 Task Environment 已证明的 source repository；缺少可信 Git evidence 时不进入贡献复用路径。
- [风险] 移动共享 Git 模块造成引用漂移。→ 保留原路径 re-export，并用 architecture、managed mutation 和 Task Finish 回归覆盖。
- [风险] 非 Git scope 无法区分基线。→ 保持既有完整内容 identity，宁可 stale，不伪造等价。
