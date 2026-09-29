# Agent Runtime Adapters

本文是 Buildr 已接入 Agent runtime adapter 的权威说明。机器可读事实始终以 `buildr runtime list --json` 为准；本文解释每个 adapter 如何把标准 `AGENTS.md` 与 Skills 源资产接入目标 Agent。

当前公开格式为 `buildr.runtime-list/v3` 和 `buildr.doctor/v2`。运行时清单只登记 `agents-standard` 文件约定与已注册的专有例外；诊断（Doctor）的标准检查结果从旧 `runtime.codex` 改为 `runtime.agentsStandard`，同时保留请求身份、实际 `adapterId` 与选择原因。这不是只增加字段的兼容更新；消费者须按 `schemaVersion` 切换解析，不将标准结果冒充 Codex 专属安装或加载证据。`v3` 相对 `v2` 移除了 `cursor`、`qoder`、`trae`、`trae-work`、`workbuddy` 五个专用适配器（Adapter）及其安装/版本探测字段。

新增 adapter 的调查与实现流程见 [Agent Runtime Adapter 接入指南](../../../knowledge/docs/reference/agent-runtime-adapter-contribution.md)，可交给目标 Agent 的采集问题见 [调研 Prompt](../../../knowledge/docs/reference/agent-runtime-adapter-contribution.md)。

## 使用方式

```bash
buildr runtime list --json
buildr init --agent <agent> --target <workspace>
# 已初始化 workspace
buildr sync <agent> --target <workspace>
buildr doctor --agent <agent> --target <workspace> --json
```

运行时身份 `runtimeId` 与文件适配器（Adapter）身份 `adapterId` 分开：`codex`、`dsh`、`cursor`、`qoder`、`trae`、`trae-work`、`workbuddy` 以及未登记但语法有效的品牌默认采用 `agents-standard`，仍保留真实请求身份，不冒用其他品牌，也不因身份报错。品牌未知时可省略参数。没有显式选择时保留唯一既有受管方式，无既有方式才默认标准；多个不等价方式时写入前要求明确选择。

显式 `--adapter <adapter-id>` 只选择文件约定，必须是已登记的适配器（Adapter）；无效值在写入前报错。已选实现发生冲突、缺失或执行失败时不切换实现，也不退回纯源资产流程。`buildr init` 默认完成标准或既有接入的完整同步；只需源资产时使用 `buildr init --source-only`，不能与运行时或适配器（Adapter）选择混用。

当前宿主身份与投射目标是不同事实。普通当前环境操作从宿主明确身份选择 `<agent>`；用户可以显式维护其他 runtime。Skill discovery root、generated marker、receipt，以及 Doctor 的 `requested`、`selected`、`detectedAgents` 只描述投射或本次检查，不能证明读取者身份。产品入口 Buildr Skill 因此不注入 adapter 专属身份或固定维护命令。

Agent runtime adapter在需要时即时解析runtime source root、projection target与identity。文件系统投射成功不证明真实Agent session已加载候选内容；需要验证runtime发现、加载或激活机制时，由Agent按Project测试地图调用相应项目测试，并在开发完成后的Task验证报告中记录有意义结论。普通编辑、构建或测试不受统一环境许可约束。

## 支持矩阵

| Adapter id | Surface | Rules 接入 | Skills 接入 | 生效/刷新 | 兼容证据 |
|---|---|---|---|---|---|
| `agents-standard` | 宿主相关 | 原生递归 `AGENTS.md` | `.agents/skills/<skill-id>` | 宿主相关（`host-dependent`） | 标准文件约定与契约（Contract）/一致性（Parity）测试 |
| `claude-code` | CLI | 每个 source 同目录 `CLAUDE.md` reference bridge | `.claude/skills` | 新会话 | 官方文档证明的宿主原生能力缺口与既有契约（Contract）/一致性（Parity）测试 |

`claude-code` 是当前唯一注册的专有例外（Exception）：官方文档证明它不读取 `.agents/skills/`，且原生 `AGENTS.md` 规则路径受版本门槛与既有 `CLAUDE.md`/`CLAUDE.local.md` 遮蔽条件限制，因此保留一行 `@AGENTS.md` 引用桥与 `.claude/skills/` 技能根。其他品牌没有专用适配器（Adapter）；需要接入新的专有例外时，必须先给出可审计的宿主原生能力缺口证据，见 [Agent Runtime Adapter 接入指南](../../../knowledge/docs/reference/agent-runtime-adapter-contribution.md)。

兼容证据说明 adapter 路径和机制的来源，自动 contract/parity 证明 Buildr 能按契约生成、检查和安全维护投射；它们都不表示目标 Agent 已在当前 workspace、当前版本或当前会话中真实加载文件。

所有表中 Skills root 同时具有 workspace 与 user 两个 destination：前者相对 `--target` 工作目录，后者相对当前用户目录。adapter 还声明可观测 discovery roots、`complete|partial` inventory evidence、未知 admin/system/plugin 边界和 activation；当前 adapters 的内部来源均只能部分观察，因此成功 render 只证明可观测范围内没有冲突。该 `partial` 事实保留在 runtime scope 的 `skillInventoryEvidence` 中，不作为健康 warning 或 repair action。Buildr 只以自身计划投射或 receipt 已管理的 Skill identity 为候选检查可观测同名项，不盘点无关 runtime Skills；它使用 `buildr.skill-projection/v2` receipt 记录 destination、asset/source identity、source workspace、source/render digest 和文件 inventory。Skill 的 executable intent 从最近 Git repository 的 index 读取并在单次进程内按 index identity 复用；Git 不可用时 fail closed，不能静默降级为另一份 receipt。Windows 仍在 receipt 中保留该可移植 intent，但不以本地 POSIX mode 判定 runtime stale。外部等价、其他 owner 或同名异内容均不由 `--replace` 接管。

标准共享根将技能（Skill）写入一级 `.agents/skills/<skill-id>/SKILL.md`，源目录仍可嵌套，随附文件的相对路径不变。所有消费标准 `.agents/skills/` 的运行时身份（包括 `cursor`、`trae` 等已退役品牌的 `runtimeId`）共用 `agents-standard` 文件归属，不再有按品牌的技能根。通用产品技能（Skill）省略 `runtimes`；历史产品拥有的完整七品牌列表在维护时升级为通用，用户缩小的列表、用户资产、绑定与卸载状态保留。限制按真实 `runtimeId` 判断，不按共享适配器（Adapter）授予品牌许可。

所有权回执（Ownership Receipt）保存在 `<workspace>/.buildr/agent-runtime/workspace/<ownership-id>/skill-projection-ownership-receipts/` 或 `<user-home>/.buildr/agent-runtime/user/<ownership-id>/skill-projection-ownership-receipts/`，不放进消费目录。共享标准根的 `<ownership-id>` 为 `agents-standard`。

### 所有权与退役处理

已退役适配器的回执（Receipt）与投射由退役处理清理，规则与既有受管操作一致：能由回执（Receipt）或受管标记证明属于 Buildr 的厂商规则桥、厂商技能镜像与回执被删除；内容漂移、含未知额外文件、缺少回执或来源身份不一致时保留文件，并在 doctor 与检查结果中说明具体路径与原因；无法安全分离时整组零写入。处理幂等，重复执行不产生新增、更新或误删，也不凭生成标记接管未知内容。共享标准根的投射（例如 `cursor` 曾写入的 `.agents/skills/`）不由退役处理删除，仍由标准适配器自身的孤儿清理管辖。

退役处理的范围仅限工作空间（Workspace）：只在标准适配器（`agents-standard`）的全工作区受管操作（`render`、`sync` 与组件修复）中执行，局部 `--scope` 与显式选择其他适配器时不产生任何删除或报告，避免半清理与归属歧义。用户层（`<user-home>/.qoder`、`.trae`、`.codebuddy` 等）的既有镜像既不属于工作区目标根，也不在受管路径校验允许范围内，因此既不删除也不报告；需要清理时由人显式处理。

共享根不会把其他品牌仍有启用来源的技能（Skill）当作孤儿删除；相同技能（Skill）的品牌限制导致正文或能力绑定（Capability Binding）不同，必须报告共享内容冲突，不能后写覆盖。迁移后不要交替使用旧版 Buildr 管理同一投射；回退需恢复完整的操作前文件与回执（Receipt）备份，不能只删除新回执。工作空间（Workspace）维护不自动迁移用户层。

Skill 校验分为两层：可移植核心和 Codex 发布都只要求有效 `SKILL.md`，其 `name` 与 `description` 承担发现和路由；随附目录均为可选。Codex/OpenAI profile 将 `agents/openai.yaml` 视为可选 UI extension：文件存在时校验 `display_name`、`short_description`、`default_prompt` 等结构，缺失时不阻塞发布、发现或 render，也不由 Buildr 机械生成或反写。其他 adapter 会随完整目录保留已有文件，但不解释它。Skill 的模板、脚本等执行资源始终相对于当前 runtime `SKILL.md` 所在目录解析，核心行为不能依赖 vendor metadata。

Buildr 当前不定义或维护真实 Agent marker smoke、品牌通过状态或 GUI automation。未来如重新引入，必须独立设计版本、surface、证据失效、执行 owner 与当前机器配置模型。

## Claude Code (`claude-code`)

- Buildr 在每个 `AGENTS.md` 同目录生成受管 `CLAUDE.md` reference bridge，并将 Skills/install plans 投射到 `.claude/`。
- Rules 与 Skills 在新会话加载；checker 比较 bridge、Skills 和 install plans 的 missing/stale/conflict/orphan 状态。
- 证据状态为既有 adapter contract/parity 与产品验证基线。

## 标准默认 (`agents-standard`)

- 原生使用递归作用域的 `AGENTS.md`，不另写规则（Rule）桥接文件；技能（Skill）和安装计划使用 `.agents/`。检查器（Checker）验证源规则（Rule）和计划文件的实际状态。
- 不知道宿主品牌时不伪造 `runtimeId`。默认生效方式为宿主相关（`host-dependent`），安装、发现与会话加载未确认；未知有效品牌可以准备标准文件，但不能据此报告品牌已经验证。
- 只有文件格式或作用域语义不同才需要专用实现。与标准相同的品牌共用标准描述符（Descriptor）和文件契约（Contract），刷新、可选资源校验与探测另记为宿主资料（Host Profile）。

### Codex (`runtimeId: codex`)

- Codex 选择 `agents-standard`，不再拥有独立文件适配器（Adapter）；原生读取 `AGENTS.md`，技能（Skill）使用 `.agents/skills/<skill-id>/`。
- 已知规则（Rule）按路径读取、技能（Skill）在新会话发现；这些说明不证明当前会话已经加载。
- 宿主资料（Host Profile）只校验已提供的可选 `agents/openai.yaml`，缺失不阻塞，也不生成替代文件。标准描述符（Descriptor）不承载这份厂商元数据（Vendor Metadata）。
- 隔离候选可直接执行适用测试，不需要旧研发回执。正式自举激活仍按该工作空间（Workspace）的唯一执行器办理；本文不报告本轮激活结果。

### DSH (`runtimeId: dsh`)

- DSH 选择同一 `agents-standard`，不是 Codex 别名。当前宿主资料（Host Profile）说明根规则（Rule）与成功文件操作后的嵌套规则（Rule）发现，以及最近 Git 根目录下一层技能（Skill）目录发现。
- 已知目录观察更新在后续智能体（Agent）步骤生效，不代表已经加载的技能正文会被自动替换。这是宿主机制说明，不是当前会话激活证据，也不要求修改 DSH。

## 已退役的厂商专用适配器

以下五个适配器已退役，不再注册为 supported adapter：

| 退役 adapter id | 原 Rules 接入 | 原 Skills 根 | 退役判据 |
|---|---|---|---|
| `cursor` | 各 source scope 的 `.cursor/rules/buildr.mdc` | `.agents/skills` | 官方文档声明原生读取项目根与子目录 `AGENTS.md`，并从 `.agents/skills/`（含嵌套目录）自动加载技能 |
| `qoder` | `.qoder/rules/buildr/*.md` | `.qoder/skills` | 官方文档声明 IDE 规则兼容 `AGENTS.md` |
| `trae` | 各 source scope 的 `.trae/rules/buildr.md` | `.agents/skills` | 标准协议覆盖；不再维护品牌专属规则文件 |
| `trae-work` | root `CLAUDE.local.md` reference bridge | `.trae/skills` | 标准协议覆盖；不再维护品牌专属技能根与根引用桥 |
| `workbuddy` | root `CODEBUDDY.md` reference bridge | `.codebuddy/skills` | 标准协议覆盖；不再维护品牌专属技能根与根引用桥 |

- 这五个品牌仍是有效运行时身份（`runtimeId`）：`buildr sync cursor`、`buildr doctor --agent qoder` 等命令继续可用，文件投射使用 `agents-standard`，请求身份被保留，也不因身份报错。
- `--adapter` 不再接受这五个取值，传入时在写入前明确失败并报告当前支持的适配器（Adapter），不静默回退。
- 既有厂商投射由退役处理按所有权证明清理，见上文「所有权与退役处理」。
- 宿主规则（Rule）生效前提：宿主必须原生读取工作目录的 `AGENTS.md`。TRAE 还需在设置中启用 `AGENTS.md` 上下文；TRAE Work 与 WorkBuddy 的公开文档未证明完整的 project guidance 与工作目录技能发现机制，其规则生效不由本产品保证。Buildr 只准备标准文件，不声称宿主已加载。

## Checker 与限制

`runtime check`/doctor 分别报告 projection、runtime source/projection identity 和 activation/reload guidance。它们能证明 Buildr 计划是否完整、目标是否 missing/stale/conflict/orphan，但不能从文件系统单独证明 GUI Agent 已加载内容。产品不再执行品牌安装与版本探测：这两类探测没有真实生产者，删除后不再报告品牌安装或版本事实，也不把未探测的项目报告为已验证。需要真实 session 证据时交给 Task Verification；缺少这类证据本身不阻塞普通 Environment ready。

- 所有 runtime 目标都受统一路径保护、symlink 防护、零写入冲突预检、managed ownership、orphan cleanup 和幂等 reconcile 约束。
