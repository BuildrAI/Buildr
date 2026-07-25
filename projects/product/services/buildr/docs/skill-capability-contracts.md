# Skill Capability Contracts

Capability contract 用来描述多个 Skills 之间稳定、可替换的行为边界。它类似代码里的 interface：consumer 依赖 capability，Skill 通过 `provides` 成为 provider，manifest binding 选择当前实现。它更接近 interface + dependency injection，而不是 Skill-to-Skill 方法调用：consumer 不调用某个固定 Skill，Agent 根据当前 scope 和 binding 解析 provider，再结合 contract、provider playbook 和任务上下文完成真实协作。Contract 不规定命令、工具或内部步骤；这些仍由 provider 和组织习惯决定。

面向用户的完整机制称为“Agent 工作能力适配（Agent-managed Capability Adaptation）”。用户只需要表达“采用内部流程”“改成 feature 分支模式”“替换默认工作方式”等目标；Agent 使用 `capability-adaptation` 分析相关 Skill 和依赖、开发候选资产、验证 consumers，并在成功后完成 binding、sync 和 doctor。下面的 manifest 与 CLI 是 Agent 使用的底层实现原语，不是普通用户必须学习的操作步骤。

普通独立 Skill 不需要声明 capability。只有当一项动作确实需要被其他 Skill 组合、替换或诊断时，才应增加 contract。

Agent 判断的不是用户是否说出 capability 名字，而是目标行为是否满足以下任一条件：另一工作流无法在缺少其稳定保证或结果证据时安全继续、需要允许实现替换、修改或卸载需要跨 Skill 影响诊断。Agent 在执行期间同时读取多个 Skills，不足以单独构成 capability dependency。触达已有 contract 时优先在 `Allowed Variations` 内调整 provider；只有产生新的稳定协作边界时才创建 contract。

用户意图首先由 Agent runtime 的原生 Skill 发现机制处理：runtime 暴露 Skill description，Agent 根据用户目标选择并加载入口 Skill。Buildr CLI 不拦截 prompt，也不存在一个始终先于所有 Skills 运行的全局 capability dispatcher。入口 Skill 加载后，才读取 Buildr 注入的 binding evidence 解析其 capability dependencies。

产品入口 Buildr Skill 只在自身因 Buildr 管理意图被 Agent 命中后充当内部能力路由者，例如更新 workspace、调整工作方式或诊断 Buildr 能力。它不是“收尾”等所有专业意图的统一前置入口。`task-finish` 是编排型 consumer，其 manifest `requires` 参与整体 `ready`、`blocked` 或 `degraded` 计算。它分别依赖任务验证、Git integration 和 worktree lifecycle 的稳定结果证据，而不复制三个 providers 的政策；单项 capability 不可用不会阻塞 Buildr 的 init、doctor 或 Project 管理等无关能力。

## 五种相关但不同的关系

| 关系 | 事实来源 | 表达什么 | 不表达什么 |
|---|---|---|---|
| Agent Skill 意图发现 | Agent runtime 暴露的 Skill description、用户目标和任务上下文 | 本次首先加载哪个入口 Skill | 不解析 capability provider，也不形成 manifest dependency edge |
| 能力目录 | manifest `contracts`、`provides`、`bindings` | 当前有哪些可声明、选择和替换的能力 | 不要求每项能力都存在 manifest consumer |
| Consumer dependency graph | installed Skills 的 `requires` | 哪些 consumer 缺少保证时 blocked，哪些可以 degraded | 不包含 description 命中或 Agent 临时读取多个 Skills |
| 产品入口内部路由 | 已加载的 Buildr Skill、routing evidence、当前 doctor graph | Buildr 管理意图在产品入口内部应交给哪项 selected capability | 不在所有用户意图之前运行，也不把产品入口登记成依赖全部 capabilities 的 consumer |
| Agent 执行协作 | contract、provider playbook、授权和任务上下文 | Agent 实际如何使用工具、判断结果并继续或停止 | 不等价于确定性函数调用，也不由结构 `ready` 证明成功 |

因此，一个 capability 可以已经登记、提供和绑定，只作为顶层可替换入口存在，而不出现在 consumer dependency graph 中。但 binding 只选择 provider，不会让 provider 自动被 Agent 命中：顶层 provider 还必须通过自己的 Skill description，或通过一个已经被加载的明确产品入口保持可发现。只有 manifest `requires` 才形成静态 consumer dependency edge。

## 完整实例：`buildr.git-task-integration/v1`

这项能力负责“将已验证任务安全集成到目标分支”。它的完整结构如下：

```text
用户说“收尾”
  ↓ Agent runtime 根据 Skill description 发现入口
加载 task-finish
  ↓ 读取 task-finish runtime 中的 Buildr Capability Bindings
required dependency = buildr.git-task-integration/v1
  ↓ workspace binding
selected provider = git-ops
  ↓ Agent 读取 contract + git-ops playbook + 当前 Git 状态
提交、集成、推送或在需要语义决策时停止
  ↓ result evidence
commit、目标 ref、输入/最终 content identity、tree 等价性信号、远端结果、treeChanged
```

### 1. Contract

`skills/contracts/buildr/git-task-integration/v1.md` 固定的是跨 provider 不可丢失的行为信封：

- consumer 必须提供任务范围、目标分支、远端、输入 candidate identity、验证证据和授权范围；
- provider 必须保留无关改动、比较 Git 操作前后的 candidate content identity，并在语义冲突时停止；
- force push、改写共享历史和删除远端分支需要额外授权；
- 结果必须包含 commit、目标 ref、远端状态、输入/最终 content identity、tree 等价性信号和 `treeChanged`；
- merge、rebase、fast-forward、PR 和分支策略属于 `Allowed Variations`。

Git provider 返回的 tree 等价性只是操作效果，不是最终验证结论。`task-worktree` 只提供 canonical checkout、clean/dirty 状态和 lifecycle transition；`git-task-integration` provider 只提供 refs 与前后 content identity；`task-verification` provider 或其 consumer 才根据当前 candidate identity 决定 Candidate evidence 是否有效、复用或重跑。三者通过最小 evidence 交接，不互相复制 policy，也不要求固定 provider identity。

### 2. Manifest 注册、provider、consumer 与 binding

```yaml
contracts:
  - id: buildr.git-task-integration
    version: 1
    path: contracts/buildr/git-task-integration/v1.md

skills:
  - id: git-ops
    provides:
      - capability: buildr.git-task-integration
        version: 1

  - id: task-finish
    requires:
      - capability: buildr.git-task-integration
        version: 1
        mode: required

bindings:
  - capability: buildr.git-task-integration
    version: 1
    provider: git-ops
```

这里 `task-finish` 没有声明“调用 `git-ops`”或“调用 `task-verification`”。它只声明：缺少 `buildr.task-verification/v2` 返回的 `requiredAssurance`、匹配 identity、状态与真实耗时证据，或缺少 `buildr.git-task-integration/v1` 的最低保证和结果证据时，完整收尾不能安全继续。

任务验证单独建模，是因为它既可以在 task environment 中执行，也可以在当前分支、无 Git 项目或非代码候选中执行。`buildr.task-worktree-lifecycle/v2` 保护单仓或多仓 repository plan、checkout placement、execution roots、retention 与 cleanup；`buildr.task-verification/v2` 保护可选 Project 测试声明与 legacy policy 解析、affected/candidate 正式保证、完整 repository candidate identity、wall-clock、用户报告和落盘 evidence 生命周期。Project `verification.yml` 是测试能力事实，不是 Skill provider/binding，因此不进入 `capabilities.yml`。没有声明时 contract 保证零配置 legacy 行为；声明存在时 provider 按成熟度、阶段、环境、副作用和授权返回能力选择证据。验证 provider 负责 transient evidence 的安全删除实现，Task Finish 只决定 consumer 已使用完毕的时点；worktree provider 不清理与 checkout 无关的证据。两者互不要求固定 provider identity。

顶层验证 provider 不是只有用户主动说“验证”才加载。用户直接要求测试、耗时报告、初始化/更新测试声明或推进测试能力成熟度时由 description 发现；实现任务到达验证节点、Agent 准备声称完成时由适用 Rule 的完成边界触发；Task Finish 则在“收尾”入口加载后通过 required binding 调用 selected provider。binding 选择 provider，但不会替代这些意图发现和完成边界。

### 3. Resolver 与 readiness

Buildr 从当前 scope 向 workspace root 查找最近的显式 binding，校验 contract version、provider `provides`、runtime 可用性和 provider 自身的 required dependencies。当前 binding 选择 `git-ops`，所以 `task-finish` 的这条 dependency 为 `ready`；binding 缺失、歧义、版本不兼容或 provider blocked 时，`task-finish` 相应变为 `blocked`。

### 4. Runtime evidence

render/sync 会在 `task-finish` 的 runtime 派生版本中注入受管 binding block，记录 contract path/digest、dependency mode、selected provider、provider runtime path、scope、readiness、reason 和 provenance。源 `task-finish/SKILL.md` 与 `git-ops/SKILL.md` 不会被写入这段接线信息。

### 5. Agent 实际执行

当用户说“收尾”时，Agent runtime 先根据 description 命中并加载 `task-finish`；这一步不经过产品入口 Buildr Skill。`task-finish` 随后读取受管 binding block，执行相应阶段前再读取已解析 contract 和 selected provider。Agent 根据当前仓库、授权和 candidate identity 执行专业动作，并把各 provider 返回的最小 evidence 交还给收尾编排；Git provider 不执行 Candidate 验证，worktree provider 不监控普通内容编辑，验证 provider/consumer 决定继续、复用、重验或停止。这个过程是 Agent 调解的工作协作，不是 `task-finish.gitOps()` 一类方法调用。

对 `buildr.task-verification/v2`，调用 provider 还必须携带 operation、任务/change、发布意图、风险信号、变更路径、候选 identity 与已有 evidence。`inspect` 只核对已有 evidence，`execute` 才启动验证，`cleanup` 只处理已消费 evidence。provider 返回 `requiredAssurance: affected | candidate`；Task Finish 只核对 evidence 是否满足该保证。实现内容变化时重新执行同一 required assurance，不机械升级为 Candidate。`same-content` 或可归因 `closeout-metadata-only` transition 使用 `inspect`，两个 executor 调用计数均为 0。

对 optional `buildr.task-asset-review/v3`，provider 从非简单 Workspace 任务期间开始维护 canonical Workspace 的 `.buildr/asset-review/inbox/` observation，并独占信号筛选、资格审查、人工决定和新任务交接政策。该运行期目录必须由根 `.gitignore` 排除；长期维护历史仍只随真实资产修改提交到 `asset-maintenance/`。Task Finish consumer 只传递 Workspace/task identity 与最终证据引用并触发 finalize；它不复制 provider 的门禁。v3 允许写当前 owner 的本地 observation、迁移匹配的 v2 用户级草稿，并要求独立任务 handoff 与类型化完成证据，因此不能用 v1/v2 contract 替代。

### 6. 用户替换实现

若组织创建 `internal-git` 并声明提供同一 contract，安装它不会改变当前流程。Agent 先验证 `internal-git` 与 `task-finish` 的组合，再把 binding 显式切换为 `internal-git`。只要 contract guarantees 和 result evidence 保持兼容，内部实现可以使用 feature + PR、merge queue 或其他组织策略，`task-finish` 无需修改。

这里替换的是 `task-finish` 加载后的依赖 provider，所以不需要修改“收尾”意图的入口 description。如果替换的是 `buildr.task-finish/v1` 自身，binding ready 仍不代表用户说“收尾”时一定能命中新 provider；能力适配还必须确认新 provider 已投射到当前 runtime、description 覆盖“收尾”意图，并处理旧 `task-finish` 或其他入口造成的触发歧义。

这里有两个不同的版本概念：

- Workspace manifest 会从 v1/v2 兼容读取并在受管 mutation 中升级为 `buildr.skills/v3`，保存 workspace/asset/source identity。legacy Project manifest 必须通过 `skills migrate-project-assets --check/--apply` 显式事务迁移；失败时保留原目录与完整 recovery evidence。
- contract 路径中的 `v1.md` 和 frontmatter 中的 `version: 1` 表示 capability contract 的第 1 个主版本，不随 manifest schema 升级；只有 contract 出现不兼容语义变化时才提升主版本。

## Contract 文档

Contract Markdown 使用最小 frontmatter：

```markdown
---
schemaVersion: buildr.capability-contract/v1
id: example.git-task-integration
version: 1
---

# Git 任务集成

## Purpose
...

## Consumer Obligations
...

## Minimum Guarantees
...

## Effects and Authorization
...

## Result Evidence
...

## Decision Points
...

## Allowed Variations
...
```

`Purpose`、`Consumer Obligations`、`Minimum Guarantees`、`Effects and Authorization`、`Result Evidence`、`Decision Points`、`Allowed Variations` 是供解析器识别的固定字段标识，不表示正文必须使用英文；章节正文和标题应使用 workspace 的主要语言。`Examples` 可选且不具规范性。Manifest 注册的 id/version 必须与 frontmatter 完全一致。

Contract 只写 consumer 安全组合所必需的行为信封：前置披露、授权类别、允许的副作用、必须停止的决策点和结果证据。命令、算法、默认 merge/rebase policy、组织分支规则及案例应留在 provider 或 `Examples`，避免把 interface 变成复制的操作手册。

## Workspace Manifest v3

```yaml
schemaVersion: buildr.skills/v3
workspaceId: 7cf5b7af-38cc-5cb4-86f7-6a45a45e9012
contracts:
  - id: example.git-task-integration
    version: 1
    path: contracts/example/git-task-integration/v1.md
bindings:
  - capability: example.git-task-integration
    version: 1
    provider: internal-git
skills:
  - id: internal-git
    assetIdentity: workspace:7cf5b7af-38cc-5cb4-86f7-6a45a45e9012:skill:internal-git
    sourceIdentity: workspace:7cf5b7af-38cc-5cb4-86f7-6a45a45e9012:internal-git
    path: internal-git
    provides:
      - capability: example.git-task-integration
        version: 1
  - id: task-finish
    path: task-finish
    requires:
      - capability: example.git-task-integration
        version: 1
        mode: required
```

Skill entry 的 `required` 与 `requires[].mode` 是两件事：

- `required` 控制该 builtin 资产能否卸载。
- `requires[].mode: required` 表示依赖不可用时 consumer 必须 blocked。
- `requires[].mode: optional` 表示 consumer 保持可用但 degraded，并由正文说明降级行为。

Workspace manifest 保存全部 provider、consumer、contracts 与默认 binding；Project `capabilities.yml` 只保存业务 context 的 requirements、bindings 和 workspace Skill applicability 引用。解析顺序是明确 Project context、workspace default、唯一兼容 provider。跨 Project 对同一 capability 选择不同 provider 时报告 `cross_project_binding_ambiguous`，不得按当前目录猜测。

## 声明与替换

Provider 和 consumer 声明可通过重复参数写入：

```bash
buildr skills add internal-git --source ./internal-git --target <workspace> \
  --provides example.git-task-integration@1

buildr skills add task-finish --source ./task-finish --target <workspace> --replace \
  --requires example.git-task-integration@1:required
```

替换 provider 必须使用 capability binding，而不是冒用 builtin Skill id：

```bash
buildr skills bind example.git-task-integration@1 \
  --provider internal-git --scope . --target <workspace>

buildr skills unbind example.git-task-integration@1 \
  --scope . --target <workspace>
```

`skills add --replace` 只替换同一 Skill 资产条目，不表示 provider substitution。会移除或改绑当前 selected provider 的 mutation 会先披露受影响的 required/optional consumers，并在写入后由 doctor 收敛结构状态。

## Conformance 的三个层次

Buildr 刻意不把 Agent contract 过度约束成调用协议：

1. `ready` 只表示 contract、scope、version、binding、provider dependency 和 runtime projection 在结构上可路由。
2. 官方 fixture 或组织自己的 tests、examples、审查记录，表示 provider 曾针对场景验证；Buildr v1 不提供通用行为认证框架。
3. 本次动作只有在 Agent 按 contract 完成披露与授权，并返回规定的 result evidence 后，才算执行成功。

用户 provider 的 `provides` 是组织对 conformance 的声明，不是 Buildr 对自然语言行为的证明。`Allowed Variations` 应明确 provider 可以自由选择的工具、步骤和 policy；contract 只保留跨实现不可丢失的安全与协作语义。
