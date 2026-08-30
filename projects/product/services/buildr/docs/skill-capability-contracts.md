# Skill Capability Contracts

Capability contract 用来描述多个 Skills 之间稳定、可替换的行为边界。它类似代码里的 interface：consumer 依赖 capability，Skill 通过 `provides` 成为 provider，manifest binding 选择当前实现。它更接近 interface + dependency injection，而不是 Skill-to-Skill 方法调用：consumer 不调用某个固定 Skill，Agent 根据当前 scope 和 binding 解析 provider，再结合 contract、provider playbook 和任务上下文完成真实协作。Contract 不规定命令、工具或内部步骤；这些仍由 provider 和组织习惯决定。

面向用户的完整机制称为“Agent 工作能力适配（Agent-managed Capability Adaptation）”。用户只需要表达“采用内部流程”“改成 feature 分支模式”“替换默认工作方式”等目标；Agent 使用 `capability-adaptation` 分析相关 Skill 和依赖、开发候选资产、验证 consumers，并在成功后完成 binding、sync 和 doctor。下面的 manifest 与 CLI 是 Agent 使用的底层实现原语，不是普通用户必须学习的操作步骤。

普通独立 Skill 不需要声明 capability。只有当一项动作确实需要被其他 Skill 组合、替换或诊断时，才应增加 contract。

Agent 判断的不是用户是否说出 capability 名字，而是目标行为是否满足以下任一条件：另一工作流无法在缺少其稳定保证或结果证据时安全继续、需要允许实现替换、修改或卸载需要跨 Skill 影响诊断。Agent 在执行期间同时读取多个 Skills，不足以单独构成 capability dependency。触达已有 contract 时优先在 `Allowed Variations` 内调整 provider；只有产生新的稳定协作边界时才创建 contract。

用户意图首先由 Agent runtime 的原生 Skill 发现机制处理：runtime 暴露 Skill description，Agent 根据用户目标选择并加载入口 Skill。Buildr CLI 不拦截 prompt，也不存在一个始终先于所有 Skills 运行的全局 capability dispatcher。入口 Skill 加载后，才读取 Buildr 注入的 binding evidence 解析其 capability dependencies。

产品入口 Buildr Skill 只在自身因 Buildr 管理意图被 Agent 命中后充当内部能力路由者，例如更新 workspace、调整工作方式或诊断 Buildr 能力。它不是“收尾”等所有专业意图的统一前置入口。`task-finish/v1` 是独立收尾方法入口；Task Environment、Git provider、verification 与 current knowledge 各自维护独立 authority，并只通过最小结果交接。

## 五种相关但不同的关系

| 关系 | 事实来源 | 表达什么 | 不表达什么 |
|---|---|---|---|
| Agent Skill 意图发现 | Agent runtime 暴露的 Skill description、用户目标和任务上下文 | 本次首先加载哪个入口 Skill | 不解析 capability provider，也不形成 manifest dependency edge |
| 能力目录 | manifest `contracts`、`provides`、`bindings` | 当前有哪些可声明、选择和替换的能力 | 不要求每项能力都存在 manifest consumer |
| Consumer dependency graph | installed Skills 的 `requires` | 哪些 consumer 缺少保证时 blocked，哪些可以 degraded | 不包含 description 命中或 Agent 临时读取多个 Skills |
| 产品入口内部路由 | 已加载的 Buildr Skill、routing evidence、当前 doctor graph | Buildr 管理意图在产品入口内部应交给哪项 selected capability | 不在所有用户意图之前运行，也不把产品入口登记成依赖全部 capabilities 的 consumer |
| Agent 执行协作 | contract、provider playbook、授权和任务上下文 | Agent 实际如何使用工具、判断结果并继续或停止 | 不等价于确定性函数调用，也不由结构 `ready` 证明成功 |

因此，一个 capability 可以已经登记、提供和绑定，只作为顶层可替换入口存在，而不出现在 consumer dependency graph 中。但 binding 只选择 provider，不会让 provider 自动被 Agent 命中：顶层 provider 还必须通过自己的 Skill description，或通过一个已经被加载的明确产品入口保持可发现。只有 manifest `requires` 才形成静态 consumer dependency edge。

## 完整实例：`buildr.git-operations/v1`

这项能力负责“为 consumer 已选定的一次 Git Operation 提供安全边界与最小 evidence”。它的完整结构如下：

```text
用户或上游 consumer 已明确 repository、operation 与 ref
  ↓ Agent runtime 根据 Skill description 或 consumer routing 发现 git-operations
读取 buildr.git-operations/v1 contract 与当前 Git 状态
  ↓
只执行已选 operation，或在授权、scope、range、冲突语义不明确时停止
  ↓ result evidence
operation、前后 branch/commit、适用 remote/ref/range、变化维度、部分 effects
```

### 1. Contract

`skills/contracts/buildr/git-operations/v1.md` 固定的是跨 provider 不可丢失的行为信封：

- consumer 必须提供 repository、operation、相关 refs、精确 content/commit scope 和授权 effects；
- provider 必须观察前后 identity、精确 staging、保留无关 dirty，并把 commit 与 push 分开；
- push 必须检查 destination 与 source 间会发布的完整 commit range，scope 外 unpublished commit 使操作 blocked；
- 已 push/共享 commit 冻结，不自动 stash、reset、rebase、merge、force push、改写共享历史或失败后换策略；
- Result 只包含适用的 identity、range、变化维度和实际 effects，部分失败必须保留现场。

Git Operations 的结果只是本次操作事实，不是 Candidate、Review 或 Verification 结论。`task-worktree` 只提供窄 Git checkout/branch/HEAD/clean/registration evidence；Task Environment 独占实际执行根、Runtime/CLI/依赖、projection、动态资源、ready、恢复和总 cleanup；Task Development/Verification 继续判断 Content Target 与 evidence applicability。各模块只通过最小 evidence 交接。

Task Record、Development、Verification与Review current records都由各自Application维护在Workspace SQLite中，不再提供metadata publication capability。Git Operations仍是普通Git内容与其他已选consumer的独立能力，但没有Task metadata provider、binding或consumer route。

### 2. Manifest 注册、provider、consumer 与 binding

```yaml
contracts:
  - id: buildr.git-operations
    version: 1
    path: contracts/buildr/git-operations/v1.md

skills:
  - id: git-operations
    provides:
      - capability: buildr.git-operations
        version: 1

bindings:
  - capability: buildr.git-operations
    version: 1
    provider: git-operations
```

`task-finish/v1` 指导智能体（Agent）组合已有 Git、业务工具、任务记录和资源能力；不要求任务、候选、研发交接或旧执行运行。写入前检查对象、授权和范围，写入后回读结果，删除前检查归属与内容保全。内容检查复用仍适用的结果，不建立统一验证门禁。

任务验证单独建模，是因为它既可以在 Task Environment 中执行，也可以在当前分支、无 Git Project 或非代码交付目标中执行。`buildr.task-environment/v1` 保护 Task 的执行资格与环境处置；`buildr.git-worktree-provider/v1` 只保护 Git checkout evidence；`buildr.task-verification/v3` 保护 Project capability 选择、transient execution 与 current Task Verification Result 的边界。Project `verification.yml` 是测试能力事实，不进入 `capabilities.yml`。

顶层验证provider不是只有用户主动说“验证”才加载。用户直接要求测试、耗时报告或初始化/更新测试声明时由description发现；正式实现任务到达stable Content Target后，由selected`buildr.task-development@2` provider形成policy并请求formal Verification。Skill读取v2 declaration，选择已有能力并把transient execution提炼成绑定Content Target的完整current Result；能力不存在时只报告coverage gap，不创建测试。Task Development只通过同一个Task Verification Application reader检查target/declarations与policy facts，Task Finish不路由或调用Verification。

`buildr.task-record/v2` 是正式 Task 顶层记录的薄能力，默认由 `task-manager` 提供。todo 只保存已接受意向，显式 activate 后才进入 active 研发路径；`open` 为 todo + active 查询态。Task Record 可以仅以 Task ID 关联多个终态且已有 current 复盘的来源，并派生反向后续列表；不保存 action item、复盘正文或执行计划。Parent/Child 与所有专业 authority 边界不变。Buildr Web 只观察和有限维护已有 Task，不创建或激活。

`buildr.task-development@2` 默认由 `task-development` 提供，并 required 消费 Task Record、Task Environment、Task Review、Task Verification 与 current knowledge v2。从proposal、design或直接实现等首个正式研发动作开始，provider通过随包内部driver调用唯一Task Development Application，独占closed Receipt v3、planning聚合事实、可选Parent Plan/planned Contribution/final acceptance、Content Target、verification policy、Task Candidate/generation、decision与不可变研发/Contribution handoff；它只引用OpenSpec/Review/Verification的专业identity，不复制正文或Result。通用Development不注册公共CLI；Parent coordination另提供只调用同一Application的窄CLI/HTTP，Buildr Web动态消费同一read model。OpenSpec是`0..N`可选关联，Git、Node/npm、Product registry、Task Retrospective和具体测试框架都不进入通用contract。v1/v2 Receipt只读归一化为Parent facts absent，不新增表或backfill。

`buildr.task-environment/v1`默认由`task-environment`提供。Project `preparation.yml`长期声明Project-wide或Service-scoped Recipe；Agent根据正式Task完整Project/Service scope及构建/验证事实提交Plan Request，Application解析Declaration/Recipe identity并保存Task Plan快照，通过公共`plan record|inspect`和`prepare|inspect|cleanup`CLI执行，消费`buildr.task-environment-plan-result/v2`与`buildr.task-environment-result/v4`。核心不枚举技术栈或package manager，只执行closed Recipe中的无shellStep并保存分层current/prepared identity。CLI`inspect`只读实时观察，Buildr Web GET只读SQLite current。Git隔离是可选实现细节；所有消费者复用同一Application/read model，不直接解析Receipt或写第二份环境状态。

`declaration-intake`不是capability provider，而是Preparation与Verification长期声明的Agent路由入口。它在注册、首次Task、入口变化或专业gap时只读发现候选，用户确认精确diff后再交给两个既有owner Skill；不新增统一contract、binding、store或writer。`capabilities.yml`和`commands.yml`只作为外部readiness诊断，Intake不安装或修改Skill/provider/CLI。

### 3. Resolver 与 readiness

Buildr 从当前 scope 向 workspace root 查找最近的显式 binding，校验 contract version、provider `provides`、runtime 可用性和 provider 自身的 required dependencies。当前 binding 选择 `git-operations`，供明确选择的 Git 动作使用；ready 只表示可路由，不证明交付成功。provider 不可用只影响需要它的 Git 动作，收尾继续处理其他安全工作。

### 4. Runtime evidence

render/sync会在`task-development`和`task-finish`的runtime派生版本中注入受管binding block，记录contract path/digest、dependency mode、selected provider、provider runtime path、scope、readiness、reason和provenance。源Skill不会被写入这段接线信息。

### 5. Agent 实际执行

正式实现内容稳定后，Agent runtime根据description命中`task-development`，依次完成current knowledge/Change fixed point、Planning gate、Content Target/policy、formal Verification、Candidate、Completion Review、decision和handoff。用户随后说“收尾”时才加载`task-finish`；Agent根据最终内容形成语义message，ready Environment中的current handoff只调用一次`buildr task finish run --task ... --commit-message ...`，五阶段carrier/delivery/cleanup事实、冻结message与暂态恢复由产品执行器持有。已有run的resume不重新提供message。没有ready Environment或current handoff时正式产品run直接阻塞；retained metadata-only独立安全交接不伪装成Environment，也不得stage无关dirty state。

产品中的verification领域服务遵守`buildr.task-verification/v3`：已有Result只有在Content Target与declaration identity都匹配且policy所需fact/coverage gap完整时，才可供Development freeze消费。`not-passed`或coverage gap保持专业事实，只有Development在Candidate/Completion之后取得绑定精确Result digest与scope的用户风险接受才可proceed；Finish不能改写或补齐。transient execution evidence在提炼Result后由对应验证workflow安全清理。

`buildr.task-retrospective/v2`默认由`task-retrospective`提供。处理时先返回原始Markdown/current digest，再以当前项目事实重新判断和拆分方向：失效项说明理由，有效项关联已有 todo/active Task 或创建 data-only todo。不创建 action item ID，也不自动生成 Change/提案/设计。所有有效方向均已关联后才标记 handled；无有效方向则标记 no-action。Result current row 与处置状态仍由 Retrospective Application 独占。

### 6. 用户替换实现

若组织创建 `internal-git` 并声明提供同一 contract，安装它不会改变用户的“收尾”入口。产品执行器只能使用已具备稳定确定性 application service 的实现；需要 Agent completion 或改变 fast-forward/push 授权语义的 provider 不能被直接接入固定正常路径。

旧收尾执行写入口已退役，历史只读和必要资源安全能力保留。沿用 `buildr.task-finish/v1` 的独立方法契约，不创建新总入口或交付状态库。

这里有两个不同的版本概念：

- Workspace manifest 会从 v1/v2 兼容读取并在受管 mutation 中升级为 `buildr.skills/v3`，保存 workspace/asset/source identity。legacy Project manifest 已不受支持，当前 Buildr 不提供自动迁移；升级前需使用旧版本完成迁移，或人工审阅后整理到 workspace `skills/`。当前命令保持原目录 bytes 不变并 fail closed。
- contract 路径中的 `v1.md` 和 frontmatter 中的 `version: 1` 表示 capability contract 的第 1 个主版本，不随 manifest schema 升级；只有 contract 出现不兼容语义变化时才提升主版本。

## Contract 文档

Contract Markdown 使用最小 frontmatter：

```markdown
---
schemaVersion: buildr.capability-contract/v1
id: example.git-operations
version: 1
---

# Git Operations

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
  - id: example.git-operations
    version: 1
    path: contracts/example/git-operations/v1.md
bindings:
  - capability: example.git-operations
    version: 1
    provider: internal-git
skills:
  - id: internal-git
    assetIdentity: workspace:7cf5b7af-38cc-5cb4-86f7-6a45a45e9012:skill:internal-git
    sourceIdentity: workspace:7cf5b7af-38cc-5cb4-86f7-6a45a45e9012:internal-git
    path: internal-git
    provides:
      - capability: example.git-operations
        version: 1
  - id: task-finish
    path: task-finish
    requires:
      - capability: example.git-operations
        version: 1
        mode: optional
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
  --provides example.git-operations@1

buildr skills add task-finish --source ./task-finish --target <workspace> --replace \
  --requires example.git-operations@1:optional
```

替换 provider 必须使用 capability binding，而不是冒用 builtin Skill id：

```bash
buildr skills bind example.git-operations@1 \
  --provider internal-git --scope . --target <workspace>

buildr skills unbind example.git-operations@1 \
  --scope . --target <workspace>
```

`skills add --replace` 只替换同一 Skill 资产条目，不表示 provider substitution。会移除或改绑当前 selected provider 的 mutation 会先披露受影响的 required/optional consumers，并在写入后由 doctor 收敛结构状态。

## Conformance 的三个层次

Buildr 刻意不把 Agent contract 过度约束成调用协议：

1. `ready` 只表示 contract、scope、version、binding、provider dependency 和 runtime projection 在结构上可路由。
2. 官方 fixture 或组织自己的 tests、examples、审查记录，表示 provider 曾针对场景验证；Buildr v1 不提供通用行为认证框架。
3. 本次动作只有在 Agent 按 contract 完成披露与授权，并返回规定的 result evidence 后，才算执行成功。

用户 provider 的 `provides` 是组织对 conformance 的声明，不是 Buildr 对自然语言行为的证明。`Allowed Variations` 应明确 provider 可以自由选择的工具、步骤和 policy；contract 只保留跨实现不可丢失的安全与协作语义。
